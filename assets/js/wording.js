/*
 * College Quarters — site wording.
 *
 * Every visible text has a key (see wording.json). The page ships with built-in text:
 *   - elements with data-w="key"              -> their text
 *   - elements with data-w-placeholder="key"  -> their placeholder
 *   - <meta data-w-content="key">             -> their content
 *   - <script id="cq-wording"> JSON            -> texts the scripts show (messages etc.)
 * When the feed loads, each key shows the office's text (feed "wording") if present,
 * otherwise the original default from /wording.json. Always inserted as plain text.
 */
window.CQ_WORDING = (function () {
  "use strict";

  var builtIn = {};   // key -> text the page shipped with
  var current = {};   // key -> text in use now
  var targets = [];   // { node, key, kind }

  function oneLine(s) { return String(s).replace(/\s+/g, " ").trim(); }

  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  function remember(key, text) {
    if (!(key in builtIn)) builtIn[key] = text;
  }

  function init() {
    each("[data-w]", function (node) {
      var key = node.getAttribute("data-w");
      targets.push({ node: node, key: key, kind: "text" });
      remember(key, node.textContent);
    });
    each("[data-w-placeholder]", function (node) {
      var key = node.getAttribute("data-w-placeholder");
      targets.push({ node: node, key: key, kind: "placeholder" });
      remember(key, node.getAttribute("placeholder") || "");
    });
    each("meta[data-w-content]", function (node) {
      var key = node.getAttribute("data-w-content");
      targets.push({ node: node, key: key, kind: "content" });
      remember(key, node.getAttribute("content") || "");
    });
    var block = document.getElementById("cq-wording");
    if (block) {
      try {
        var data = JSON.parse(block.textContent);
        Object.keys(data).forEach(function (k) { remember(k, String(data[k])); });
      } catch (e) { /* keep what we have */ }
    }
    current = Object.assign({}, builtIn);
  }

  function render() {
    targets.forEach(function (t) {
      var text = current[t.key];
      if (text === undefined) return;
      if (t.kind === "text") t.node.textContent = t.node.tagName === "TITLE" ? oneLine(text) : text;
      else if (t.kind === "placeholder") t.node.setAttribute("placeholder", text);
      else t.node.setAttribute("content", oneLine(text));
    });
  }

  // feedWording: { key: text } from the feed (only what the office changed).
  // defaults: { key: text } from /wording.json, or null if it couldn't be loaded.
  function apply(feedWording, defaults) {
    var feed = feedWording && typeof feedWording === "object" ? feedWording : {};
    var keys = Object.assign({}, builtIn, defaults || {});
    var next = {};
    Object.keys(keys).forEach(function (k) {
      var v = feed[k];
      if (typeof v === "string" || typeof v === "number") next[k] = String(v);
      else if (defaults && k in defaults) next[k] = defaults[k];
      else next[k] = builtIn[k];
    });
    current = next;
    render();
  }

  // Text for a key, with {name} placeholders filled from vars.
  function t(key, vars) {
    var s = current[key];
    if (s === undefined) {
      if (window.console) console.warn("Missing wording key: " + key);
      return "";
    }
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return vars && vars[name] !== undefined ? String(vars[name]) : m;
    });
  }

  // Original defaults from /wording.json as { key: text }. Resolves to null on failure.
  function loadDefaults() {
    return fetch("/wording.json", { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (data) {
        var map = {};
        (data.sections || []).forEach(function (s) {
          (s.items || []).forEach(function (i) { if (i && typeof i.key === "string") map[i.key] = String(i.default); });
        });
        return map;
      })
      .catch(function () { return null; });
  }

  init();
  return { t: t, apply: apply, loadDefaults: loadDefaults };
})();
