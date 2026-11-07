package com.music.bitchord.desktop

/**
 * Java's X11 toolkit assumes the window manager wraps every window in a decoration frame. Tiling
 * window managers (Hyprland, Sway, niri, i3...) do not, and under them the native window ends up
 * larger than the surface Compose draws into: the app fills a corner and the rest stays blank.
 * Java reads `_JAVA_AWT_WM_NONREPARENTING` natively at startup, so it cannot be set from inside the
 * running process; the process is started once more with it set instead.
 *
 * Only on the window managers known to need it. On a reparenting one (GNOME, KDE...) the variable
 * can misplace windows, so it is left alone there.
 *
 * Set `BITCHORD_NO_WM_FIX=1` to turn this off, or set `_JAVA_AWT_WM_NONREPARENTING` yourself to
 * choose the value.
 */
internal object DesktopLinuxWindowFix {

    private const val VARIABLE = "_JAVA_AWT_WM_NONREPARENTING"
    private const val OPT_OUT = "BITCHORD_NO_WM_FIX"

    /** Variables each of these window managers puts in the environment of what it starts. */
    private val tilingEnvironment = listOf(
        "HYPRLAND_INSTANCE_SIGNATURE",
        "SWAYSOCK",
        "NIRI_SOCKET",
        "I3SOCK",
        "WAYFIRE_SOCKET",
        "BSPWM_SOCKET",
    )

    /** Desktop names, as `XDG_CURRENT_DESKTOP` and `XDG_SESSION_DESKTOP` spell them. */
    private val tilingDesktops = listOf(
        "hyprland", "sway", "niri", "i3", "bspwm", "dwm", "awesome", "xmonad", "qtile",
        "river", "wayfire", "herbstluftwm", "leftwm", "spectrwm", "openbox-tiling",
    )

    private fun needed(): Boolean {
        if (!DesktopPlatform.isLinux) return false
        if (System.getenv(VARIABLE) != null || System.getenv(OPT_OUT) != null) return false
        if (tilingEnvironment.any { System.getenv(it) != null }) return true
        val desktops = listOfNotNull(System.getenv("XDG_CURRENT_DESKTOP"), System.getenv("XDG_SESSION_DESKTOP"))
            .flatMap { it.lowercase().split(':', ';', ' ') }
        return desktops.any { it in tilingDesktops }
    }

    /**
     * Starts this program again with the variable set, when it is needed. Returns true if it did,
     * in which case the caller must return so this process ends and leaves the new one running.
     */
    fun relaunchIfNeeded(): Boolean {
        if (!needed()) return false
        return try {
            val info = ProcessHandle.current().info()
            val command = info.command().orElse(null) ?: return false
            val arguments = info.arguments().orElse(emptyArray())
            val builder = ProcessBuilder(listOf(command) + arguments)
            builder.environment()[VARIABLE] = "1"
            builder.inheritIO()
            builder.start()
            true
        } catch (_: Exception) {
            // Could not start the copy: carry on in this process, as before.
            false
        }
    }
}
