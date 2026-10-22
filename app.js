import { NP2 } from './emulator/np2-wasm.js';

const DISK = 'evo.hdi';
const CPU_MULT = 4;          // 2.4576 MHz x 4 ≈ 9.8 MHz, like the PC-9801 the game was made for
const SAVE_DELAY = 1500;     // wait this long after the last disk write before storing
const REPEAT_DELAY = 220;    // held direction: pause before repeating
const REPEAT_RATE = 65;      // held direction: time between steps

const $ = (id) => document.getElementById(id);
const app = $('app');
const intro = document.querySelector('.intro');

let np2 = null;
let saveTimer = null;
let dirty = false;
let halted = false;          // set before a reload so nothing overwrites storage
let resumeAfterMenu = false;

class UserError extends Error {}

/* ---------------------------------------------------------------
   Storage (IndexedDB). Keys: "original" = untouched disk,
   "disk" = the disk with your saves on it.
---------------------------------------------------------------- */

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open('evo', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('files');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function tx(mode, fn) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const loadFile = (key) => tx('readonly', (s) => s.get(key));
const storeFile = (key, value) => tx('readwrite', (s) => s.put(value, key));
const deleteFile = (key) => tx('readwrite', (s) => s.delete(key));

function toBuffer(u8) {
  return (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) ? u8.buffer : u8.slice().buffer;
}

/* ---------------------------------------------------------------
   Reading the game file (zip or .hdi)
---------------------------------------------------------------- */

async function readGameFile(file, onStep) {
  const buf = await file.arrayBuffer();
  if (buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === 0x04034b50) {
    onStep?.('Unpacking the zip…');
    return checkHdi(await extractHdi(buf));
  }
  return checkHdi(new Uint8Array(buf));
}

async function extractHdi(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new UserError("That zip looks damaged. Download it again, or pick the .hdi file itself.");

  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const names = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = names.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (!/\.hdi$/i.test(name) || name.includes('__MACOSX')) continue;

    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    if (method === 0) return data.slice();
    if (method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new UserError('This iPad can’t unpack zips here. Update iPadOS, or unzip it in Files and pick the .hdi file.');
      }
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new UserError('That zip uses a format this app can’t open. Unzip it in Files and pick the .hdi file.');
  }
  throw new UserError('That zip has no .hdi disk in it. Pick the E.V.O. zip or its .hdi file.');
}

function checkHdi(u8) {
  const bad = new UserError('That isn’t a PC-98 hard disk file. Pick the E.V.O. zip or its .hdi file.');
  if (u8.length < 1_000_000) throw bad;
  const dv = new DataView(u8.buffer, u8.byteOffset, 32);
  const headerSize = dv.getUint32(8, true);
  const dataSize = dv.getUint32(12, true);
  const sectorSize = dv.getUint32(16, true);
  if (headerSize + dataSize !== u8.length || ![256, 512, 1024].includes(sectorSize)) throw bad;
  return u8;
}

/* ---------------------------------------------------------------
   Intro screen
---------------------------------------------------------------- */

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function setBusy(on) { intro.classList.toggle('busy', on); }

function showIntro(hasGame) {
  app.dataset.view = 'intro';
  app.dataset.hasGame = String(hasGame);
}

$('pick').addEventListener('click', () => $('file').click());

$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  setBusy(true);
  setStatus('Reading the file…');
  try {
    const hdi = await readGameFile(file, setStatus);
    setStatus('Saving it to this iPad…');
    await storeFile('original', toBuffer(hdi));
    await storeFile('disk', toBuffer(hdi));
    navigator.storage?.persist?.().catch(() => {});
    setStatus('');
    showIntro(true);
  } catch (err) {
    console.error(err);
    setStatus(err instanceof UserError ? err.message
      : 'Couldn’t store the game on this iPad. Free up some space and try again.', true);
  } finally {
    setBusy(false);
  }
});

$('play').addEventListener('click', start);

/* ---------------------------------------------------------------
   Emulator
---------------------------------------------------------------- */

