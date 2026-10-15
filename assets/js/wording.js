/*
 * College Quarters — site wording.
 *
 * Every visible text has a key (see wording.json). The published page already contains the office's
 * saved wording (tools/build_site.py writes it in from data/site.json), so nothing is swapped after
 * the page loads. Scripts read their texts (messages etc.) from the <script id="cq-wording"> JSON block.
 */
window.CQ_WORDING = (function () {
  "use strict";

  var texts = {};
  var block = document.getElementById("cq-wording");
  if (block) {
    try {
      var data = JSON.parse(block.textContent);
      Object.keys(data).forEach(function (k) { texts[k] = String(data[k]); });
    } catch (e) { /* leave empty */ }
  }

  // Text for a key, with {name} placeholders filled from vars.
  function t(key, vars) {
    var s = texts[key];
    if (s === undefined) {
      if (window.console) console.warn("Missing wording key: " + key);
      return "";
    }
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return vars && vars[name] !== undefined ? String(vars[name]) : m;
    });
  }

  return { t: t };
})();
