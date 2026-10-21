/* College Quarters — photo galleries, the photo viewer and the forms. No libraries.
 * The rooms, prices, photos and contact details are already in the page (tools/build_site.py writes them in
 * from data/site.json); this script only adds behaviour to them. Used on the home page and the room pages.
 * All visible text comes from wording via W.t(...) with a literal key; never hard-code text here (see CLAUDE.md). */
(function () {
  "use strict";

  var CFG = window.CQ_CONFIG || {};
  var PHOTOS = window.CQ_PHOTOS || {};
  var W = window.CQ_WORDING;
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

  function fetchWithTimeout(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------------- Contact details (for messages) ---------------- */

  // Phone and e-mail written into the page from the saved data (config.js only has a backup).
  var contact = Object.assign({}, CFG.FALLBACK_CONTACT || {});
  (function () {
    var block = document.getElementById("cq-data");
    try {
      var data = block ? JSON.parse(block.textContent) : null;
      if (data) ["phone", "email"].forEach(function (k) { if (str(data[k])) contact[k] = str(data[k]); });
    } catch (e) { /* keep the backup */ }
  })();

  // " You can also call … or e-mail …." (only when both are known).
  function contactSentence() {
    var phone = str(contact.phone), email = str(contact.email);
    if (!phone || !email) return "";
    var s = W.t("common.reachUs", { phone: phone, email: email });
    return s ? " " + s : "";
  }

  /* ---------------- Photo galleries ---------------- */

  // Photos stored in this repo. Folders are named by room number ("2"); the data may say "2" or "Room 2".
  function repoPhotos(name) {
    var m = /^room\s*(.+)$/i.exec(str(name));
    var list = PHOTOS[slug(name)] || (m && PHOTOS[slug(m[1])]) || [];
    var abs = function (p) { return /^(https?:)?\//.test(p) ? p : "/" + p; };
    return list.map(function (p) {
      return {
        src: abs(p.src),
        srcset: p.srcset ? p.srcset.split(",").map(function (s) { return abs(s.trim()); }).join(", ") : null,
        full: abs(p.full || p.src), w: p.w, h: p.h
      };
    });
  }

  // Builds a gallery like the one the build writes (used only when every saved photo of a room fails to load).
  function buildGallery(room, label, photos) {
    if (!photos.length) {
      return el("div", { class: "gallery gallery-empty" }, [el("span", { text: W.t("rooms.noPhotos") })]);
    }
    var track = el("div", { class: "gallery-track", tabindex: "0", "aria-label": label + " photos" });
    photos.forEach(function (p, i) {
      track.appendChild(el("button", { class: "slide", type: "button", "aria-label": "View larger: " + label + ", photo " + (i + 1) }, [
        el("img", {
          src: p.src, srcset: p.srcset || null, sizes: p.srcset ? "(min-width: 900px) 600px, 100vw" : null,
          width: p.w || null, height: p.h || null, alt: label + ", photo " + (i + 1) + " of " + photos.length,
          loading: "lazy", decoding: "async", "data-full": p.full
        })
      ]));
    });
    var wrap = el("div", { class: "gallery", "data-room": room, "data-label": label }, [track]);
    if (photos.length > 1) {
      wrap.appendChild(el("button", { class: "gallery-nav prev", type: "button", "aria-label": "Previous photo", text: "‹" }));
      wrap.appendChild(el("button", { class: "gallery-nav next", type: "button", "aria-label": "Next photo", text: "›" }));
      wrap.appendChild(el("span", { class: "gallery-count", text: "1 / " + photos.length }));
    }
    return wrap;
  }

  function setupGallery(wrap) {
    var track = $(".gallery-track", wrap);
    if (!track) return;
    var label = wrap.getAttribute("data-label") || "";
    var slides = $$(".slide", track);
    var photos = slides.map(function (btn) {
      var img = $("img", btn);
      return { img: img, btn: btn, full: img.getAttribute("data-full") || img.src, alt: img.alt, remote: img.hasAttribute("data-remote") };
    });
    var count = $(".gallery-count", wrap), prev = $(".gallery-nav.prev", wrap), next = $(".gallery-nav.next", wrap);

    function updateCount() {
      if (!count) return;
      var single = photos.length < 2;
      count.hidden = prev.hidden = next.hidden = single;
      var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      count.textContent = Math.min(photos.length, i + 1) + " / " + photos.length;
    }

    photos.forEach(function (p) {
      p.btn.addEventListener("click", function () { openLightbox(photos, photos.indexOf(p), label); });
      if (!p.remote) return;
      // A saved photo that doesn't load is dropped; if none are left, the repo photos are shown.
      var drop = function () {
        var at = photos.indexOf(p);
        if (at < 0) return;
        photos.splice(at, 1);
        p.btn.remove();
        if (!photos.length) {
          var room = wrap.getAttribute("data-room");
          var replacement = buildGallery(room, label, repoPhotos(room));
          wrap.replaceWith(replacement);
          setupGallery(replacement);
          return;
        }
        updateCount();
      };
      if (p.img.complete && p.img.naturalWidth === 0) drop();
      else p.img.addEventListener("error", drop, { once: true });
    });

    if (prev && next) {
      var step = function (dir) { track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" }); };
      prev.addEventListener("click", function () { step(-1); });
      next.addEventListener("click", function () { step(1); });
      var raf = 0;
      track.addEventListener("scroll", function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(updateCount);
      }, { passive: true });
    }
  }

  $$(".gallery").forEach(setupGallery);

  /* ---------------- Photo viewer ---------------- */

  var lb = $("#lightbox"), lbImg = $("#lightbox-img"), lbCount = $("#lightbox-count");
  var lbState = { photos: [], i: 0, label: "" };

  function showLightboxPhoto() {
    var p = lbState.photos[lbState.i];
    lbImg.referrerPolicy = p.remote ? "no-referrer" : "";
    lbImg.src = p.full;
    lbImg.alt = p.alt || lbState.label + ", photo " + (lbState.i + 1);
    lbCount.textContent = (lbState.i + 1) + " / " + lbState.photos.length;
    var multi = lbState.photos.length > 1;
    $(".lb-prev", lb).hidden = !multi;
    $(".lb-next", lb).hidden = !multi;
  }

  function openLightbox(photos, i, label) {
    if (!lb || !photos.length) return;
    lbState = { photos: photos, i: Math.max(0, i), label: label };
    showLightboxPhoto();
    openDialog(lb);
  }

  function lbStep(d) {
    var n = lbState.photos.length;
    if (!n) return;
    lbState.i = (lbState.i + d + n) % n;
    showLightboxPhoto();
  }
  if (lb) {
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
  }

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

  // "Ask about this room" pop-up (home page).
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
  if (roomDialog && roomForm) {
    roomForm.elements.message.addEventListener("input", function () { this.dataset.auto = "0"; });
    $$("[data-ask]").forEach(function (b) {
      b.addEventListener("click", function () { openRoomDialog(b.getAttribute("data-ask")); });
    });
  }

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
            // The room stays chosen on a room page (form.reset() keeps the hidden room's value).
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
})();