async function start() {
  setBusy(true);
  setStatus('Starting…');
  try {
    const disk = await loadFile('disk');
    if (!disk) { setStatus(''); showIntro(false); return; }
    app.dataset.view = 'play';
    np2 = await NP2.create({
      canvas: $('canvas'),
      clk_mult: CPU_MULT,
      use_menu: false,
      no_mouse: true,
      onDiskChange: scheduleSave,
    });
    np2.addDiskImage(DISK, new Uint8Array(disk));
    np2.setHdd(0, DISK);
    np2.run();
    resumeAudio();
    setStatus('');
  } catch (err) {
    console.error(err);
    showIntro(true);
    setStatus('The game didn’t start. Close the app fully and open it again.', true);
  } finally {
    setBusy(false);
  }
}

function resumeAudio() {
  const ctx = np2?.module?.SDL2?.audioContext;
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

/* ---------------------------------------------------------------
   Saving progress. The game writes its EVO files to the disk;
   we copy the disk into storage shortly after each write.
---------------------------------------------------------------- */

function scheduleSave() {
  if (halted) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, SAVE_DELAY);
}

async function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!np2 || !dirty || halted) return;
  dirty = false;
  const saved = $('saved');
  try {
    await storeFile('disk', toBuffer(np2.getDiskImage(DISK)));
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    saved.textContent = `Disk saved ${time}`;
    saved.classList.remove('error');
  } catch (err) {
    console.error(err);
    dirty = true;
    saved.textContent = 'Couldn’t save. Free up space on this iPad.';
    saved.classList.add('error');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
  else if ($('menu').open && np2?.state === 'running') setTimeout(() => np2.pause(), 0);
});
window.addEventListener('pagehide', () => persist());

/* ---------------------------------------------------------------
   Keys. The game reads the PC-98 ten-key pad, so every direction
   is sent as a numpad key.
---------------------------------------------------------------- */

const KEYS = {
  up: ['Numpad8', '8', 104], down: ['Numpad2', '2', 98],
  left: ['Numpad4', '4', 100], right: ['Numpad6', '6', 102],
  ul: ['Numpad7', '7', 103], ur: ['Numpad9', '9', 105],
  dl: ['Numpad1', '1', 97], dr: ['Numpad3', '3', 99],
  ret: ['Enter', 'Enter', 13], space: ['Space', ' ', 32], esc: ['Escape', 'Escape', 27],
};

function fire(type, [code, key, keyCode]) {
  const ev = new KeyboardEvent(type, {
    code, key, bubbles: true, cancelable: true,
    location: code.startsWith('Numpad') ? 3 : 0,
  });
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  document.dispatchEvent(ev);
}

function tap(dir) {
  fire('keydown', KEYS[dir]);
  setTimeout(() => fire('keyup', KEYS[dir]), 45);
}

// Wake audio on any touch (iPad keeps it muted until you touch something)
document.addEventListener('pointerdown', resumeAudio, true);
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

/* Direction pad: one finger, slide to change direction */
const pad = $('pad');
const padKeys = Object.fromEntries([...pad.querySelectorAll('[data-dir]')].map((el) => [el.dataset.dir, el]));
const SECTORS = ['right', 'dr', 'down', 'dl', 'left', 'ul', 'up', 'ur'];
let padPointer = null;
let padDir = null;
let delayTimer = null;
let repeatTimer = null;

function setDir(dir) {
  if (dir === padDir) return;
  clearTimeout(delayTimer);
  clearInterval(repeatTimer);
  if (padDir) padKeys[padDir].classList.remove('down');
  padDir = dir;
  if (!dir) return;
  padKeys[dir].classList.add('down');
  tap(dir);
  delayTimer = setTimeout(() => { repeatTimer = setInterval(() => tap(dir), REPEAT_RATE); }, REPEAT_DELAY);
}

function dirFromPoint(e) {
  const r = pad.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.12) return padDir; // centre: keep current direction
  const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTORS[sector];
}

