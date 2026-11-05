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
      return card(featured ? "featured" : "recent", s.title, s.artist, s.art, function () { play(list, i); });
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
  var tabs = $$("[data-tab]");
  var account = $(".account");

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
  function currentScreen() { return $("#screen-" + selectedPage); }
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
      notify("Sign-in is not available yet. Favorites and history are saved on this TV.");
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
