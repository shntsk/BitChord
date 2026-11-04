{
  lib,
  stdenv,
  src,
  gradle_8,
  jdk21,
  cmake,
  ninja,
  gcc,
  autoPatchelfHook,
  makeWrapper,
  copyDesktopItems,
  makeDesktopItem,
  alsa-lib,
  atk,
  cairo,
  cups,
  dbus,
  fontconfig,
  freetype,
  gdk-pixbuf,
  glib,
  gtk3,
  libGL,
  libpulseaudio,
  libxkbcommon,
  nspr,
  nss,
  pango,
  xorg,
  zlib,
}:

let
  runtimeLibraries = [
    alsa-lib
    atk
    cairo
    cups
    dbus
    fontconfig
    freetype
    gdk-pixbuf
    glib
    gtk3
    libGL
    libpulseaudio
    libxkbcommon
    nspr
    nss
    pango
    stdenv.cc.cc.lib
    xorg.libICE
    xorg.libSM
    xorg.libX11
    xorg.libXau
    xorg.libXcomposite
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXdmcp
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXinerama
    xorg.libXrandr
    xorg.libXrender
    xorg.libXtst
    xorg.libXxf86vm
    zlib
  ];
in
stdenv.mkDerivation (finalAttrs: {
  pname = "bitchord";
  version = "1.9";
  inherit src;

  nativeBuildInputs = [
    gradle_8
    jdk21
    cmake
    ninja
    gcc
    autoPatchelfHook
    makeWrapper
    copyDesktopItems
  ];

  buildInputs = runtimeLibraries;

  # CMake is invoked by the Gradle task against desktopApp/native. Do not let
  # Nix's generic CMake hook configure the repository root as a CMake project.
  dontUseCmakeConfigure = true;

  # Gradle resolves Maven dependencies through Nixpkgs' MITM cache. This makes
  # subsequent builds offline and reproducible instead of downloading from
  # arbitrary Maven repositories during a Nix build.
  mitmCache = gradle_8.fetchDeps {
    pkg = finalAttrs.finalPackage;
    data = "deps.json";
  };

  __darwinAllowLocalNetworking = true;

  gradleBuildTask = ":desktopApp:createDistributable";
  gradleCheckTask = ":shared:jvmTest :desktopUi:jvmTest :desktopApp:test";
  gradleFlags = [
    "-Dfile.encoding=utf-8"
    "-Dorg.gradle.java.home=${jdk21}"
    "-Porg.gradle.java.installations.auto-download=false"
  ];

  doCheck = true;

  preBuild = ''
    export LANG=C.UTF-8
    export LC_ALL=C.UTF-8
  '';

  installPhase = ''
    runHook preInstall

    appRoot="desktopApp/build/compose/binaries/main/app/BitChord"
    if [ ! -x "$appRoot/bin/BitChord" ]; then
      echo "Compose Desktop distribution not found at $appRoot" >&2
      exit 1
    fi

    mkdir -p "$out/lib/BitChord" "$out/bin"
    cp -a "$appRoot/." "$out/lib/BitChord/"

    makeWrapper "$out/lib/BitChord/bin/BitChord" "$out/bin/bitchord" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibraries}" \
      --set BITCHORD_PACKAGE_MANAGER nix

    install -Dm644 "$src/desktopApp/packaging/icons/AppIcon.png" \
      "$out/share/icons/hicolor/512x512/apps/bitchord.png"

    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "bitchord";
      desktopName = "BitChord";
      comment = "Aesthetic YouTube Music client";
      exec = "bitchord";
      icon = "bitchord";
      terminal = false;
      categories = [ "AudioVideo" "Audio" "Player" ];
      startupNotify = true;
    })
  ];

  meta = {
    description = "Aesthetic YouTube Music client";
    homepage = "https://github.com/shntsk/BitChord";
    license = lib.licenses.gpl3Only;
    platforms = [ "x86_64-linux" ];
    mainProgram = "bitchord";
    sourceProvenance = with lib.sourceTypes; [
      fromSource
      binaryBytecode
    ];
  };
})