pad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (padPointer !== null) return;
  padPointer = e.pointerId;
  pad.setPointerCapture(e.pointerId);
  const r = pad.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) >= r.width * 0.12) setDir(dirFromPoint(e));
});
pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) setDir(dirFromPoint(e)); });
const padRelease = (e) => { if (e.pointerId !== padPointer) return; padPointer = null; setDir(null); };
pad.addEventListener('pointerup', padRelease);
pad.addEventListener('pointercancel', padRelease);
pad.addEventListener('lostpointercapture', padRelease);

/* Return, Space, Esc: held while your finger is down */
for (const btn of document.querySelectorAll('[data-key]')) {
  const key = KEYS[btn.dataset.key];
  let pointer = null;
  let downAt = 0;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (pointer !== null) return;
    pointer = e.pointerId;
    btn.setPointerCapture(e.pointerId);
    downAt = performance.now();
    btn.classList.add('down');
    fire('keydown', key);
  });
  const release = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    btn.classList.remove('down');
    const held = performance.now() - downAt;
    setTimeout(() => fire('keyup', key), Math.max(0, 50 - held));
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
}

/* Hardware keyboard: arrow keys become ten-key directions */
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, (e) => {
    if (!e.isTrusted || $('menu').open) return;
    const dir = ARROWS[e.code];
    if (!dir) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fire(type, KEYS[dir]);
  }, true);
}

/* ---------------------------------------------------------------
   Menu
---------------------------------------------------------------- */

const menu = $('menu');

$('menu-btn').addEventListener('click', () => {
  resumeAfterMenu = np2?.state === 'running';
  if (resumeAfterMenu) np2.pause();
  persist();
  menu.showModal();
});

menu.addEventListener('close', () => {
  document.activeElement?.blur?.();
  if (resumeAfterMenu && np2 && !halted) np2.run();
});

function reloadApp() {
  halted = true;
  clearTimeout(saveTimer);
  location.reload();
}

$('do-backup').addEventListener('click', async () => {
  await persist();
  const disk = await loadFile('disk');
  if (!disk) return;
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([disk], `evo-save-${date}.hdi`, { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$('do-restore').addEventListener('click', () => $('restore-file').click());

$('restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const hdi = await readGameFile(file);
    if (!confirm('Replace your current progress with this backup?')) return;
    halted = true;
    await storeFile('disk', toBuffer(hdi));
    reloadApp();
  } catch (err) {
    console.error(err);
    alert(err instanceof UserError ? err.message : 'Couldn’t read that backup.');
  }
});

$('do-reset').addEventListener('click', async () => {
  await persist();
  menu.close();
  np2?.reset();
});

$('do-erase').addEventListener('click', async () => {
  if (!confirm('Erase all progress? Your EVO files will be gone. Back up first if you want to keep them.')) return;
  halted = true;
  const original = await loadFile('original');
  if (original) await storeFile('disk', original);
  reloadApp();
});

$('do-remove').addEventListener('click', async () => {
  if (!confirm('Remove the game from this iPad? Your progress goes with it.')) return;
  halted = true;
  await deleteFile('disk');
  await deleteFile('original');
  reloadApp();
});

/* Screen shape */
const shape = $('shape');
function applyShape(fourByThree) {
  app.dataset.shape = fourByThree ? '4x3' : 'raw';
  shape.checked = fourByThree;
}
let savedShape = null;
try { savedShape = localStorage.getItem('evo.shape'); } catch { /* storage blocked */ }
applyShape(savedShape !== 'raw');
shape.addEventListener('change', () => {
  applyShape(shape.checked);
  try { localStorage.setItem('evo.shape', shape.checked ? '4x3' : 'raw'); } catch { /* ignore */ }
});

/* ---------------------------------------------------------------
   Start up
---------------------------------------------------------------- */

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

loadFile('disk')
  .then((disk) => showIntro(!!disk))
  .catch(() => {
    showIntro(false);
    setStatus('This browser is blocking storage. Turn off Private Browsing and reload.', true);
  });

// Hooks for testing
window.evo = { get np2() { return np2; }, persist, tap };
