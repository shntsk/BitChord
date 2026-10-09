# Arch Linux package

The `PKGBUILD` packages the existing Compose Multiplatform/jpackage app image; it does not create an AOT/native executable and does not invoke `appimage.sh`.

## CI

Run **Actions → Arch Linux package → Run workflow** in the source repository, optionally supplying a version. Tags matching `v*.*.*` trigger it automatically. The workflow runs inside the official `archlinux:base-devel` container, executes desktop JVM tests, builds `:desktopApp:createDistributable`, validates the app image and package contents, uploads the `.pkg.tar.zst` artifact, and publishes to the separate repository when `PACMAN_REPO_TOKEN` is configured.

The Arch package version cannot contain a hyphen. The workflow maps release prerelease separators (for example `1.8-beta1`) to Arch's `1.8_beta1` for `pkgver`, while the application itself receives the original version.

## One-time GitHub setup

1. Create a separate **public** repository named `shntsk/BitChord-pacman`. Keep it separate from the application source repository.
2. In that repository, choose **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, folder `/(root)`. The workflow commits static files to the default branch and adds `.nojekyll`.
3. In the source repository, add a repository secret named `PACMAN_REPO_TOKEN`. Use a fine-grained personal access token restricted to `shntsk/BitChord-pacman` with **Contents: Read and write**. The workflow uses it only to push distribution files. Do not give it access to the source repository or store it in source.
4. In **Settings → Actions → General**, allow GitHub Actions to run and use repository secrets. No write permission to the source repo is needed by this workflow.
5. Run the workflow after the destination repository and Pages have been enabled.

Published URL: `https://shntsk.github.io/BitChord-pacman/x86_64/`. Static Pages hosting does not serve Git symlinks as reliable repository metadata, so the workflow creates regular-file copies of `bitchord.db.tar.gz` and `bitchord.files.tar.gz` as `bitchord.db` and `bitchord.files`. The pacman server points to the architecture directory and downloads package/database files directly, not HTML pages.

## Client configuration

Add to `/etc/pacman.conf`:

```ini
[bitchord]
Server = https://shntsk.github.io/BitChord-pacman/$arch
SigLevel = Optional
```

Then refresh and install:

```bash
sudo pacman -Syu
sudo pacman -S bitchord
```

The app is installed under `/opt/BitChord`, with `/usr/bin/bitchord`, a desktop entry and icon. It bundles its Java runtime, JavaFX, FFmpeg/ONNX dependencies, app resources, ONNX models and the Automix native library if the existing build successfully produces them. The package declares Arch's system graphics, audio, font and desktop libraries as dependencies.

## Package signing

The initial repository uses optional signature verification for testing. For a public distribution, generate and protect a pacman signing key **outside GitHub Actions**. Sign each package and the repository database with `repo-add -s` (or the equivalent `gpg --detach-sign` flow), publish the detached `.sig` files and configure clients with a trusted key in pacman's keyring plus `SigLevel = Required DatabaseOptional` or stricter policy appropriate to your signed database. Never put a private GPG key in the repository or GitHub secret. An offline release/signing step is the safest simple option; fully automated signing requires a dedicated signing service/HSM or a carefully isolated secret-key service.

## Limitations

The CI checks package metadata, file layout, bundled Java, application entry class, ONNX models and the Automix Linux shared library. A headless hosted runner cannot prove that the graphical app opens and works with a real desktop, GPU/GL driver, audio session, DBus and Wayland/X11; test those on an actual Arch desktop before recommending it broadly. The workflow skips publication if `PACMAN_REPO_TOKEN` is absent, but still uploads the artifact. It intentionally does not modify the existing release workflow or run `appimage.sh`.
