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
    count: document.getElementById("count"),
    city: document.getElementById("city"),
    geoMsg: document.getElementById("geo-msg"),
    geoClear: document.getElementById("geo-clear")
  };

  var CITIES = [
    ["תל אביב", 32.08, 34.78], ["ירושלים", 31.77, 35.21], ["חיפה", 32.79, 34.99],
    ["באר שבע", 31.25, 34.79], ["אילת", 29.56, 34.95], ["טבריה", 32.79, 35.53],
    ["צפת", 32.96, 35.50], ["קריית שמונה", 33.21, 35.57], ["נתניה", 32.32, 34.86],
    ["מודיעין", 31.90, 35.01], ["ראשון לציון", 31.97, 34.79], ["אשדוד", 31.80, 34.65],
    ["עפולה", 32.61, 35.29], ["נצרת", 32.70, 35.30], ["כרמיאל", 32.92, 35.30],
    ["הרצליה", 32.16, 34.84], ["רחובות", 31.89, 34.81], ["ערד", 31.26, 35.21],
    ["מצפה רמון", 30.61, 34.80], ["קצרין", 32.99, 35.69]
  ];

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

  // q = שם המקום, כדי ש-Waze יציג יעד עם שם ולא "סיכה נעוצה"; ll = חיפוש סביב נקודת ההתחלה
  function wazeUrl(t) {
    return "https://waze.com/ul?q=" + encodeURIComponent(t.navName || t.name) +
      "&ll=" + t.lat + "," + t.lng + "&navigate=yes";
  }
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
      var shown = state.origin ? result.slice(0, 5) : result;
      var pts = shown.map(function (t) { return [t.lat, t.lng]; });
      if (state.origin) pts.push([state.origin.lat, state.origin.lng]);
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 12 });
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

  // ---------- נקודת מוצא (קרוב אליי) ----------
  var originMarker = null;

  function showMsg(text, isError) {
    els.geoMsg.textContent = text || "";
    els.geoMsg.classList.toggle("error", !!isError);
  }

  function setOrigin(lat, lng, label) {
    state.origin = { lat: lat, lng: lng };
    els.near.textContent = "📍 קרוב אליי";
    showMsg("ממוין לפי מרחק מ" + label);
    els.geoClear.hidden = false;
    if (hasMap) {
      if (originMarker) originMarker.setLatLng([lat, lng]);
      else originMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: "", html: '<div class="origin-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: "נקודת מוצא", zIndexOffset: 1000
      }).bindTooltip("📍 נקודת מוצא").addTo(map);
    }
    render();
  }

  function clearOrigin() {
    state.origin = null;
    els.city.value = "";
    els.geoClear.hidden = true;
    showMsg("");
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    render();
  }

  var IN_APP_TIP = " אם נכנסתם מקישור בתוך אפליקציה (Outlook / Gmail / וואטסאפ) – פתחו את הקישור בדפדפן Chrome או Safari (בתפריט של האפליקציה: \"פתח בדפדפן\"). אפשר גם לבחור עיר או ללחוץ על המפה.";

  function geoError(err) {
    els.near.textContent = "📍 קרוב אליי";
    if (err && err.code === 1) {
      showMsg("אין הרשאה למיקום. אשרו גישה למיקום בהגדרות הדפדפן/הטלפון ונסו שוב." + IN_APP_TIP, true);
    } else {
      showMsg("לא התקבל אות מיקום." + IN_APP_TIP, true);
    }
  }

  els.near.addEventListener("click", function () {
    if (!window.isSecureContext) {
      showMsg("איתור מיקום עובד רק בכתובת מאובטחת (https) – פתחו את האתר דרך GitHub Pages. בינתיים אפשר לבחור עיר או ללחוץ על המפה.", true);
      return;
    }
    if (!navigator.geolocation) {
      showMsg("הדפדפן לא תומך באיתור מיקום – בחרו עיר או לחצו על המפה.", true);
      return;
    }
    els.near.textContent = "⏳ מאתר…";
    showMsg("");
    // יש דפדפנים (בעיקר בתוך אפליקציות) שלא עונים בכלל לבקשת המיקום – לכן שעון עצר משלנו
    var done = false;
    var watchdog = setTimeout(function () { finish(null, { code: 3 }); }, 40000);
    function finish(pos, err) {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      if (pos) setOrigin(pos.coords.latitude, pos.coords.longitude, "המיקום שלך");
      else geoError(err);
    }
    var ok = function (pos) { finish(pos); };
    navigator.geolocation.getCurrentPosition(ok, function (err) {
      if (err.code === 1) return finish(null, err);
      // ניסיון שני: דיוק נמוך וזמן המתנה ארוך יותר
      navigator.geolocation.getCurrentPosition(ok, function (e) { finish(null, e); },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 });
  });

  CITIES.forEach(function (c, i) {
    var o = document.createElement("option");
    o.value = i;
    o.textContent = c[0];
    els.city.appendChild(o);
  });
  els.city.addEventListener("change", function () {
    if (els.city.value === "") return clearOrigin();
    var c = CITIES[Number(els.city.value)];
    setOrigin(c[1], c[2], c[0]);
  });
  els.geoClear.addEventListener("click", clearOrigin);

  if (hasMap) map.on("click", function (e) {
    els.city.value = "";
    setOrigin(e.latlng.lat, e.latlng.lng, "הנקודה שנבחרה במפה");
  });

  render();
})();
