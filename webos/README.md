# BitChord for webOS TV

This is the first webOS TV port milestone. It reproduces the Android TV Home shell in a native webOS web app: the centered floating tab bar, SF Pro Display typography, dark gradient canvas, horizontal music shelves, square/circular artwork cards and focus-lift behavior.

The cards currently use bundled preview artwork and sample labels. YouTube Music account sign-in, real home-feed data, playback, queue, lyrics, detail pages, and the remaining Android TV screens are not connected in this first milestone. The Android TV module is not changed by this port.

## Build locally

Requirements: Node.js 20+ and npm.

```sh
npm install --global @webos-tools/cli@3.2.6
cd webos
ares-package ./app
```

The CLI writes a `.ipk` package into the current directory.

## Remote controls

- Arrow keys move focus between tabs and cards.
- Enter selects the focused item.
- Back/Escape returns focus to Home.
- Focused controls use the Android TV-style bright platter or lifted artwork.

## GitHub Actions

The `webOS TV` workflow packages `webos/app` into an `.ipk` on pushes and pull requests that touch `webos/**`. Download the `BitChord-webOS-IPK` artifact from the workflow run.

The package is not yet tested on a physical LG TV or webOS simulator. The CI job verifies that the webOS CLI can package the app and uploads the resulting IPK.
