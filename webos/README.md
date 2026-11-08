# BitChord for webOS TV

App version: `0.2.0`.

This is the initial webOS TV UI port, following the Android TV presentation as its visual reference: the same horizontal BitChord mark, centered floating tab bar, SF Pro Display typography, dark artwork-tinted canvas, shelves, and rounded/circular artwork cards.

## Remote navigation

D-pad navigation follows the Android TV shelf model:

- Left/Right moves through the current tab bar or artwork shelf.
- Down from the tab bar enters the first visible card in the first shelf.
- Up/Down moves between shelves, entering the next shelf at its first visible card.
- Up from the first shelf returns to the selected tab. The Account control remains at the top right, after Settings in remote focus order.
- Back returns from Home content to the selected tab. On the Home tab itself, Back is left to webOS so the platform can close the app.
- Enter/Select activates the focused button. The LG webOS Back key code (461) is handled.

Focus motion mirrors the Android TV implementation: tabs transition to a white platter in 140 ms; artwork lifts to 1.08x with a soft shadow and a spring-like 190 ms easing; captions move down by the equivalent of 7 dp. The Account button grows to 1.15x and gains a shadow. Reduced-motion preferences are respected.

The Account control is present in the Android TV position and uses the person icon when no profile image is available. Its webOS sign-in and QR pairing flow is not connected yet.

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


## Android TV menu parity (webOS UI branch)

The webOS interface now includes the Android TV menu structure and presentation:

- Settings groups: Account, Playback, Sound, Now Playing, Display, Connections and General.
- Account/profile switcher, account settings and PIN keypad surfaces.
- Track action sheet, playlist picker/new-playlist sheet and sleep timer.
- Equalizer bands/presets, lyrics provider list, appearance and refresh-rate pickers.
- Scrobbling, Discord, software-update and About dialogs.

Dialogs animate in with a fade and scale transition; menu rows, settings rows, profile cards and equalizer controls have animated D-pad focus states. Back closes a dialog or returns to its previous sheet. Track cards also expose their action menu through the context-menu event and the remote Menu key.

### Implementation boundary

This branch is deliberately UI-first. The new menu actions call empty `onTv*Action` functions in `webos/app/js/app.js`; they do not implement sign-in, profile switching, queue edits, settings persistence, lyrics providers, equalizer DSP, Discord/scrobbling, update installation or PIN security. The next implementation pass should connect those callbacks to the real webOS-compatible services and data while preserving the existing markup, focus states and transitions.

Keep the JavaScript compatible with the TV's older Chromium runtime: avoid optional chaining and nullish coalescing, and retain the current ES5-style patterns in this app.
