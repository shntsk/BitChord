# BitChord Desktop — Linux e Windows

O BitChord possui um aplicativo desktop nativo feito com Kotlin e Compose Desktop. Ele compartilha a camada de dados do projeto, mas mantém a interface e os recursos específicos de desktop em módulos próprios.

## Requisitos

- JDK 21.
- Linux: sessão gráfica com X11 ou XWayland, OpenGL e bibliotecas GTK/ALSA.
- Windows: Windows 10 ou mais recente.

## Executar

Linux:

```bash
./gradlew :desktopApp:run
```

No NixOS, uma sessão de desenvolvimento pode ser aberta com:

```bash
nix-shell -p jdk21 libglvnd glib gtk3 pango atk cairo gdk-pixbuf libXtst libXxf86vm alsa-lib cmake ninja gcc --run 'export LD_LIBRARY_PATH="/run/opengl-driver/lib:${LD_LIBRARY_PATH:-}"; ./gradlew :desktopApp:run'
```

Windows (PowerShell):

```powershell
.\gradlew.bat :desktopApp:run
```

## Compilar distribuições

Linux:

```bash
./gradlew :desktopApp:createDistributable
./gradlew :desktopApp:packageDeb :desktopApp:packageRpm
```

Windows (com WiX Toolset 3 disponível no `PATH`):

```powershell
.\gradlew.bat :desktopApp:createDistributable
.\gradlew.bat :desktopApp:packageExe :desktopApp:packageMsi
```

Os artefatos são gravados em `desktopApp/build/compose/binaries/main/`. O CI compila os dois sistemas e publica o diretório portátil como artefato de execução do workflow.

Para testar uma versão específica, passe `-Pbitchord.version=1.9` ao Gradle.


## NixOS (x86_64)

The native Nix package includes the Compose Desktop runtime, Java runtime, app
launcher, icon and desktop entry. Install it into a user profile:

```bash
nix profile install github:shntsk/BitChord
```

The app is available as `bitchord` and appears in the desktop application
launcher. No system-wide Java or FFmpeg installation is required.

To update it later:

```bash
nix profile upgrade packages.x86_64-linux.default
```

To remove it:

```bash
nix profile remove bitchord
```

The flake reference is intentionally unlocked, so `nix profile upgrade`
checks the current default branch of this repository. The in-app update notice
can copy the same profile-upgrade command; it does not replace or modify files
in the immutable Nix store.

The Nix package currently targets `x86_64-linux`. Gradle dependencies are
pinned in `nix/deps.json`; maintainers can refresh them with:

```bash
nix flake lock
nix develop --command ./nix/update-deps.sh
```

The NixOS package is built from source and includes its own Java runtime.
