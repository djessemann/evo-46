# E.V.O. for iPad

Plays your copy of **E.V.O.: The Theory of Evolution** (PC-98, 46 OkuMen English patch) on iPad, with touch controls. It runs a PC-98 emulator in the browser and works offline once installed.

The game itself is **not** in this repo. You pick your own copy the first time you open the app, and it stays on your iPad.

## Put it on GitHub

1. On github.com, make a new repository. Name it `evo`. Public is fine (there's no game in it).
2. Click **uploading an existing file**. Drag in everything from this folder, including the `emulator` and `icons` folders. Commit.
3. Go to **Settings → Pages**. Under "Build and deployment", pick **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. Wait a minute. The app will be at `https://<your-username>.github.io/evo/`.

Never upload the `.hdi` or the zip. That would share the game.

## Install on iPad

1. Open the link in Safari.
2. Tap **Share → Add to Home Screen**.
3. Open it from the Home Screen. Tap **Choose game file** and pick the E.V.O. zip (or the `.hdi` inside it) from Files.
4. Tap **Play**.

Use the Home Screen version. Safari can clear data for websites you haven't opened in a while, but it keeps Home Screen apps' data.

## Controls

| On screen | What it does |
|---|---|
| Number keys 1–9 | Move. Slide your thumb across them to change direction. |
| Return | Confirm, move text along |
| Space | Open commands (Chart EVO, Save EVO, and so on) |
| Esc | Back out |

A hardware keyboard works too. Arrow keys move.

Portrait gives you the biggest picture.

## Saving

Use **Save EVO** in the game's command menu. The app stores the disk on your iPad a moment after the game writes to it. You'll see "Disk saved" with the time under the screen.

**Menu → Back up save disk** makes a copy you can keep in Files. **Restore from backup** puts it back.

## Updating the app

If any file here changes, bump `VERSION` in `sw.js` (for example `evo-v1` → `evo-v2`) and upload again. iPads pick up the new version the next time the app opens online.

## Credits

- Game: Enix / Almanic, 1990. English translation by 46 OkuMen.
- Emulator: [np2-wasm](https://github.com/irori/np2-wasm) by irori, based on Neko Project II by the NP2 developer team. BSD 3-Clause license, see `emulator/LICENSE-np2-wasm.txt`.
- Emulator font (`emulator/font.bmp`): built by np2-wasm from free fonts (Sazanami-based SimK font.bmp, Shinonome). Modified BSD / public domain.
- Interface font: DotGothic16 by Fontworks, via Google Fonts (SIL Open Font License).
