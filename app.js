(function () {
  "use strict";

  var trails = window.TRAILS || [];
  var state = { q: "", type: "all", dogs: "all", region: "", difficulty: "", origin: null, activeId: null };

  var els = {
    q: document.getElementById("q"),
    near: document.getElementById("near"),
    region: document.getElementById("region"),
    difficulty: document.getElementById("difficulty"),
    list: document.getElementById("list"),
    count: document.getElementById("count")
  };

  // ---------- מפה ----------
  // אם ספריית המפה לא נטענה (למשל ללא אינטרנט) – הרשימה והחיפוש ממשיכים לעבוד
  var hasMap = typeof window.L !== "undefined";
  var map = hasMap ? L.map("map", { zoomControl: true }).setView([31.6, 35.0], 7) : null;
  if (hasMap) L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var markers = {};
  if (hasMap) trails.forEach(function (t) {
    var icon = L.divIcon({
      className: "",
      html: '<div class="pin" style="background:' + colorFor(t) + '"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    markers[t.id] = L.marker([t.lat, t.lng], { icon: icon, title: t.name })
      .bindPopup(popupHtml(t))
      .on("click", function () { setActive(t.id, false); });
  });

  // ---------- עזרים ----------
  function colorFor(t) {
    var css = getComputedStyle(document.documentElement);
    var walk = t.type.indexOf("walk") > -1, bike = t.type.indexOf("bike") > -1;
    return css.getPropertyValue(walk && bike ? "--both" : bike ? "--bike" : "--walk").trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // מנרמל עברית: מסיר ניקוד, גרשיים ומקפים כדי שחיפוש יהיה סלחני
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[֑-ׇ]/g, "")
      .replace(/["'״׳\-–]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wazeUrl(t) { return "https://waze.com/ul?ll=" + t.lat + "," + t.lng + "&navigate=yes"; }
  function gmapsUrl(t) { return "https://www.google.com/maps/dir/?api=1&destination=" + t.lat + "," + t.lng; }

  function typeLabel(t) {
    return t.type.map(function (x) { return x === "walk" ? "🚶 רגלי" : "🚴 אופניים"; }).join(" · ");
  }

  function distanceKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function navLinks(t) {
    return '<div class="nav">' +
      '<a href="' + wazeUrl(t) + '" target="_blank" rel="noopener">🧭 נווט ב-Waze</a>' +
      '<a class="alt" href="' + gmapsUrl(t) + '" target="_blank" rel="noopener">Google Maps</a>' +
      "</div>";
  }

  function popupHtml(t) {
    return "<strong>" + esc(t.name) + "</strong><br>" +
      esc(typeLabel(t)) + " · " + esc(t.difficulty) + " · " + t.lengthKm + ' ק"מ<br>' +
      (t.dogs ? "🐕 מותר עם כלב" : "🚫 אסור עם כלב") + "<br>" +
      "🧭 ניווט: " +
      '<bdi><a href="' + wazeUrl(t) + '" target="_blank" rel="noopener">Waze</a></bdi> · ' +
      '<bdi><a href="' + gmapsUrl(t) + '" target="_blank" rel="noopener">Google Maps</a></bdi>';
  }

  // ---------- סינון ----------
  function matches(t) {
    if (state.type !== "all" && t.type.indexOf(state.type) === -1) return false;
    if (state.dogs === "yes" && !t.dogs) return false;
    if (state.dogs === "no" && t.dogs) return false;
    if (state.region && t.region !== state.region) return false;
    if (state.difficulty && t.difficulty !== state.difficulty) return false;
    if (state.q) {
      var hay = norm([t.name, t.region, t.description, t.dogNote, t.difficulty, typeLabel(t)].join(" "));
      var words = norm(state.q).split(" ");
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
    }
    return true;
  }

  function render() {
    var result = trails.filter(matches);
    if (state.origin) {
      result.forEach(function (t) { t._dist = distanceKm(state.origin, t); });
      result.sort(function (a, b) { return a._dist - b._dist; });
    }

    els.count.textContent = result.length === trails.length
      ? "מציג את כל " + trails.length + " המסלולים"
      : "נמצאו " + result.length + " מסלולים מתוך " + trails.length;

    if (!result.length) {
      els.list.innerHTML = '<li class="empty">לא נמצאו מסלולים. נסו לשנות את החיפוש או הסינון.</li>';
    } else {
      els.list.innerHTML = result.map(cardHtml).join("");
    }

    if (!hasMap) return;
    // עדכון המפה
    var visible = {};
    result.forEach(function (t) { visible[t.id] = true; });
    trails.forEach(function (t) {
      var m = markers[t.id];
      if (visible[t.id]) { if (!map.hasLayer(m)) m.addTo(map); }
      else if (map.hasLayer(m)) map.removeLayer(m);
    });
    if (result.length) {
      map.fitBounds(L.latLngBounds(result.map(function (t) { return [t.lat, t.lng]; })), { padding: [30, 30], maxZoom: 12 });
    }
  }

  function cardHtml(t) {
    return '<li class="card' + (t.id === state.activeId ? " active" : "") + '" data-id="' + t.id + '" tabindex="0">' +
      "<h2>" + esc(t.name) + "</h2>" +
      '<div class="meta">📍 ' + esc(t.region) +
        (state.origin ? " · " + t._dist.toFixed(0) + ' ק"מ ממך' : "") + "</div>" +
      '<div class="tags">' +
        '<span class="tag">' + esc(typeLabel(t)) + "</span>" +
        '<span class="tag ' + (t.dogs ? "dog-yes" : "dog-no") + '">' + (t.dogs ? "🐕 מותר עם כלב" : "🚫 בלי כלבים") + "</span>" +
        '<span class="tag">' + esc(t.difficulty) + "</span>" +
        '<span class="tag">' + t.lengthKm + ' ק"מ · ~' + t.durationH + " שעות</span>" +
        '<span class="tag">' + (t.circular ? "🔁 מעגלי" : "➡️ קווי") + "</span>" +
        (t.water ? '<span class="tag">💧 מים</span>' : "") +
      "</div>" +
      '<p class="desc">' + esc(t.description) + "</p>" +
      '<p class="dog-note">' + esc(t.dogNote) + "</p>" +
      navLinks(t) +
      "</li>";
  }

  function setActive(id, fly) {
    state.activeId = id;
    var cards = els.list.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) {
      var on = Number(cards[i].getAttribute("data-id")) === id;
      cards[i].classList.toggle("active", on);
      if (on && !fly) cards[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (fly && hasMap) {
      var m = markers[id];
      map.flyTo(m.getLatLng(), 12, { duration: 0.6 });
      m.openPopup();
    }
  }

  // ---------- אירועים ----------
  var regions = [];
  trails.forEach(function (t) { if (regions.indexOf(t.region) === -1) regions.push(t.region); });
  regions.forEach(function (r) {
    var o = document.createElement("option");
    o.value = o.textContent = r;
    els.region.appendChild(o);
  });

  els.q.addEventListener("input", function () { state.q = els.q.value; render(); });
  els.region.addEventListener("change", function () { state.region = els.region.value; render(); });
  els.difficulty.addEventListener("change", function () { state.difficulty = els.difficulty.value; render(); });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var key = chip.getAttribute("data-filter");
      state[key] = chip.getAttribute("data-value");
      document.querySelectorAll('.chip[data-filter="' + key + '"]').forEach(function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      render();
    });
  });

  els.list.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var card = e.target.closest(".card");
    if (card) setActive(Number(card.getAttribute("data-id")), true);
  });
  els.list.addEventListener("keydown", function (e) {
    var card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setActive(Number(card.getAttribute("data-id")), true);
    }
  });

  els.near.addEventListener("click", function () {
    if (!navigator.geolocation) { alert("הדפדפן לא תומך באיתור מיקום"); return; }
    els.near.textContent = "⏳ מאתר…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      els.near.textContent = "📍 ממוין לפי מרחק";
      render();
    }, function () {
      els.near.textContent = "📍 קרוב אליי";
      alert("לא הצלחנו לאתר את המיקום שלך");
    }, { enableHighAccuracy: false, timeout: 10000 });
  });

  render();
})();
