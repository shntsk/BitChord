(function () {
  "use strict";

  var toast = document.getElementById("toast");
  var timer = null;
  var tabFocusTimer = null;
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var account = document.querySelector(".account");
  var home = document.getElementById("home-screen");
  var selectedPage = "home";

  function notify(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
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

  function setSelectedTab(tab) {
    if (!tab) return;
    selectedPage = tab.getAttribute("data-tab") || "home";
    tabs.forEach(function (item) {
      var active = item === tab;
      item.classList.toggle("is-selected", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function focus(element, reveal) {
    if (!element || element.disabled) return;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
    if (reveal !== false && element.scrollIntoView) {
      try {
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      } catch (error) {
        element.scrollIntoView();
      }
    }
  }

  function focusTab() {
    focus(selectedTab(), false);
  }

  function visibleCards(row) {
    if (!row) return [];
    var rowBounds = row.getBoundingClientRect();
    return Array.prototype.slice.call(row.querySelectorAll(".music-card[data-focus]"))
      .filter(function (card) {
        var bounds = card.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.right > rowBounds.left + 1 && bounds.left < rowBounds.right - 1;
      });
  }

  function firstVisibleCard(row) {
    var cards = visibleCards(row);
    return cards[0] || null;
  }

  function moveWithinRow(current, direction) {
    var row = current.closest(".card-row");
    if (!row) return false;
    var cards = Array.prototype.slice.call(row.querySelectorAll(".music-card[data-focus]"));
    var index = cards.indexOf(current);
    var nextIndex = direction === "left" ? index - 1 : index + 1;
    if (index < 0 || !cards[nextIndex]) return false;
    focus(cards[nextIndex], true);
    return true;
  }

  function moveBetweenRows(current, direction) {
    var rows = Array.prototype.slice.call(document.querySelectorAll("#home-feed .card-row"));
    var currentRow = current.closest(".card-row");
    if (!currentRow) {
      if (direction !== "down") return false;
      var first = firstVisibleCard(rows[0]);
      if (!first) return false;
      focus(first, true);
      return true;
    }

    var index = rows.indexOf(currentRow);
    var nextIndex = direction === "down" ? index + 1 : index - 1;
    if (nextIndex < 0) {
      focusTab();
      return true;
    }
    if (nextIndex >= rows.length) return false;

    var target = firstVisibleCard(rows[nextIndex]);
    if (!target) return false;
    focus(target, true);
    return true;
  }

  // The Android TV implementation enters a TvRow at its first visible card,
  // then advances horizontally inside that row and vertically between shelves.
  function moveFocus(direction) {
    var current = document.activeElement;

    if (!current || current === document.body || !current.matches ||
        !current.matches("[data-focus]")) {
      focusTab();
      current = document.activeElement;
    }

    if (current && current.matches && current.matches(".music-card[data-focus]")) {
      if (direction === "left" || direction === "right") {
        moveWithinRow(current, direction);
      } else {
        moveBetweenRows(current, direction);
      }
      return;
    }

    if (current && current.hasAttribute && current.hasAttribute("data-tab")) {
      if (direction === "down") {
        moveBetweenRows(current, "down");
        return;
      }
      if (direction === "left" || direction === "right") {
        var orderedTabs = tabs.concat(account ? [account] : []);
        var index = orderedTabs.indexOf(current);
        var nextIndex = direction === "left" ? index - 1 : index + 1;
        if (index >= 0 && orderedTabs[nextIndex]) focus(orderedTabs[nextIndex], false);
      }
      return;
    }

    if (current === account) {
      if (direction === "left") {
        focus(tabs[tabs.length - 1], false);
      } else if (direction === "down") {
        moveBetweenRows(current, "down");
      }
    }
  }

  function showHome() {
    var homeTab = document.querySelector('[data-tab="home"]');
    setSelectedTab(homeTab);
    if (home) home.style.display = "block";
    hideNotice();
    focusTab();
  }

  function activate(element) {
    if (!element) return;
    if (element.hasAttribute("data-tab")) {
      var page = element.getAttribute("data-tab");
      setSelectedTab(element);
      if (page === "home") {
        showHome();
        return;
      }
      var messages = {
        explore: "Explore is not connected to the live BitChord catalog yet.",
        library: "Library sign-in and saved music are not connected to webOS yet.",
        "now-playing": "Start playback from a connected music source to use Now Playing.",
        search: "Search is not connected to the BitChord catalog yet.",
        settings: "Settings are not connected yet."
      };
      notify(messages[page] || "This section is not available in this build yet.");
      return;
    }
    if (element === account) {
      notify("Account sign-in and QR pairing are not connected yet.");
      return;
    }
    if (element.classList.contains("music-card")) {
      notify(element.getAttribute("data-message") || "Playback is not connected yet.");
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      activate(tab);
    });
    tab.addEventListener("focus", function () {
      if (tabFocusTimer) window.clearTimeout(tabFocusTimer);
      tabFocusTimer = window.setTimeout(function () {
        if (document.activeElement === tab) setSelectedTab(tab);
      }, 140);
    });
  });

  Array.prototype.slice.call(document.querySelectorAll(".music-card")).forEach(function (card) {
    card.addEventListener("click", function () {
      activate(card);
    });
  });

  if (account) {
    account.addEventListener("click", function () {
      activate(account);
    });
  }

  // Capture remote keys before the browser or any other listener can consume
  // them. LG webOS remotes expose either key names or the classic arrow codes.
  window.addEventListener("keydown", function (event) {
    var key = event.key || event.keyIdentifier || "";
    var code = event.keyCode || event.which;
    var directions = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Left: "left",
      Right: "right",
      Up: "up",
      Down: "down",
      "U+F702": "left",
      "U+F703": "right",
      "U+F700": "up",
      "U+F701": "down"
    };
    var direction = directions[key] ||
      (code === 37 ? "left" : code === 39 ? "right" :
        code === 38 ? "up" : code === 40 ? "down" : null);

    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      moveFocus(direction);
      return;
    }

    if (key === "Enter" || code === 13 || code === 23 || code === 66) {
      var active = document.activeElement;
      if (active && active.matches && active.matches("button[data-focus]")) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        active.click();
      }
      return;
    }

    // LG webOS remote Back is keyCode 461. From a shelf, return to the selected
    // tab; from another tab, return Home; on Home's tab, let webOS exit the app.
    if (key === "Escape" || key === "Backspace" || key === "BrowserBack" ||
        code === 461 || code === 10009) {
      var focused = document.activeElement;
      var isCard = focused && focused.classList &&
        focused.classList.contains("music-card");
      var isTab = focused && focused.hasAttribute &&
        focused.hasAttribute("data-tab");

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
  }, true);

  // Keep pointer focus and remote focus on the same element when using the
  // Magic Remote's cursor mode.
  document.addEventListener("mouseover", function (event) {
    var target = event.target;
    while (target && target !== document &&
        !(target.matches && target.matches("[data-focus]"))) {
      target = target.parentNode;
    }
    if (target && target.matches && target.matches("[data-focus]")) {
      focus(target, false);
    }
  }, false);

  window.addEventListener("load", function () {
    window.setTimeout(focusTab, 220);
  });
}());
