/* College Quarters — loads live rooms and handles the forms. No libraries.
 * All visible text comes from wording via W.t(...) with a literal key; never hard-code text here (see CLAUDE.md). */
(function () {
  "use strict";

  var CFG = window.CQ_CONFIG || {};
  var PHOTOS = window.CQ_PHOTOS || {};
  var W = window.CQ_WORDING;
  var defaultsPromise = W.loadDefaults();
  var FEED_TIMEOUT_MS = 15000;
  var POST_TIMEOUT_MS = 25000;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function str(v) { return v === null || v === undefined ? "" : String(v).trim(); }

  function slug(v) {
    return str(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "room";
  }

  function roomLabel(room) {
    var r = str(room);
    return /^\d+[a-z]?$/i.test(r) ? W.t("rooms.numberedName", { room: r }) : r;
  }

  function formatPrice(price) {
    if (typeof price === "number" && isFinite(price)) {
      var suffix = W.t("rooms.priceSuffix");
      return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 2 }) + (suffix ? " " + suffix : "");
    }
    var p = str(price);
    if (/^\d+(\.\d+)?$/.test(p)) return formatPrice(Number(p));
    return p;
  }

  // 7405907474 -> 740-590-7474 (the feed may send the phone as a number).
  function formatPhone(v) {
    var s = str(v), d = s.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    return d.length === 10 ? d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6) : s;
  }

  // "2027-05-01" -> "May 2027". Month and year only: the site never shows a day of the month.
  function formatMonthYear(v) {
    var m = /^(\d{4})-(\d{1,2})/.exec(str(v));
    if (!m || +m[2] < 1 || +m[2] > 12) return "";
    return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function fetchWithTimeout(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------------- Contact details ---------------- */

  var contact = Object.assign({}, CFG.FALLBACK_CONTACT || {});

  function renderContact() {
    var phone = formatPhone(contact.phone), email = str(contact.email), address = str(contact.address);
    var li;

    li = $('[data-contact="phone"]');
    if (phone) {
      var a = $("a", li);
      a.textContent = phone;
      a.href = "tel:" + phone.replace(/[^\d+]/g, "");
      li.hidden = false;
    } else li.hidden = true;

    li = $('[data-contact="email"]');
    if (email) {
      var b = $("a", li);
      b.textContent = email;
      b.href = "mailto:" + email;
      li.hidden = false;
    } else li.hidden = true;

    li = $('[data-contact="address"]');
    if (address) {
      var c = $("a", li);
      c.textContent = address;
      c.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
      li.hidden = false;
    } else li.hidden = true;

    var landlord = str(contact.landlord);
    $$('[data-contact="landlord"]').forEach(function (n) { n.textContent = landlord; });
    $$('[data-contact="landlord-line"]').forEach(function (n) { n.hidden = !landlord; });
  }

  // " You can also call … or e-mail …." (only when both are known).
  function contactSentence() {
    var phone = formatPhone(contact.phone), email = str(contact.email);
    if (!phone || !email) return "";
    var s = W.t("common.reachUs", { phone: phone, email: email });
    return s ? " " + s : "";
  }

  /* ---------------- Rooms ---------------- */

  var roomsStatus = $("#rooms-status");
  var roomsList = $("#rooms-list");

  function showStatus(nodes) {
    roomsStatus.textContent = "";
    nodes.forEach(function (n) { roomsStatus.appendChild(n); });
    roomsStatus.hidden = false;
  }

  var loadSeq = 0, lastLoaded = 0, hasRooms = false;

  // silent = refresh in the background (returning visitor) without flashing the loading state.
  function loadRooms(silent) {
    var seq = ++loadSeq;
    if (!(silent && hasRooms)) showStatus([
      el("div", { class: "skeleton-card", "aria-hidden": "true" }),
      el("div", { class: "skeleton-card", "aria-hidden": "true" })
    ]);

    fetchWithTimeout(CFG.FEED_URL, { cache: "no-store", credentials: "omit" }, FEED_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false || !Array.isArray(data.rooms)) throw new Error("bad feed");
        return defaultsPromise.then(function (defaults) { return { data: data, defaults: defaults }; });
      })
      .then(function (r) {
        if (seq !== loadSeq) return;
        var data = r.data;
        // The office's wording first, so everything below renders with it.
        W.apply(data.wording, r.defaults);
        // Contact details always come from the feed (config.js only has a backup).
        ["landlord", "phone", "email", "address"].forEach(function (k) {
          if (str(data[k])) contact[k] = str(data[k]);
        });
        renderContact();
        renderRooms(data.rooms);
        lastLoaded = Date.now();
      })
      .catch(function () {
        if (seq !== loadSeq || (silent && hasRooms)) return; // keep showing what we have
        var retry = el("button", { class: "btn btn-ghost", type: "button", text: W.t("rooms.tryAgain") });
        retry.addEventListener("click", function () { loadRooms(false); });
        showStatus([
          el("div", { class: "notice" }, [
            el("p", { text: W.t("rooms.loadError") + contactSentence() }),
            retry
          ])
        ]);
      });
  }

  // availableText is shown exactly as the back office sends it ("Available May 2027", "Available now").
  function availability(r) {
    var now = r.availableNow === true || str(r.availableNow).toLowerCase() === "true";
    var text = str(r.availableText);
    if (!text) {
      var month = formatMonthYear(r.availableFrom);
      text = now ? "Available now" : month ? "Available " + month : "Ask about availability";
    }
    return { now: now || /^available now$/i.test(text), text: text };
  }

  function renderRooms(rooms) {
    roomsList.textContent = "";
    var select = $("#c-room");
    var chosen = select.value;
    $$("option:not([value=''])", select).forEach(function (o) { o.remove(); });

    var valid = rooms.filter(function (r) { return r && str(r.room); });
    hasRooms = valid.length > 0;
    if (!valid.length) {
      showStatus([el("div", { class: "notice" }, [
        el("p", { text: W.t("rooms.none") + contactSentence() }),
        el("a", { class: "btn btn-primary", href: "#contact", text: W.t("rooms.noneButton") })
      ])]);
      return;
    }
    roomsStatus.hidden = true;
    roomsStatus.textContent = "";

    var usedIds = {};
    valid.forEach(function (r, i) {
      var name = str(r.room);
      var id = "room-" + slug(name);
      if (usedIds[id]) id += "-" + i;
      usedIds[id] = true;
      roomsList.appendChild(roomCard(r, id, i === 0));
      select.appendChild(el("option", { value: name, text: roomLabel(name), selected: name === chosen }));
    });

    // Honor links like .../#room-2a once rooms exist (first load only).
    if (!lastLoaded && location.hash && location.hash.indexOf("#room-") === 0) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  function roomCard(r, id, eager) {
    var name = str(r.room);
    var label = roomLabel(name);
    var avail = availability(r);
    var photos = PHOTOS[slug(name)] || [];

    var badge = el("span", { class: "badge " + (avail.now ? "badge-now" : "badge-later"), text: avail.text });
    var price = formatPrice(r.price);
    var askBtn = el("button", { class: "btn btn-primary btn-block", type: "button", text: W.t("rooms.askButton") });
    askBtn.addEventListener("click", function () { openRoomDialog(name); });

    var body = el("div", { class: "room-body" }, [
      el("div", { class: "room-top" }, [
        el("h3", { text: label }),
        price ? el("p", { class: "price", text: price }) : null
      ]),
      badge,
      str(r.description) ? el("p", { class: "desc", text: str(r.description) }) : null,
      askBtn
    ]);

    return el("article", { class: "card room", id: id, "aria-label": label }, [gallery(photos, label, eager), body]);
  }

  /* ---------------- Photo gallery ---------------- */

  function gallery(photos, label, eager) {
    if (!photos.length) {
      return el("div", { class: "gallery gallery-empty" }, [el("span", { text: W.t("rooms.noPhotos") })]);
    }
    var track = el("div", { class: "gallery-track", tabindex: "0", "aria-label": label + " photos" });
    photos.forEach(function (p, i) {
      var img = el("img", {
        src: p.src,
        srcset: p.srcset || null,
        sizes: p.srcset ? "(min-width: 900px) 440px, 100vw" : null,
        width: p.w || null,
        height: p.h || null,
        alt: p.alt || label + ", photo " + (i + 1) + " of " + photos.length,
        loading: eager && i === 0 ? "eager" : "lazy",
        decoding: "async"
      });
      var btn = el("button", { class: "slide", type: "button", "aria-label": "View larger: " + label + ", photo " + (i + 1) }, [img]);
      btn.addEventListener("click", function () { openLightbox(photos, i, label); });
      track.appendChild(btn);
    });

    var wrap = el("div", { class: "gallery" }, [track]);
    if (photos.length > 1) {
      var count = el("span", { class: "gallery-count", text: "1 / " + photos.length });
      var prev = el("button", { class: "gallery-nav prev", type: "button", "aria-label": "Previous photo", text: "‹" });
      var next = el("button", { class: "gallery-nav next", type: "button", "aria-label": "Next photo", text: "›" });
      var step = function (dir) { track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" }); };
      prev.addEventListener("click", function () { step(-1); });
      next.addEventListener("click", function () { step(1); });
      var raf = 0;
      track.addEventListener("scroll", function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
          count.textContent = Math.min(photos.length, i + 1) + " / " + photos.length;
        });
      }, { passive: true });
      wrap.appendChild(prev);
      wrap.appendChild(next);
      wrap.appendChild(count);
    }
    return wrap;
  }

  var lb = $("#lightbox"), lbImg = $("#lightbox-img"), lbCount = $("#lightbox-count");
  var lbState = { photos: [], i: 0, label: "" };

  function showLightboxPhoto() {
    var p = lbState.photos[lbState.i];
    lbImg.src = p.full || p.src;
    lbImg.alt = p.alt || lbState.label + ", photo " + (lbState.i + 1);
    lbCount.textContent = (lbState.i + 1) + " / " + lbState.photos.length;
    var multi = lbState.photos.length > 1;
    $(".lb-prev", lb).hidden = !multi;
    $(".lb-next", lb).hidden = !multi;
  }

  function openLightbox(photos, i, label) {
    lbState = { photos: photos, i: i, label: label };
    showLightboxPhoto();
    openDialog(lb);
  }

  function lbStep(d) {
    var n = lbState.photos.length;
    lbState.i = (lbState.i + d + n) % n;
    showLightboxPhoto();
  }
  $(".lb-prev", lb).addEventListener("click", function () { lbStep(-1); });
  $(".lb-next", lb).addEventListener("click", function () { lbStep(1); });
  lb.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") lbStep(-1);
    if (e.key === "ArrowRight") lbStep(1);
  });
  var touchX = null;
  lb.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* ---------------- Dialogs ---------------- */

  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    document.documentElement.classList.add("no-scroll");
  }
  function closeDialog(d) {
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  }
  $$("dialog").forEach(function (d) {
    d.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });
    $$("[data-close]", d).forEach(function (b) { b.addEventListener("click", function () { closeDialog(d); }); });
    // Tap on the dark backdrop closes it.
    d.addEventListener("click", function (e) { if (e.target === d) closeDialog(d); });
  });

  var roomDialog = $("#room-dialog");
  var roomForm = $("#room-form");

  function openRoomDialog(room) {
    var label = roomLabel(room);
    $("#room-dialog-title").textContent = W.t("dialog.title", { room: label });
    roomForm.elements.room.value = room;
    var msg = roomForm.elements.message;
    if (!msg.value || msg.dataset.auto === "1") {
      msg.value = W.t("dialog.message", { room: label });
      msg.dataset.auto = "1";
    }
    setMsg(roomForm, "", "");
    openDialog(roomDialog);
    roomForm.elements.name.focus();
  }
  roomForm.elements.message.addEventListener("input", function () { this.dataset.auto = "0"; });

  /* ---------------- Forms ---------------- */

  function setMsg(form, text, kind) {
    var p = $(".form-msg", form);
    p.textContent = text;
    p.className = "form-msg" + (kind ? " is-" + kind : "");
  }

  function validate(form) {
    var bad = null;
    $$("input, textarea, select", form).forEach(function (f) {
      if (f.name === "website" || f.type === "hidden") return;
      var v = f.value.trim();
      var invalid = (f.required && !v) || (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
      f.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid && !bad) bad = f;
    });
    if (bad) {
      bad.focus();
      var lbl = form.querySelector('label[for="' + bad.id + '"] [data-w]');
      var field = lbl ? lbl.textContent.trim().toLowerCase() : "";
      setMsg(form, bad.value.trim() ? W.t("form.invalid", { field: field }) : W.t("form.required", { field: field }), "error");
      return false;
    }
    return true;
  }

  function post(payload) {
    return fetchWithTimeout(CFG.APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "follow"
    }, POST_TIMEOUT_MS).then(function (res) {
      return res.json().catch(function () { throw new Error("bad response"); });
    });
  }

  function val(form, name) {
    var f = form.elements[name];
    return f ? f.value.trim() : "";
  }

  $$("form[data-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.dataset.busy === "1") return;
      setMsg(form, "", "");
      if (!validate(form)) return;

      var kind = form.dataset.form;
      var payload = kind === "mylink"
        ? { action: "mylink", email: val(form, "email") }
        : {
            action: "inquiry",
            name: val(form, "name"),
            email: val(form, "email"),
            phone: val(form, "phone"),
            room: val(form, "room"),
            moveIn: val(form, "moveIn"),
            message: val(form, "message"),
            website: form.elements.website ? form.elements.website.value : ""
          };

      var btn = $("button[type=submit]", form);
      var btnText = btn.textContent;
      form.dataset.busy = "1";
      btn.disabled = true;
      btn.textContent = W.t("form.sending");

      post(payload)
        .then(function (res) {
          if (res && res.ok) {
            if (kind === "mylink") {
              setMsg(form, W.t("tenants.sent"), "ok");
            } else {
              setMsg(form, W.t("form.inquirySent"), "ok");
            }
            form.reset();
            if (form === roomForm) roomForm.elements.message.dataset.auto = "0";
          } else {
            setMsg(form, str(res && res.error) || W.t("form.failed"), "error");
          }
        })
        .catch(function () {
          setMsg(form, W.t("form.offline") + contactSentence(), "error");
        })
        .finally(function () {
          form.dataset.busy = "0";
          btn.disabled = false;
          btn.textContent = btnText;
        });
    });
  });

  /* ---------------- Start ---------------- */

  $("#year").textContent = String(new Date().getFullYear());
  renderContact();
  loadRooms(false);

  // Availability can change at any time, so a visitor coming back gets fresh data:
  // via the Back button (page restored from memory) or returning to a tab left open.
  window.addEventListener("pageshow", function (e) { if (e.persisted) loadRooms(true); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && lastLoaded && Date.now() - lastLoaded > 5 * 60 * 1000) loadRooms(true);
  });
})();
