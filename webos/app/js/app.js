(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Helpers and storage (localStorage is native on webOS)
  // ---------------------------------------------------------------------------
  var DEFAULT_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.nosebs.ru",
    "https://pipedapi-libre.kavin.rocks",
    "https://api.piped.yt",
    "https://pipedapi.adminforge.de"
  ];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function load(key, def) {
    try { var v = window.localStorage.getItem("bc." + key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function save(key, val) {
    try { window.localStorage.setItem("bc." + key, JSON.stringify(val)); } catch (e) { /* storage full or disabled */ }
  }
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  var settings = load("settings", { instance: "", region: "US" });
  var history = load("history", []);
  var favorites = load("favorites", []);

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  var toast = $("#toast"), toastTimer = null;
  function notify(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 3200);
  }
  function hideNotice() {
    if (toast) toast.classList.remove("is-visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Data layer: Piped API (CORS-enabled, so a packaged webOS app can call it directly)
  // ---------------------------------------------------------------------------
  function getJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open("GET", url, true);
      x.timeout = ms || 9000;
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) {
          try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error("bad response")); }
        } else { reject(new Error("server error " + x.status)); }
      };
      x.onerror = function () { reject(new Error("network blocked or offline")); };
      x.ontimeout = function () { reject(new Error("timeout")); };
      x.send();
    });
  }

  var goodIndex = 0;
  function instances() {
    var custom = (settings.instance || "").replace(/\/+$/, "");
    return custom ? [custom] : DEFAULT_INSTANCES;
  }
  function api(path) {
    var list = instances();
    function attempt(n) {
      var i = (goodIndex + n) % list.length;
      return getJson(list[i] + path).then(function (data) {
        goodIndex = i;
        return data;
      }, function (err) {
        if (n + 1 < list.length) return attempt(n + 1);
        throw err;
      });
    }
    return attempt(0);
  }

  function videoId(url) {
    var m = /[?&]v=([\w-]{11})/.exec(url || "");
    return m ? m[1] : null;
  }
  function toSongs(items) {
    return (items || []).map(function (i) {
      var id = i && i.type === "stream" && !i.isShort ? videoId(i.url) : null;
      return id ? { id: id, title: i.title || "Untitled", artist: i.uploaderName || "", art: i.thumbnail || "" } : null;
    }).filter(Boolean);
  }
  function toArtists(items) {
    return (items || []).filter(function (i) { return i && i.type === "channel" && i.name; })
      .map(function (i) { return { name: i.name, art: i.thumbnail || "" }; });
  }
  function search(q, filter) {
    return api("/search?q=" + encodeURIComponent(q) + "&filter=" + filter).then(function (d) { return d.items || []; });
  }
  function trending() {
    return api("/trending?region=" + encodeURIComponent((settings.region || "US").toUpperCase())).then(toSongs);
  }

  // ---------------------------------------------------------------------------
  // Rendering (same markup/classes as the original design, now data-driven)
  // ---------------------------------------------------------------------------
  function card(kind, title, sub, art, onClick) {
    var b = el("button", "music-card " + kind + "-card");
    b.type = "button";
    b.setAttribute("data-focus", "");
    var cover = el("span", "cover has-art" + (kind === "artist" ? " artist-cover" : ""));
    if (art) {
      var img = el("img");
      img.alt = "";
      img.onerror = function () { img.style.display = "none"; };
      img.src = art;
      cover.appendChild(img);
    } else {
      cover.className += " art-night";
      if (kind === "artist") cover.appendChild(el("span", "artist-initial", (title || "?").charAt(0).toUpperCase()));
    }
    b.appendChild(cover);
    b.appendChild(el("span", "card-title", title));
    if (sub) b.appendChild(el("span", "card-subtitle", sub));
    b.addEventListener("click", onClick);
    return b;
  }
  function songCards(list, featured) {
    return list.map(function (s, i) {
      var item = card(featured ? "featured" : "recent", s.title, s.artist, s.art, function () { play(list, i); });
      item._song = s;
      item.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        openSongActions(s);
      });
      return item;
    });
  }
  function artistCards(list) {
    return list.map(function (a) {
      return card("artist", a.name, "", a.art, function () { openArtist(a.name); });
    });
  }
  function makeShelf(feed, title, featured) {
    var s = el("section", "shelf" + (featured ? " shelf-featured" : ""));
    var h = el("div", "shelf-heading");
    h.appendChild(el(featured ? "h1" : "h2", null, title));
    s.appendChild(h);
    var row = el("div", "card-row" + (featured ? " featured-row" : ""));
    s.appendChild(row);
    feed.appendChild(s);
    return { section: s, row: row };
  }
  function fillShelf(shelf, cards) {
    cards.forEach(function (c) { shelf.row.appendChild(c); });
    shelf.section.hidden = !cards.length;
    return cards.length ? 1 : 0;
  }
  // A shelf is created in place immediately, then filled (or left hidden) when data arrives.
  var lastError = null;
  function asyncShelf(feed, title, fetcher, mode, featured) {
    var shelf = makeShelf(feed, title, featured);
    shelf.section.hidden = true;
    return fetcher().then(function (items) {
      return fillShelf(shelf, mode === "artist" ? artistCards(items) : songCards(items, featured));
    }, function (err) { lastError = err; return 0; });
  }
  function localShelf(feed, title, list) {
    if (!list.length) return 0;
    return fillShelf(makeShelf(feed, title, false), songCards(list.slice(0, 30), false));
  }
  function message(feed, text) {
    feed.appendChild(el("p", "empty", text));
  }
  function failureText() {
    return "Could not reach a music server" + (lastError ? " (" + lastError.message + ")" : "") +
      ". Check the TV's network, or set a server in Settings.";
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  var selectedPage = "home";
  var builtAt = {};

  function buildHome() {
    var feed = $("#screen-home .feed");
    feed.innerHTML = "";
    lastError = null;
    var hits = asyncShelf(feed, "Top Hits", function () { return search("top hits", "music_songs").then(toSongs); }, "song", true);
    var local = localShelf(feed, "Recently Played", history) + localShelf(feed, "Favorites", favorites);
    var trend = asyncShelf(feed, "Trending", trending, "song", false);
    Promise.all([hits, trend]).then(function (r) {
      if (!local && !r[0] && !r[1]) message(feed, failureText());
    });
  }
  function buildExplore() {
    var feed = $("#screen-explore .feed");
    feed.innerHTML = "";
    lastError = null;
    var a = asyncShelf(feed, "New Music", function () { return search("new music this week", "music_songs").then(toSongs); }, "song", true);
    var b = asyncShelf(feed, "Artists to Discover", function () { return search("popular artists", "music_artists").then(toArtists); }, "artist", false);
    var c = asyncShelf(feed, "Chill", function () { return search("chill music", "music_songs").then(toSongs); }, "song", false);
    Promise.all([a, b, c]).then(function (r) {
      if (!r[0] && !r[1] && !r[2]) message(feed, failureText());
    });
  }
  function buildLibrary() {
    var feed = $("#screen-library .feed");
    feed.innerHTML = "";
    var n = localShelf(feed, "Favorites", favorites) + localShelf(feed, "Recently Played", history);
    if (!n) message(feed, "Your library is empty. Play a song, then use the heart on Now Playing to keep it here. Account sync comes with sign-in.");
  }

  var searchSeq = 0;
  function runSearch(query) {
    var box = $("#search-results");
    box.innerHTML = "";
    if (!query) return;
    var seq = ++searchSeq;
    lastError = null;
    var wait = el("p", "empty", "Searching\u2026");
    box.appendChild(wait);
    Promise.all([
      search(query, "music_songs").then(toSongs).catch(function (e) { lastError = e; return []; }),
      search(query, "music_artists").then(toArtists).catch(function (e) { lastError = e; return []; })
    ]).then(function (r) {
      if (seq !== searchSeq) return;
      box.innerHTML = "";
      var n = 0;
      if (r[0].length) n += fillShelf(makeShelf(box, "Songs", false), songCards(r[0], false));
      if (r[1].length) n += fillShelf(makeShelf(box, "Artists", false), artistCards(r[1]));
      if (!n) message(box, lastError ? failureText() : "No results for \u201C" + query + "\u201D.");
      else focusFirstResult();
    });
  }
  function focusFirstResult() {
    var current = document.activeElement;
    if (current && current.id === "search-input") return; // keep the keyboard flow; Down enters results
  }
  function openArtist(name) {
    showScreen("search");
    var input = $("#search-input");
    input.value = name;
    runSearch(name);
  }

  function buildSettings() {
    $("#set-instance").value = settings.instance || "";
    $("#set-region").value = settings.region || "US";
    $("#set-status").textContent = "";
  }
  function saveSettings() {
    settings.instance = $("#set-instance").value.trim();
    settings.region = ($("#set-region").value.trim() || "US").toUpperCase();
    save("settings", settings);
    goodIndex = 0;
    builtAt = {};
  }

  var screens = {
    home: { build: buildHome, ttl: 120000 },
    explore: { build: buildExplore, ttl: 300000 },
    library: { build: buildLibrary, ttl: 0 },
    search: { build: function () {}, ttl: Infinity },
    "now-playing": { build: function () {}, ttl: Infinity },
    settings: { build: buildSettings, ttl: 0 }
  };
  var tabs = $("[data-tab]");
  var account = $(".account");

  // ---------------------------------------------------------------------------
  // UI-only Android TV menus. Behaviour is intentionally left for the next pass.
  // ---------------------------------------------------------------------------
  var dialogRoot = $("#dialog-root");
  var activeDialog = null;
  var dialogStack = [];
  var dialogReturnFocus = null;

  function onTvAccountAction(action) { /* TODO for implementation AI: connect account/profile behaviour. */ }
  function onTvPlaybackAction(action, value) { /* TODO for implementation AI: connect playback preferences. */ }
  function onTvAudioAction(action, value) { /* TODO for implementation AI: connect audio preferences and equalizer. */ }
  function onTvLyricsAction(action, value) { /* TODO for implementation AI: connect lyrics preferences and provider ordering. */ }
  function onTvDisplayAction(action, value) { /* TODO for implementation AI: connect display, theme and motion preferences. */ }
  function onTvConnectionAction(action, value) { /* TODO for implementation AI: connect Discord and scrobbling accounts. */ }
  function onTvGeneralAction(action, value) { /* TODO for implementation AI: connect update, setup and about actions. */ }
  function onTvSongAction(action, value) { /* TODO for implementation AI: connect queue, like, album, artist and track actions. */ }

  function dialogButton(label, value, callback, className) {
    var button = el("button", "tv-dialog-row" + (className ? " " + className : ""));
    button.type = "button";
    button.setAttribute("data-focus", "");
    var copy = el("span", "tv-dialog-row-copy");
    copy.appendChild(el("strong", null, label));
    if (value && value.description) copy.appendChild(el("small", null, value.description));
    button.appendChild(copy);
    if (value && value.value) button.appendChild(el("span", "tv-dialog-value", value.value));
    if (value && value.chevron) button.appendChild(el("span", "tv-dialog-chevron", "›"));
    button.addEventListener("click", callback || function () {});
    return button;
  }

  function renderDialog(config, push) {
    if (!dialogRoot) return;
    if (activeDialog && push) dialogStack.push(activeDialog._config);
    if (!activeDialog && !dialogReturnFocus) dialogReturnFocus = document.activeElement;
    dialogRoot.innerHTML = "";
    var overlay = el("div", "tv-dialog-overlay" + (config.fullscreen ? " is-fullscreen" : ""));
    overlay.setAttribute("role", "presentation");
    overlay._config = config;
    activeDialog = overlay;

    if (config.fullscreen) {
      var full = el("div", "tv-profile-switcher");
      var brand = el("img", "tv-profile-mark");
      brand.src = "brand-mark.svg";
      brand.alt = "BitChord";
      full.appendChild(brand);
      full.appendChild(el("h1", null, config.title));
      if (config.message) full.appendChild(el("p", "tv-dialog-message", config.message));
      var profiles = el("div", "tv-profile-grid");
      (config.profiles || []).forEach(function (profile, index) {
        var card = el("button", "tv-profile-card");
        card.type = "button";
        card.setAttribute("data-focus", "");
        var avatar = el("span", "tv-profile-avatar", profile.initial || "P");
        card.appendChild(avatar);
        card.appendChild(el("strong", null, profile.name));
        card.appendChild(el("small", null, profile.subtitle || ""));
        card.addEventListener("click", profile.onClick || function () {});
        profiles.appendChild(card);
      });
      full.appendChild(profiles);
      if (config.rows && config.rows.length) {
        var actions = el("div", "tv-profile-actions");
        config.rows.forEach(function (item) {
          actions.appendChild(dialogButton(item.label, { description: item.description, value: item.value, chevron: item.chevron }, item.onClick, item.destructive ? "is-destructive" : ""));
        });
        full.appendChild(actions);
      }
      overlay.appendChild(full);
    } else {
      var panel = el("section", "tv-dialog-panel" + (config.wide ? " is-wide" : ""));
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.appendChild(el("h2", "tv-dialog-title", config.title || ""));
      if (config.message) panel.appendChild(el("p", "tv-dialog-message", config.message));
      if (config.artwork) {
        var art = el("img", "tv-dialog-artwork");
        art.src = config.artwork;
        art.alt = "";
        panel.appendChild(art);
      }
      if (config.content) config.content(panel);
      if (config.rows && config.rows.length) {
        var list = el("div", "tv-dialog-list");
        config.rows.forEach(function (item) {
          list.appendChild(dialogButton(item.label, {
            description: item.description,
            value: item.value,
            chevron: item.chevron
          }, item.onClick, item.destructive ? "is-destructive" : ""));
        });
        panel.appendChild(list);
      }
      if (config.footer) config.footer(panel);
      if (config.cancel !== false) {
        var footer = el("div", "tv-dialog-footer");
        footer.appendChild(dialogButton("Cancel", null, function () { closeTvDialog(); }, "tv-dialog-cancel"));
        panel.appendChild(footer);
      }
      overlay.appendChild(panel);
    }
    dialogRoot.appendChild(overlay);
    window.setTimeout(function () {
      overlay.classList.add("is-open");
      var first = $("[data-focus]", overlay);
      if (first) focus(first, false);
    }, 20);
  }

  function closeTvDialog() {
    if (!activeDialog) return;
    var closing = activeDialog;
    closing.classList.remove("is-open");
    closing.classList.add("is-closing");
    window.setTimeout(function () {
      if (activeDialog !== closing) return;
      if (dialogStack.length) {
        var previous = dialogStack.pop();
        activeDialog = null;
        renderDialog(previous, false);
      } else {
        dialogRoot.innerHTML = "";
        activeDialog = null;
        var back = dialogReturnFocus;
        dialogReturnFocus = null;
        if (back && document.documentElement.contains(back)) focus(back, false);
        else focusTab();
      }
    }, 190);
  }

  function showTvMenu(title, message, rows, options) {
    options = options || {};
    renderDialog({
      title: title,
      message: message || "",
      rows: rows || [],
      wide: !!options.wide,
      fullscreen: !!options.fullscreen,
      profiles: options.profiles || null,
      cancel: options.cancel,
      content: options.content
    }, !!options.push);
  }

  function openAccountDialog() {
    showTvMenu("Sign In to YouTube Music",
      "Your library, playlists and recommendations follow your account.",
      [
        { label: "Sign In on This TV", description: "Use the remote to sign in to Google.", chevron: true, onClick: function () { openSignInTvDialog(); } },
        { label: "Sign In with Your Phone", description: "Scan a code with a phone on the same Wi-Fi.", chevron: true, onClick: function () { openSignInPhoneDialog(); } },
        { label: "Not Now", onClick: function () { closeTvDialog(); } }
      ]);
  }

  function openSignInTvDialog() {
    showTvMenu("Sign In to YouTube Music", "The Google sign-in page will be embedded here in the implementation pass.", [
      { label: "Done", onClick: function () { onTvAccountAction("capture-sign-in"); closeTvDialog(); } },
      { label: "Cancel", onClick: function () { closeTvDialog(); } }
    ], { push: true, wide: true });
  }

  function openSignInPhoneDialog() {
    showTvMenu("Sign In with Your Phone", "Connect your phone to the same Wi-Fi as this TV.", [
      { label: "QR code placeholder", description: "The live QR code and local sign-in server will be added by the implementation AI." },
      { label: "Scan the code with your phone", description: "Follow the steps on your phone. This TV signs in by itself." },
      { label: "Back", onClick: function () { closeTvDialog(); } }
    ], { push: true, wide: true });
  }

  function openPinDialog() {
    showTvMenu("Set 4-Digit PIN", "Create a PIN to protect this profile.", [], {
      push: true,
      content: function (panel) {
        var dots = el("div", "tv-pin-dots", "○  ○  ○  ○");
        panel.appendChild(dots);
        var keypad = el("div", "tv-pin-grid");
        ["1","2","3","4","5","6","7","8","9","C","0","⌫"].forEach(function (key) {
          keypad.appendChild(dialogButton(key, null, function () { onTvAccountAction("pin-key", key); }));
        });
        panel.appendChild(keypad);
      }
    });
  }

  function openProfileSwitcher() {
    renderDialog({
      title: "Who's watching?",
      message: "Choose a profile to switch your library, playlists and recommendations.",
      fullscreen: true,
      profiles: [
        { name: "Personal", subtitle: "YouTube Music", initial: "P", onClick: function () { onTvAccountAction("select-personal-profile"); } },
        { name: "Brand account", subtitle: "Additional profile", initial: "B", onClick: function () { onTvAccountAction("select-brand-profile"); } },
        { name: "Add account", subtitle: "Sign in to YouTube Music", initial: "+", onClick: function () { openAccountDialog(); } }
      ],
      rows: [
        { label: "Account Settings", description: "Profile lock and sign-out options.", chevron: true, onClick: function () { openAccountSettingsDialog(); } },
        { label: "Done", onClick: function () { closeTvDialog(); } }
      ],
      cancel: false
    }, false);
  }

  function openAccountSettingsDialog() {
    showTvMenu("Account Settings", "Personal · YouTube Music", [
      { label: "App Lock (4-Digit PIN)", description: "Protect this profile with a PIN.", value: "Off", chevron: true, onClick: function () { openPinDialog(); } },
      { label: "Sign Out", description: "Remove this account from TV.", chevron: true, destructive: true, onClick: function () { onTvAccountAction("sign-out"); } },
      { label: "Done", onClick: function () { closeTvDialog(); } }
    ], { push: true });
  }

  function openPlaylistDialog(songOverride) {
    var selectedSong = songOverride || current;
    showTvMenu("Add to Playlist", selectedSong ? selectedSong.title : "Choose a playlist for this song.", [
      { label: "New Playlist…", description: "Create a private playlist with this song.", chevron: true, onClick: function () { openNewPlaylistDialog(); } },
      { label: "Liked Music", value: "Playlist", onClick: function () { onTvSongAction("add-to-liked-music"); } },
      { label: "Favorites", value: "Playlist", onClick: function () { onTvSongAction("add-to-favorites-playlist"); } }
    ], { push: true });
  }

  function openNewPlaylistDialog() {
    showTvMenu("New Playlist", "It will be private, with this song in it.", [], {
      push: true, wide: true,
      cancel: true,
      content: function (panel) {
        var input = el("input", "tv-dialog-input");
        input.type = "text";
        input.placeholder = "Playlist Name";
        input.setAttribute("data-focus", "");
        panel.appendChild(input);
        var create = dialogButton("Create", null, function () { onTvSongAction("create-playlist", input.value); }, "is-primary");
        panel.appendChild(create);
      }
    });
  }

  function openSleepTimerDialog() {
    showTvMenu("Sleep Timer", "Stop playing music after", [
      { label: "15 Minutes", onClick: function () { onTvSongAction("sleep-timer", 15); } },
      { label: "30 Minutes", onClick: function () { onTvSongAction("sleep-timer", 30); } },
      { label: "45 Minutes", onClick: function () { onTvSongAction("sleep-timer", 45); } },
      { label: "60 Minutes", onClick: function () { onTvSongAction("sleep-timer", 60); } },
      { label: "End of Current Song", onClick: function () { onTvSongAction("sleep-timer-after-track"); } },
      { label: "Turn Off Timer", destructive: true, onClick: function () { onTvSongAction("sleep-timer-off"); } }
    ], { push: true });
  }

  function openEqualizerDialog() {
    showTvMenu("Equalizer", "Shape the sound with presets or seven bands of your own.", [], {
      push: true, wide: true,
      content: function (panel) {
        var tabs = el("div", "tv-dialog-segments");
        var bands = dialogButton("Bands", { value: "Selected" }, function () { onTvAudioAction("equalizer-tab", "bands"); }, "is-selected");
        var presets = dialogButton("Presets", null, function () { openEqualizerPresetsDialog(); });
        tabs.appendChild(bands); tabs.appendChild(presets); panel.appendChild(tabs);
        var faders = el("div", "tv-eq-faders");
        ["60","150","400","1k","2.4k","6k","15k"].forEach(function (hz, index) {
          var fader = el("div", "tv-eq-fader");
          fader.appendChild(el("strong", null, "0 dB"));
          var rail = el("div", "tv-eq-rail");
          var fill = el("span", "tv-eq-fill");
          rail.appendChild(fill);
          var knob = el("span", "tv-eq-knob");
          rail.appendChild(knob);
          fader.appendChild(rail);
          fader.appendChild(el("small", null, hz));
          var controls = el("div", "tv-eq-controls");
          controls.appendChild(dialogButton("−", null, function () { onTvAudioAction("equalizer-band", { band: index, delta: -1 }); }));
          controls.appendChild(dialogButton("+", null, function () { onTvAudioAction("equalizer-band", { band: index, delta: 1 }); }));
          fader.appendChild(controls);
          faders.appendChild(fader);
        });
        panel.appendChild(faders);
        panel.appendChild(dialogButton("Reset All", null, function () { onTvAudioAction("equalizer-reset"); }));
      }
    });
  }

  function openEqualizerPresetsDialog() {
    showTvMenu("Equalizer Presets", "Choose a sound profile.", [
      "Flat","Acoustic","Bass Booster","Bass Reducer","Classical","Electronic","Hip-Hop","Jazz","Loudness","Rock","Spoken Word","Treble Booster","Treble Reducer","Vocal Booster","Small Speakers","Late Night"
    ].map(function (name) {
      return { label: name, onClick: function () { onTvAudioAction("equalizer-preset", name); } };
    }), { push: true });
  }

  function openLyricsSourcesDialog() {
    showTvMenu("Lyrics Sources", "Select providers and arrange the order used to find synced lyrics.", [
      { label: "lrc.red", description: "Apple timings by recording, syllable by syllable.", value: "On" },
      { label: "BiniLyrics", description: "Apple timings matched on the recording itself.", value: "On" },
      { label: "BetterLyrics", description: "Apple Music timings, word by word.", value: "On" },
      { label: "PaxSenix", description: "Apple Music timings through the original provider.", value: "On" },
      { label: "LyricsPlus", description: "Syllable-by-syllable community mirrors.", value: "On" },
      { label: "Unison", description: "Lyrics contributed by listeners.", value: "On" },
      { label: "YouTube captions", description: "Timed captions from the playing video.", value: "On" },
      { label: "KuGou", description: "Whole-line lyrics.", value: "On" },
      { label: "LRCLIB", description: "Whole-line LRC database.", value: "On" },
      { label: "Musixmatch", description: "Whole-line lyrics.", value: "On" },
      { label: "Genius", description: "Plain text fallback.", value: "On" },
      { label: "Prefer Word-Synced", description: "Prefer word-by-word timing when available.", value: "On" },
      { label: "Reset to Default", onClick: function () { onTvLyricsAction("reset-providers"); } },
      { label: "Done", onClick: function () { closeTvDialog(); } }
    ], { push: true, wide: true });
  }

  function openAppearanceDialog() {
    showTvMenu("Appearance", "Choose the background behind BitChord's pages.", [
      { label: "Dark", description: "The default charcoal canvas.", value: "Selected", onClick: function () { onTvDisplayAction("theme", "dark"); } },
      { label: "OLED", description: "Pure black background.", onClick: function () { onTvDisplayAction("theme", "oled"); } },
      { label: "Midnight", description: "Deep navy and sapphire.", onClick: function () { onTvDisplayAction("theme", "midnight"); } }
    ], { push: true });
  }

  function openRefreshRateDialog() {
    showTvMenu("Refresh Rate", "Choose how often the screen redraws while you browse.", [
      { label: "System Default", value: "Recommended", onClick: function () { onTvDisplayAction("refresh-rate", "system"); } },
      { label: "Smooth 60 Hz", onClick: function () { onTvDisplayAction("refresh-rate", 60); } },
      { label: "Ultra 120 Hz", description: "Only available on supported displays.", onClick: function () { onTvDisplayAction("refresh-rate", 120); } }
    ], { push: true });
  }

  function openScrobbleDialog() {
    showTvMenu("Scrobbling", "Connect these on the BitChord phone app; the TV uses the same accounts.", [
      { label: "Last.fm", description: "Listening history and scrobbles.", value: "Not Connected" },
      { label: "ListenBrainz", description: "Open listening history.", value: "Not Connected" },
      { label: "OK", onClick: function () { closeTvDialog(); } }
    ], { push: true });
  }

  function openDiscordDialog() {
    showTvMenu("Discord", "Show what you're listening to in your Discord status.", [], {
      push: true, wide: true,
      content: function (panel) {
        var input = el("input", "tv-dialog-input");
        input.type = "text";
        input.placeholder = "Discord Token";
        input.setAttribute("data-focus", "");
        panel.appendChild(input);
        panel.appendChild(dialogButton("Turn On", null, function () { onTvConnectionAction("discord-enable", input.value); }, "is-primary"));
        panel.appendChild(dialogButton("Turn Off", null, function () { onTvConnectionAction("discord-disable"); }));
      }
    });
  }

  function openAboutDialog() {
    showTvMenu("BitChord", "Version 0.2.0 · webOS TV", [
      { label: "Kushagra Singh", value: "Creator" },
      { label: "Nithyanantha", value: "TV App" },
      { label: "GNU General Public License v3", description: "Free software. Not affiliated with YouTube or Google." },
      { label: "OK", onClick: function () { closeTvDialog(); } }
    ], { push: true });
  }

  function openUpdateDialog() {
    showTvMenu("Software Update", "A newer version of BitChord may be available.", [
      { label: "Check for Updates", description: "Connect the update service in the implementation pass.", onClick: function () { onTvGeneralAction("check-update"); } },
      { label: "Download and Install", onClick: function () { onTvGeneralAction("download-update"); } },
      { label: "Not Now", onClick: function () { closeTvDialog(); } }
    ], { push: true });
  }

  function openSongActions(songOverride) {
    var selectedSong = songOverride || current;
    var title = selectedSong ? selectedSong.title : "No song selected";
    showTvMenu(title, selectedSong ? selectedSong.artist : "Track actions", [
      { label: "Play Next", description: "Add this song after the current track.", chevron: true, onClick: function () { onTvSongAction("play-next", selectedSong); } },
      { label: "Play Last", description: "Add this song to the end of the queue.", chevron: true, onClick: function () { onTvSongAction("play-last", selectedSong); } },
      { label: "Start Station", chevron: true, onClick: function () { onTvSongAction("start-station", selectedSong); } },
      { label: isFav(selectedSong) ? "Unlove" : "Love", value: isFav(selectedSong) ? "♥" : "♡", onClick: function () { onTvSongAction("toggle-like", selectedSong); } },
      { label: "Add to Playlist…", chevron: true, onClick: function () { openPlaylistDialog(selectedSong); } },
      { label: "Go to Album", chevron: true, onClick: function () { onTvSongAction("open-album", selectedSong); } },
      { label: "Go to Artist", chevron: true, onClick: function () { onTvSongAction("open-artist", selectedSong); } },
      { label: "Equalizer", chevron: true, onClick: function () { openEqualizerDialog(); } },
      { label: "Sleep Timer", value: "Off", chevron: true, onClick: function () { openSleepTimerDialog(); } },
      { label: "Stats for Nerds", value: "Off", onClick: function () { onTvSongAction("toggle-stats"); } }
    ], { push: false, wide: true });
  }

  function openSettingsAction(action) {
    var row = $('[data-ui-action="' + action + '"]');
    var description = row && row.getAttribute("data-description");
    var toggles = {
      automix: ["Off", "On"], autoplay: ["Off", "On"], "skip-silence": ["Off", "On"],
      "spatial-audio": ["Off", "On"], "sound-check": ["Off", "On"], "usb-dac": ["Off", "On"],
      "synced-lyrics": ["Off", "On"], "motion-artwork": ["Off", "On"],
      "motion-artwork-lyrics": ["Off", "On"], stats: ["Off", "On"],
      "reduce-motion": ["Off", "On"], "reduce-transparency": ["Off", "On"]
    };
    var choices = {
      automix: ["Off", "On"], autoplay: ["Off", "On"], "skip-silence": ["Off", "On"],
      "spatial-audio": ["Off", "On"], "sound-check": ["Off", "On"], "usb-dac": ["Off", "On"],
      "synced-lyrics": ["Off", "On"], "motion-artwork": ["Off", "On"],
      "motion-artwork-lyrics": ["Off", "On"], stats: ["Off", "On"],
      "reduce-motion": ["Off", "On"], "reduce-transparency": ["Off", "On"],
      crossfade: ["Off", "3 seconds", "6 seconds", "10 seconds"],
      "player-background": ["Artwork Colours", "AMOLED Black"],
      "interface-size": ["80%", "90%", "100%", "110%", "120%", "130%"]
    };
    var labels = {
      account: "Account", equalizer: "Equalizer", "lyrics-sources": "Lyrics Sources",
      appearance: "Appearance", "refresh-rate": "Refresh Rate", scrobbling: "Scrobbling",
      discord: "Discord", "software-update": "Software Update", about: "About",
      "set-up-again": "Set Up Again"
    };
    if (action === "account") return openProfileSwitcher();
    if (action === "equalizer") return openEqualizerDialog();
    if (action === "lyrics-sources") return openLyricsSourcesDialog();
    if (action === "appearance") return openAppearanceDialog();
    if (action === "refresh-rate") return openRefreshRateDialog();
    if (action === "scrobbling") return openScrobbleDialog();
    if (action === "discord") return openDiscordDialog();
    if (action === "software-update") return openUpdateDialog();
    if (action === "about") return openAboutDialog();
    if (action === "set-up-again") {
      return showTvMenu("Set Up Again", "Run the first-time TV setup again?", [
        { label: "Start Setup", destructive: true, onClick: function () { onTvGeneralAction("run-setup-again"); } },
        { label: "Cancel", onClick: function () { closeTvDialog(); } }
      ], { push: true });
    }
    var options = choices[action] || toggles[action] || [];
    showTvMenu(labels[action] || (row ? $("strong", row).textContent : "Settings"), description,
      options.map(function (value) {
        return { label: value, onClick: function () {
          if (action === "crossfade") onTvPlaybackAction(action, value);
          else if (action === "synced-lyrics") onTvLyricsAction(action, value);
          else if (action === "spatial-audio" || action === "sound-check" || action === "usb-dac") onTvAudioAction(action, value);
          else onTvDisplayAction(action, value);
        }};
      }), { push: true });
  }

  function onSettingsRowClick(event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-ui-action]") : null;
    if (!button) return;
    event.preventDefault();
    openSettingsAction(button.getAttribute("data-ui-action"));
  }

  if ($("#settings-list")) {
    $("#settings-list").addEventListener("click", onSettingsRowClick);
    $("#settings-list").addEventListener("focusin", function (event) {
      var row = event.target && event.target.closest ? event.target.closest("[data-description]") : null;
      if (!row) return;
      var description = $("#settings-description");
      if (description) {
        description.classList.add("is-changing");
        window.setTimeout(function () {
          description.textContent = row.getAttribute("data-description");
          description.classList.remove("is-changing");
        }, 100);
      }
    });
  }
  if ($("#np-more")) $("#np-more").addEventListener("click", openSongActions);


  function setSelectedTab(tab) {
    if (!tab) return;
    selectedPage = tab.getAttribute("data-tab") || "home";
    tabs.forEach(function (item) {
      var active = item === tab;
      item.classList.toggle("is-selected", active);
      if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    });
  }
  function showScreen(name) {
    if (!screens[name]) name = "home";
    $$(".screen").forEach(function (s) { s.hidden = s.getAttribute("data-screen") !== name; });
    setSelectedTab($('[data-tab="' + name + '"]'));
    var def = screens[name];
    var age = Date.now() - (builtAt[name] || 0);
    if (!builtAt[name] || age > def.ttl) {
      builtAt[name] = Date.now();
      def.build();
    }
  }

  // ---------------------------------------------------------------------------
  // Player (HTML5 <audio>, native on webOS)
  // ---------------------------------------------------------------------------
  var audio = $("#audio");
  var queue = [], qi = -1, current = null;

  function pickAudio(streams) {
    var list = (streams || []).filter(function (s) { return s && s.url; });
    var mp4 = list.filter(function (s) { return /audio\/mp4/.test(s.mimeType || ""); });
    var pool = mp4.length ? mp4 : list;
    pool.sort(function (a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
    return pool.length ? pool[0].url : null;
  }
  function play(list, index) {
    queue = list;
    qi = index;
    startCurrent();
  }
  function startCurrent() {
    var song = queue[qi];
    if (!song) return;
    current = song;
    updateNowPlaying();
    notify("Loading \u201C" + song.title + "\u201D\u2026");
    api("/streams/" + song.id).then(function (d) {
      if (current !== song) return;
      var url = pickAudio(d.audioStreams);
      if (!url) throw new Error("no audio stream");
      audio.src = url;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* surfaced by the error event */ });
      addHistory(song);
      hideNotice();
    }).catch(function (e) {
      if (current === song) notify("Can't play this song: " + e.message);
    });
  }
  function step(delta) {
    if (!queue.length) return;
    var next = qi + delta;
    if (next < 0) { audio.currentTime = 0; return; }
    if (next >= queue.length) return;
    qi = next;
    startCurrent();
  }
  function togglePlay() {
    if (!current) { notify("Pick a song first."); return; }
    if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } else audio.pause();
  }
  function addHistory(song) {
    history = [song].concat(history.filter(function (s) { return s.id !== song.id; })).slice(0, 50);
    save("history", history);
    delete builtAt.home; delete builtAt.library;
  }
  function isFav(song) {
    return !!song && favorites.some(function (s) { return s.id === song.id; });
  }
  function toggleFav() {
    if (!current) { notify("Nothing to favorite yet."); return; }
    if (isFav(current)) favorites = favorites.filter(function (s) { return s.id !== current.id; });
    else favorites = [current].concat(favorites);
    save("favorites", favorites);
    delete builtAt.home; delete builtAt.library;
    updateNowPlaying();
    notify(isFav(current) ? "Added to Favorites" : "Removed from Favorites");
  }
  function updateNowPlaying() {
    var art = $("#np-art");
    if (current && current.art) { art.src = current.art; art.style.display = ""; } else { art.removeAttribute("src"); art.style.display = "none"; }
    $("#np-title").textContent = current ? current.title : "Nothing playing";
    $("#np-artist").textContent = current ? current.artist : "Pick a song from Home or Search";
    $("#np-fav").innerHTML = isFav(current) ? "&#9829;" : "&#9825;";
    $("#np-play").innerHTML = audio.paused ? "&#9654;" : "&#10074;&#10074;";
  }
  audio.addEventListener("play", updateNowPlaying);
  audio.addEventListener("pause", updateNowPlaying);
  audio.addEventListener("ended", function () { step(1); });
  audio.addEventListener("error", function () { if (current) notify("Playback failed. Trying the next song may help."); });
  audio.addEventListener("timeupdate", function () {
    var d = audio.duration || 0;
    $("#np-fill").style.width = d ? Math.min(100, (audio.currentTime / d) * 100) + "%" : "0";
    $("#np-pos").textContent = fmt(audio.currentTime);
    $("#np-dur").textContent = fmt(d);
  });
  $("#np-play").addEventListener("click", togglePlay);
  $("#np-prev").addEventListener("click", function () { step(-1); });
  $("#np-next").addEventListener("click", function () { step(1); });
  $("#np-fav").addEventListener("click", toggleFav);

  // ---------------------------------------------------------------------------
  // Settings and search wiring
  // ---------------------------------------------------------------------------
  $("#set-test").addEventListener("click", function () {
    saveSettings();
    var status = $("#set-status");
    status.textContent = "Testing\u2026";
    search("test", "music_songs").then(function () {
      status.textContent = "Connected. Songs and playback should work.";
    }, function (e) {
      status.textContent = "Could not connect: " + e.message + ".";
    });
  });
  $("#set-clear").addEventListener("click", function () {
    history = [];
    save("history", history);
    builtAt = {};
    $("#set-status").textContent = "Listening history cleared.";
  });
  $("#set-instance").addEventListener("change", saveSettings);
  $("#set-region").addEventListener("change", saveSettings);

  // ---------------------------------------------------------------------------
  // Remote navigation (same Android TV shelf model as before, now screen-aware)
  // ---------------------------------------------------------------------------
  var tabFocusTimer = null;

  function visible(e) { return !!e && e.offsetParent !== null && !e.disabled; }
  function currentScreen() { return activeDialog || $("#screen-" + selectedPage); }
  function setFocusedControl(element) {
    $$("[data-focus].is-focused").forEach(function (item) { item.classList.remove("is-focused"); });
    if (element && element.matches && element.matches("[data-focus]")) element.classList.add("is-focused");
  }
  function focus(element, reveal) {
    if (!element || element.disabled) return;
    try { element.focus({ preventScroll: true }); } catch (e) { element.focus(); }
    setFocusedControl(element);
    if (reveal !== false && element.scrollIntoView) {
      try { element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" }); }
      catch (e) { element.scrollIntoView(); }
    }
  }
  function focusTab() { focus($('[data-tab="' + selectedPage + '"]') || tabs[0], false); }

  function visibleCards(row) {
    if (!row) return [];
    var rb = row.getBoundingClientRect();
    return $$(".music-card[data-focus]", row).filter(function (c) {
      var b = c.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.right > rb.left + 1 && b.left < rb.right - 1;
    });
  }
  function rows() {
    var s = currentScreen();
    return s ? $$(".card-row", s).filter(visible) : [];
  }
  function lead() {
    var s = currentScreen();
    var l = s && $("[data-lead]", s);
    return visible(l) ? l : null;
  }
  function entry() {
    var l = lead();
    if (l) return l;
    var r = rows()[0];
    var c = r && visibleCards(r)[0];
    if (c) return c;
    var s = currentScreen();
    return s ? $$("[data-focus]", s).filter(visible)[0] : null;
  }
  function moveInRow(current, dir) {
    var row = current.closest(".card-row");
    var cards = $$(".music-card[data-focus]", row);
    var next = cards[cards.indexOf(current) + (dir === "left" ? -1 : 1)];
    if (next) focus(next, true);
  }
  function moveBetweenRows(current, dir) {
    var list = rows();
    var idx = list.indexOf(current.closest(".card-row"));
    var next = idx + (dir === "down" ? 1 : -1);
    if (next < 0) { var l = lead(); if (l) focus(l, true); else focusTab(); return; }
    if (next >= list.length) return;
    var target = visibleCards(list[next])[0];
    if (target) focus(target, true);
  }
  // Nearest focusable in a direction, for screens that are not card shelves.
  function moveGeometric(current, dir) {
    var s = currentScreen();
    var from = current.getBoundingClientRect();
    var fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    var best = null, bestScore = Infinity;
    $$("[data-focus]", s).filter(visible).forEach(function (c) {
      if (c === current) return;
      var b = c.getBoundingClientRect();
      var dx = b.left + b.width / 2 - fx, dy = b.top + b.height / 2 - fy;
      var ok = dir === "right" ? dx > 4 : dir === "left" ? dx < -4 : dir === "down" ? dy > 4 : dy < -4;
      if (!ok) return;
      var main = (dir === "left" || dir === "right") ? Math.abs(dx) : Math.abs(dy);
      var cross = (dir === "left" || dir === "right") ? Math.abs(dy) : Math.abs(dx);
      var score = main + cross * 2;
      if (score < bestScore) { bestScore = score; best = c; }
    });
    if (best) focus(best, true);
    else if (dir === "up") focusTab();
  }

  function moveFocus(dir) {
    var current = document.activeElement;
    if (!current || current === document.body || !current.matches || !current.matches("[data-focus]")) {
      focusTab();
      return;
    }
    if (current.hasAttribute("data-tab") || current === account) {
      if (dir === "down") { var e = entry(); if (e) focus(e, true); return; }
      if (dir === "left" || dir === "right") {
        var ordered = tabs.concat(account ? [account] : []);
        var n = ordered.indexOf(current) + (dir === "left" ? -1 : 1);
        if (ordered[n]) focus(ordered[n], false);
      }
      return;
    }
    if (current.matches(".music-card")) {
      if (dir === "left" || dir === "right") moveInRow(current, dir);
      else moveBetweenRows(current, dir);
      return;
    }
    moveGeometric(current, dir);
  }

  function activate(element) {
    if (!element) return;
    if (element.hasAttribute("data-tab")) {
      showScreen(element.getAttribute("data-tab"));
      hideNotice();
      return;
    }
    if (element === account) {
      openAccountDialog();
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { activate(tab); });
    tab.addEventListener("focus", function () {
      if (tabFocusTimer) window.clearTimeout(tabFocusTimer);
      tabFocusTimer = window.setTimeout(function () {
        if (document.activeElement === tab) setSelectedTab(tab);
      }, 140);
    });
  });
  if (account) account.addEventListener("click", function () { activate(account); });

  window.addEventListener("keydown", function (event) {
    var key = event.key || event.keyIdentifier || "";
    var code = event.keyCode || event.which;
    var active = document.activeElement;
    var typing = active && active.tagName === "INPUT";

    var dirs = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      Left: "left", Right: "right", Up: "up", Down: "down",
      "U+F702": "left", "U+F703": "right", "U+F700": "up", "U+F701": "down"
    };
    var dir = dirs[key] || (code === 37 ? "left" : code === 39 ? "right" : code === 38 ? "up" : code === 40 ? "down" : null);

    // Media keys on the LG remote.
    if ((code === 82 || code === 457) && active && active.matches && active.matches(".music-card")) {
      event.preventDefault();
      openSongActions(active._song || current);
      return;
    }
    if (code === 415 || code === 19 || code === 179) { event.preventDefault(); togglePlay(); return; }
    if (code === 417) { event.preventDefault(); if (current) audio.currentTime += 10; return; }
    if (code === 412) { event.preventDefault(); if (current) audio.currentTime = Math.max(0, audio.currentTime - 10); return; }

    if (dir) {
      // Inside a text field, left/right edit the text; up/down still leave the field.
      if (typing && (dir === "left" || dir === "right")) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      moveFocus(dir);
      return;
    }

    if (key === "Enter" || code === 13 || code === 23 || code === 66) {
      if (typing) {
        if (active.id === "search-input") { event.preventDefault(); runSearch(active.value.trim()); }
        return; // let webOS open or close the on-screen keyboard
      }
      if (active && active.matches && active.matches("button[data-focus]")) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        active.click();
      }
      return;
    }

    // Back (461 on webOS): shelf -> tab bar -> Home; on Home let webOS close the app.
    if (key === "Escape" || key === "Backspace" || key === "BrowserBack" || code === 461 || code === 10009) {
      if (typing) return; // Back closes the on-screen keyboard
      if (activeDialog) { event.preventDefault(); closeTvDialog(); return; }
      var isTab = active && active.hasAttribute && active.hasAttribute("data-tab");
      if (toast && toast.classList.contains("is-visible")) {
        event.preventDefault();
        hideNotice();
      } else if (!isTab && active !== account) {
        event.preventDefault();
        focusTab();
      } else if (isTab && selectedPage !== "home") {
        event.preventDefault();
        showScreen("home");
        focusTab();
      }
    }
  }, true);

  document.addEventListener("focusin", function (event) {
    var t = event.target;
    if (t && t.closest) setFocusedControl(t.closest("[data-focus]"));
  }, true);
  document.addEventListener("focusout", function (event) {
    var t = event.target;
    window.setTimeout(function () {
      var a = document.activeElement;
      if (a === document.body || !a || !a.matches || !a.matches("[data-focus]")) {
        if (t && t.classList) t.classList.remove("is-focused");
      }
    }, 0);
  }, true);
  document.addEventListener("mouseover", function (event) {
    var t = event.target;
    while (t && t !== document && !(t.matches && t.matches("[data-focus]"))) t = t.parentNode;
    if (t && t.matches && t.matches("[data-focus]") && t.tagName !== "INPUT") focus(t, false);
  }, false);

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  updateNowPlaying();
  showScreen("home");
  window.addEventListener("load", function () { window.setTimeout(focusTab, 220); });
}());
