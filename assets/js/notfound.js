/* "Page not found" page: show the office's current wording from the feed (built-in text stays if it fails). */
(function () {
  "use strict";
  var CFG = window.CQ_CONFIG || {};
  var W = window.CQ_WORDING;
  var defaultsPromise = W.loadDefaults();
  fetch(CFG.FEED_URL, { cache: "no-store", credentials: "omit" })
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (data) {
      if (!data || data.ok === false) return;
      return defaultsPromise.then(function (defaults) { W.apply(data.wording, defaults); });
    })
    .catch(function () { /* keep built-in text */ });
})();
