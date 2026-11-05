(function () {
  "use strict";
  var toast = document.getElementById("toast");
  var toastTimer = null;
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var homeScreen = document.getElementById("home-screen");

  function notify(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2400);
  }

  function showHome() {
    tabs.forEach(function (tab) {
      var selected = tab.getAttribute("data-tab") === "home";
      tab.classList.toggle("is-selected", selected);
      if (selected) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    homeScreen.style.display = "block";
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var destination = tab.getAttribute("data-tab");
      if (destination !== "home") {
        notify(destination === "now-playing"
          ? "The TV player is the next webOS port milestone."
          : "The " + destination.replace("-", " ") + " screen is coming in the next port milestone.");
        return;
      }
      showHome();
    });
  });

  Array.prototype.slice.call(document.querySelectorAll(".music-card")).forEach(function (card) {
    card.addEventListener("click", function () {
      notify(card.getAttribute("data-message") || "This action will be connected to BitChord playback.");
    });
  });

  document.querySelector(".account").addEventListener("click", function () {
    notify("Account sign-in and QR pairing will be ported after the Home screen.");
  });

  function visibleFocusable() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-focus]")).filter(function (element) {
      return element.getClientRects().length > 0 && !element.disabled;
    });
  }

  function moveFocus(direction) {
    var elements = visibleFocusable();
    if (!elements.length) return;
    var current = document.activeElement;
    var rect = current && current.getBoundingClientRect ? current.getBoundingClientRect() : null;
    if (!rect || elements.indexOf(current) < 0) { elements[0].focus(); return; }

    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var best = null;
    var bestScore = Infinity;
    elements.forEach(function (candidate) {
      if (candidate === current) return;
      var r = candidate.getBoundingClientRect();
      var dx = r.left + r.width / 2 - cx;
      var dy = r.top + r.height / 2 - cy;
      var primary;
      var secondary;
      if (direction === "left") { if (dx >= -1) return; primary = -dx; secondary = Math.abs(dy); }
      else if (direction === "right") { if (dx <= 1) return; primary = dx; secondary = Math.abs(dy); }
      else if (direction === "up") { if (dy >= -1) return; primary = -dy; secondary = Math.abs(dx); }
      else { if (dy <= 1) return; primary = dy; secondary = Math.abs(dx); }
      var score = primary + secondary * 1.65;
      if (score < bestScore) { bestScore = score; best = candidate; }
    });
    if (best) {
      best.focus();
      if (best.scrollIntoView) best.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (direction === "up" && current.classList.contains("music-card")) {
      var homeTab = document.querySelector('[data-tab="home"]');
      if (homeTab) homeTab.focus();
    }
  }

  document.addEventListener("keydown", function (event) {
    var directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (directions[event.key]) { event.preventDefault(); moveFocus(directions[event.key]); return; }
    if (event.key === "Escape" || event.key === "Backspace" || event.key === "BrowserBack" || event.keyCode === 461 || event.keyCode === 10009) {
      event.preventDefault();
      showHome();
      var homeTab = document.querySelector('[data-tab="home"]');
      if (homeTab) homeTab.focus();
    }
  });

  window.addEventListener("load", function () {
    window.setTimeout(function () {
      var homeTab = document.querySelector('[data-tab="home"]');
      if (homeTab) homeTab.focus();
    }, 180);
  });
}());
