#!/usr/bin/env python3
"""
Build the site for publishing from the saved website data.

    python3 tools/build_site.py --out _site                       # uses data/site.json
    python3 tools/build_site.py --out _site --data-file other.json  # testing

data/site.json is written by the Rentals app (Website tab -> Save) through the GitHub API; that
commit makes GitHub Pages republish. The build writes the saved wording into the pages' text,
title and description, and the rooms and contact details into index.html (the cq-data block), so
visitors get the finished page straight away: the site never calls the Apps Script when it loads.
The repository's pages and wording.json keep the original text (wording.json defaults).
"""
import argparse
import json
import re
import shutil
import sys

from wording_lib import PAGES, ROOT, bake, defaults_map

# Files and folders that are part of the published site.
SITE = ["index.html", "404.html", "tenant.html", "wording.json", "robots.txt", "CNAME", ".nojekyll", "assets", "photos"]
DATA_FILE = ROOT / "data" / "site.json"
DATA_BLOCK_RE = re.compile(r'(<script type="application/json" id="cq-data">)(.*?)(</script>)', re.S)
ROOM_FIELDS = ("room", "price", "description", "availableNow", "availableFrom", "availableText")


def text(v):
    if v is None or isinstance(v, bool):
        return ""
    return str(v).strip()


def load_data(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        sys.exit("%s is missing. Press Save on the Website tab in the Rentals app to create it." % path.relative_to(ROOT))
    except ValueError as e:
        sys.exit("%s is not valid JSON: %s" % (path.relative_to(ROOT), e))
    if not isinstance(data, dict) or not isinstance(data.get("rooms"), list):
        sys.exit("%s has no rooms list." % path.relative_to(ROOT))
    return data


def office_wording(data, defaults):
    """The office's texts, matched to the site's keys (spaces and capitals ignored; blank = not changed)."""
    by_lower = {k.lower(): k for k in defaults}
    raw = data.get("wording")
    pairs = []
    if isinstance(raw, dict):
        pairs = list(raw.items())
    elif isinstance(raw, list):  # also accept [{ key, text }]
        pairs = [(r.get("key"), r.get("text", r.get("value"))) for r in raw if isinstance(r, dict)]
    office, unknown = {}, []
    for k, v in pairs:
        key = by_lower.get(text(k).lower())
        value = v if isinstance(v, str) else (str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else "")
        value = value.strip()
        if not key:
            if text(k):
                unknown.append(text(k))
        elif value:
            office[key] = value
    return office, unknown


def public_data(data):
    """Only what the website shows: business contact details and listed rooms. Nothing else is published."""
    rooms = []
    for r in data["rooms"]:
        if not isinstance(r, dict) or not text(r.get("room")):
            continue
        room = {f: r.get(f) for f in ROOM_FIELDS if r.get(f) is not None}
        room["room"] = text(r.get("room"))
        room["description"] = text(r.get("description"))
        room["availableText"] = text(r.get("availableText"))
        room["availableFrom"] = text(r.get("availableFrom"))
        room["availableNow"] = r.get("availableNow") is True or text(r.get("availableNow")).lower() == "true"
        photos = r.get("photos")
        room["photos"] = [text(p) for p in photos if text(p)] if isinstance(photos, list) else []
        rooms.append(room)
    return {
        "landlord": text(data.get("landlord")),
        "phone": text(data.get("phone")),
        "email": text(data.get("email")),
        "address": text(data.get("address")),
        "rooms": rooms,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--data-file", help="read the website data from this file instead of data/site.json")
    args = ap.parse_args()

    defaults = defaults_map()
    data = load_data((ROOT / args.data_file).resolve() if args.data_file else DATA_FILE)
    office, unknown = office_wording(data, defaults)
    texts = dict(defaults, **office)
    site = public_data(data)

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
        page_html = bake(path.read_text(encoding="utf-8"), texts)
        if page == "index.html":
            block = json.dumps(site, ensure_ascii=False, indent=1).replace("<", "\\u003c")
            page_html, n = DATA_BLOCK_RE.subn(lambda m: m.group(1) + "\n" + block + "\n" + m.group(3), page_html)
            if n != 1:
                sys.exit("index.html needs exactly one cq-data block")
        path.write_text(page_html, encoding="utf-8")

    print("Built %s: %d rooms, %d texts from the office, %d defaults." % (
        out.relative_to(ROOT), len(site["rooms"]), len(office), len(texts) - len(office)))
    for k in sorted(office):
        print("  office text: %s" % k)
    if unknown:
        print("NOTE the saved wording has keys the site doesn't use: " + ", ".join(sorted(unknown)))


if __name__ == "__main__":
    main()
