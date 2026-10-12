#!/usr/bin/env python3
"""
Build the site for publishing, with the office's current wording written into the pages.

    python3 tools/build_site.py --out _site                 # fetch the live feed
    python3 tools/build_site.py --out _site --feed-file f.json   # use a saved feed (testing)

Copies the site into --out, then for each key uses the feed's "wording" text when present,
otherwise the default from wording.json, and writes it into the pages' built-in text, the page
title and the description (Google and link previews read these before any script runs).
The repository itself is never changed: wording.json and the pages keep the original text.
If the feed can't be fetched, the defaults are used and the build still succeeds.
"""
import argparse
import json
import re
import shutil
import sys
import time
import urllib.request

from wording_lib import PAGES, ROOT, bake, defaults_map

# Files and folders that are part of the published site.
SITE = ["index.html", "404.html", "wording.json", "robots.txt", "CNAME", ".nojekyll", "assets", "photos"]


def feed_url():
    cfg = (ROOT / "assets" / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r'FEED_URL:\s*"([^"]+)"', cfg)
    if not m:
        sys.exit("FEED_URL not found in assets/js/config.js")
    return m.group(1)


def fetch_feed(url):
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "collegequarters-site-build"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as e:  # network, HTTP or JSON error
            last = e
            time.sleep(2 ** attempt * 2)
    print("WARNING could not load the feed (%s); publishing with the default wording." % last)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--feed-file", help="read the feed from this JSON file instead of the internet")
    args = ap.parse_args()

    defaults = defaults_map()
    feed = json.loads(open(args.feed_file, encoding="utf-8").read()) if args.feed_file else fetch_feed(feed_url())
    office = {}
    if isinstance(feed, dict) and feed.get("ok") is not False and isinstance(feed.get("wording"), dict):
        for k, v in feed["wording"].items():
            if k in defaults and isinstance(v, (str, int, float)) and not isinstance(v, bool):
                office[k] = str(v)
    unknown = sorted(set((feed or {}).get("wording") or {}) - set(defaults)) if isinstance(feed, dict) and isinstance(feed.get("wording"), dict) else []
    texts = dict(defaults, **office)

    out = (ROOT / args.out).resolve()
    if out == ROOT or ROOT not in out.parents:
        sys.exit("--out must be a folder inside the repository, e.g. _site")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in SITE:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, out / name, ignore=shutil.ignore_patterns("*.md", ".DS_Store"))
        elif src.exists():
            shutil.copy2(src, out / name)

    for page in PAGES:
        path = out / page
        path.write_text(bake(path.read_text(encoding="utf-8"), texts), encoding="utf-8")

    print("Built %s: %d texts from the office, %d defaults." % (out.relative_to(ROOT), len(office), len(texts) - len(office)))
    for k in sorted(office):
        print("  office text: %s" % k)
    if unknown:
        print("NOTE the feed has wording for keys the site doesn't use: " + ", ".join(unknown))


if __name__ == "__main__":
    main()
