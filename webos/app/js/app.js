(function () {
  "use strict";
  var toast = document.getElementById("toast");
  var timer = null;
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var account = document.querySelector(".account");
  var home = document.getElementById("home-screen");
  var selectedPage = "home";

  function notify(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2600);
  }

  function hideNotice() {
    if (toast) toast.classList.remove("is-visible");
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  function selectedTab() {
    return document.querySelector('[data-tab="' + selectedPage + '"]') ||
      document.querySelector('[data-tab="home"]');
  }

  function focus(element, reveal) {
    if (!element || element.disabled) return;
    try { element.focus({ preventScroll: true }); } catch (error) { element.focus(); }
    if (reveal !== false && element.scrollIntoView) {
      try { element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" }); }
      catch (error) { element.scrollIntoView(); }
    }
  }

  function focusTab() { focus(selectedTab(), false); }

  function showHome() {
    selectedPage = "home";
    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-tab") === selectedPage;
      tab.classList.toggle("is-selected", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    home.style.display = "block";
    hideNotice();
    focusTab();
  }

  function center(element) {
    var r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Android TV's TvRow enters every shelf at its leading visible card.
  // This keeps D-pad movement predictable instead of jumping to the card that
  // happens to share the previous row's horizontal coordinate.
  function firstVisibleCard(row) {
    if (!row) return null;
    var bounds = row.getBoundingClientRect();
    var cards = Array.prototype.slice.call(row.querySelectorAll(".music-card[data-focus]"));
    for (var i = 0; i < cards.length; i += 1) {
      var cardBounds = cards[i].getBoundingClientRect();
      if (cardBounds.right > bounds.left + 1 && cardBounds.left < bounds.right - 1) {
        return cards[i];
      }
    }
    return cards[0] || null;
  }

  function moveHorizontal(current, direction) {
    var row = current.closest(".card-row");
    var items = row
      ? Array.prototype.slice.call(row.querySelectorAll(".music-card[data-focus]"))
      : tabs.concat(account ? [account] : []);
    var index = items.indexOf(current);
    var next = index + (direction === "left" ? -1 : 1);
    if (index >= 0 && items[next]) focus(items[next], true);
  }

  function moveVertical(current, direction) {
    var rows = Array.prototype.slice.call(document.querySelectorAll("#home-feed .card-row"));
    var currentRow = current.closest(".card-row");

    if (!currentRow) {
      if (direction === "down") focus(firstVisibleCard(rows[0]), true);
      return;
    }

    var index = rows.indexOf(currentRow);
    var nextIndex = direction === "down" ? index + 1 : index - 1;
    if (nextIndex < 0) { focusTab(); return; }
    if (nextIndex >= rows.length) return;
    focus(firstVisibleCard(rows[nextIndex]), true);
  }

  function moveFocus(direction) {
    var targets = Array.prototype.slice.call(document.querySelectorAll("[data-focus]"));
    var current = document.activeElement;
    if (targets.indexOf(current) < 0) { focusTab(); return; }
    if (direction === "left" || direction === "right") moveHorizontal(current, direction);
    else moveVertical(current, direction);
  }

  function activate(element) {
    if (!element) return;
    if (element.hasAttribute("data-tab")) {
      var page = element.getAttribute("data-tab");
      if (page === "home") { showHome(); return; }
      var messages = {
        explore: "Explore is not connected to the live BitChord catalog yet.",
        library: "Library sign-in and saved music are not connected to webOS yet.",
        "now-playing": "Start playback from a connected music source to use Now Playing.",
        search: "Search is not connected to the BitChord catalog yet.",
        settings: "Settings will be ported from Android TV in a later milestone."
      };
      notify(messages[page] || "This section is not available in this webOS build yet.");
      return;
    }
    if (element === account) {
      notify("Account sign-in and QR pairing are not connected to webOS yet.");
      return;
    }
    if (element.classList.contains("music-card")) {
      notify(element.getAttribute("data-message") || "Playback is not connected to webOS yet.");
    }
  }

  tabs.forEach(function (tab) { tab.addEventListener("click", function () { activate(tab); }); });
  Array.prototype.slice.call(document.querySelectorAll(".music-card")).forEach(function (card) {
    card.addEventListener("click", function () { activate(card); });
  });
  if (account) account.addEventListener("click", function () { activate(account); });

  document.addEventListener("keydown", function (event) {
    var key = event.key;
    var code = event.keyCode || event.which;
    var direction = ({
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down"
    })[key] || (code === 37 ? "left" : code === 39 ? "right" : code === 38 ? "up" : code === 40 ? "down" : null);

    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(direction);
      return;
    }

    if (key === "Enter" || code === 13 || code === 23 || code === 66) {
      var active = document.activeElement;
      if (active && active.matches && active.matches("button[data-focus]")) {
        event.preventDefault();
        event.stopPropagation();
        active.click();
      }
      return;
    }

    // LG webOS remote Back is keyCode 461. From a shelf, return to the tab bar;
    // on the selected Home tab, let webOS handle the app exit.
    if (key === "Escape" || key === "Backspace" || key === "BrowserBack" || code === 461 || code === 10009) {
      var focused = document.activeElement;
      var isCard = focused && focused.classList && focused.classList.contains("music-card");
      var isTab = focused && focused.hasAttribute && focused.hasAttribute("data-tab");

      if (toast && toast.classList.contains("is-visible")) {
        event.preventDefault();
        hideNotice();
      } else if (isCard || (isTab && focused.getAttribute("data-tab") !== selectedPage) ||
          (focused !== account && !isTab)) {
        event.preventDefault();
        focusTab();
      } else if (isTab && selectedPage !== "home") {
        event.preventDefault();
        showHome();
      }
    }
  });

  window.addEventListener("load", function () {
    window.setTimeout(focusTab, 220);
  });
}());