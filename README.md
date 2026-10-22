# E.V.O. for iPad

Plays your copy of **E.V.O.: The Theory of Evolution** (PC-98, 46 OkuMen English patch) on iPad, with touch controls. It runs a PC-98 emulator in the browser and works offline once installed.

The game itself is **not** in this repo and must not be added to it. This repo is public and so is the GitHub Pages site, so anything committed here is downloadable by anyone. You pick your own copy the first time you open the app, and it stays on your iPad.

What is here:

- The app (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `emulator/`, `icons/`).
- `E.V.O. - The Theory of Evolution v1.1.2 Complete.zip`: the 46 OkuMen English translation patch, patcher, and manual. No game files inside.
- `.github/workflows/pages.yml`: publishes the app to GitHub Pages on every push to `main`.

## Going live

1. Merge to `main`. The workflow runs and tries to turn on Pages by itself.
2. If the first run fails, go to **Settings → Pages** and set **Source** to **GitHub Actions**, then re-run the workflow from the **Actions** tab.
3. The app is at `https://djessemann.github.io/evo-46/`.

The workflow copies only the app files to the site. The zip and anything else in the repo are not published.

## Install on iPad

1. Open the link in Safari.
2. Tap **Share → Add to Home Screen**.
3. Open it from the Home Screen. Tap **Upload HDI** and pick your E.V.O. `.hdi` (or a zip with the `.hdi` inside it) from Files.
4. Tap **Play**.

Use the Home Screen version. Safari can clear data for websites you haven't opened in a while, but it keeps Home Screen apps' data.

The app wants the patched hard disk image (`.hdi`). Patch it first with `pachy98.exe` from the zip (Windows) or the xdelta files in `Mac+Linux Patches`.

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

If any app file changes, bump `VERSION` in `sw.js` (for example `evo-v1` → `evo-v2`) before pushing. iPads pick up the new version the next time the app opens online.

## Credits

- Game: Enix / Almanic, 1990. English translation by 46 OkuMen (CC BY-NC 4.0).
- Emulator: [np2-wasm](https://github.com/irori/np2-wasm) by irori, based on Neko Project II by the NP2 developer team. BSD 3-Clause license, see `emulator/LICENSE-np2-wasm.txt`.
- Emulator font (`emulator/font.bmp`): built by np2-wasm from free fonts (Sazanami-based SimK font.bmp, Shinonome). Modified BSD / public domain.
- Interface font: DotGothic16 by Fontworks, via Google Fonts (SIL Open Font License).
