#!/usr/bin/env python3
"""
Check wording.json and the pages against each other. Run before every commit that touches text:

    python3 tools/check_wording.py

Fails (exit 1) when:
  - wording.json is not valid JSON or not in the agreed format
  - a key is malformed or used twice
  - a key used on a page or in a script is missing from wording.json
  - a key in wording.json is no longer used anywhere (remove it)
  - a page's built-in text differs from the default in wording.json (the repo keeps the original text)
  - a data-w element contains anything other than plain text
Warns when keys that exist on origin/main were removed (keys must never be renamed).
"""
import json
import re
import subprocess
import sys

from wording_lib import KEY_RE, PAGES, ROOT, WORDING, js_keys, one_line, page_texts


def main():
    errors, warnings = [], []

    # 1. wording.json format
    try:
        data = json.loads(WORDING.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print("ERROR wording.json is not valid JSON: %s" % e)
        return 1
    if not isinstance(data, dict) or not isinstance(data.get("sections"), list) or not data["sections"]:
        print('ERROR wording.json must be { "sections": [ ... ] } with at least one section')
        return 1
    defaults = {}
    for si, section in enumerate(data["sections"]):
        where = "section %d" % (si + 1)
        if not isinstance(section, dict) or not isinstance(section.get("title"), str) or not section["title"].strip():
            errors.append("%s: needs a non-empty \"title\"" % where)
            continue
        if not isinstance(section.get("items"), list) or not section["items"]:
            errors.append("%s (%s): needs a non-empty \"items\" list" % (where, section["title"]))
            continue
        for item in section["items"]:
            if not isinstance(item, dict):
                errors.append("%s: every item must be an object" % where)
                continue
            key = item.get("key")
            if not isinstance(key, str) or not KEY_RE.match(key):
                errors.append("%s: bad key %r (letters, numbers, dots, dashes, underscores only)" % (where, key))
                continue
            if key in defaults:
                errors.append("key %s is listed twice" % key)
            if not isinstance(item.get("label"), str) or not item["label"].strip():
                errors.append("%s: needs a plain-words \"label\"" % key)
            if not isinstance(item.get("default"), str):
                errors.append("%s: \"default\" must be text" % key)
            if not isinstance(item.get("long"), bool):
                errors.append("%s: \"long\" must be true or false" % key)
            extra = set(item) - {"key", "label", "default", "long"}
            if extra:
                errors.append("%s: unknown fields %s" % (key, sorted(extra)))
            defaults[key] = item.get("default") if isinstance(item.get("default"), str) else ""

    # 2. keys and built-in text on the pages
    used = {}
    index_keys = set()
    block_keys = set()
    for page in PAGES:
        text = (ROOT / page).read_text(encoding="utf-8")
        found = page_texts(text)
        n_attr = len(re.findall(r'\sdata-w="', text))
        n_elem = sum(1 for _, kind, _ in found if kind in ("element", "title"))
        if n_attr != n_elem:
            errors.append("%s: %d data-w elements but only %d contain plain text only (no tags inside a data-w element)"
                          % (page, n_attr, n_elem))
        for key, kind, builtin in found:
            used.setdefault(key, page)
            if page == "index.html":
                index_keys.add(key)
            if kind == "block":
                block_keys.add(key)
            if key not in defaults:
                continue
            if builtin is None:
                errors.append("%s: %s (%s) has no built-in text attribute" % (page, key, kind))
                continue
            expected = one_line(defaults[key]) if kind in ("title", "content") else defaults[key]
            if builtin != expected:
                errors.append("%s: built-in text for %s differs from wording.json default\n      page:    %r\n      default: %r"
                              % (page, key, builtin, expected))

    # 3. keys the scripts use
    scripts = js_keys()
    for key, f in scripts.items():
        used.setdefault(key, f)
        if key not in index_keys:
            errors.append("%s uses %s but index.html has no built-in text for it (add it to the cq-wording block)" % (f, key))
    for key in sorted(block_keys - set(scripts)):
        errors.append("index.html cq-wording block has %s, but no script uses it" % key)

    for key in sorted(set(used) - set(defaults)):
        errors.append("%s uses key %s, which is missing from wording.json" % (used[key], key))
    for key in sorted(set(defaults) - set(used)):
        errors.append("wording.json key %s is not used anywhere: remove it" % key)

    # 4. keys removed compared with the published version
    try:
        old = subprocess.run(["git", "show", "origin/main:wording.json"], cwd=ROOT, capture_output=True, text=True)
        if old.returncode == 0:
            old_keys = {i["key"] for s in json.loads(old.stdout).get("sections", []) for i in s.get("items", [])}
            gone = sorted(old_keys - set(defaults))
            if gone:
                warnings.append("keys removed compared with origin/main (fine only if that text no longer exists; "
                                "never rename a key): " + ", ".join(gone))
    except (OSError, ValueError, KeyError, TypeError):
        pass

    for w in warnings:
        print("WARNING " + w)
    for e in errors:
        print("ERROR " + e)
    if errors:
        print("\n%d problem(s) found." % len(errors))
        return 1
    print("wording.json OK: %d keys in %d sections, all used on the site, built-in text matches."
          % (len(defaults), len(data["sections"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
