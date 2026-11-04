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
