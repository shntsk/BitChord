# BitChord for webOS TV

This is the initial webOS TV UI port, following the Android TV presentation as its visual reference: the same horizontal BitChord mark, centered floating tab bar, SF Pro Display typography, dark artwork-tinted canvas, shelves, and rounded/circular artwork cards.

## Remote navigation

D-pad navigation is explicitly managed for TV remotes rather than relying on browser tab order:

- Left/Right moves within the current navigation bar or artwork shelf.
- Up/Down moves between the tab bar and the first shelf, then between adjacent shelves while keeping the closest horizontal position.
- Back returns from Home content to the selected tab. On the Home tab itself, Back is left to webOS so the platform can close the app.
- Enter/Select activates the focused button. The LG webOS Back key code (461) is handled.

Focus styling follows the Android TV implementation: tab controls invert to a white platter with dark icon/text; artwork cards lift slightly and cast a soft shadow. The card is not surrounded by a permanent white outline.

The launcher icon files are copied from the Android app's 512x512 Play Store launcher artwork so the webOS tile uses the same BitChord identity.

## Current implementation boundary

The Home screen still contains sample artwork and labels. YouTube Music sign-in, live Home feed, playback, queue, lyrics, detail screens, and the remaining Android TV destinations have not yet been ported to webOS. Buttons that depend on those features display a clear not-connected message rather than pretending playback works.

The Android TV module is used as the reference and is not modified by this webOS work.

## Build

Requirements: Node.js 20+ and npm.

```sh
npm install --global @webos-tools/cli@3.2.6
cd webos
ares-package ./app
```

The official CLI writes an .ipk package into the current directory.

## GitHub Actions

The existing platform workflow includes a webOS TV IPK job. It validates the manifest and JavaScript, packages webos/app, and uploads the BitChord-webOS-IPK artifact.

A successful CI package is not a substitute for installing and testing the IPK on a physical LG TV or webOS simulator.
