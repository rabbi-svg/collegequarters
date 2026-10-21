#!/usr/bin/env python3
"""
Build the site for publishing from the saved website data.

    python3 tools/build_site.py --out _site                       # uses data/site.json
    python3 tools/build_site.py --out _site --data-file other.json  # testing

data/site.json is written by the Rentals app (Website tab -> Save) through the GitHub API; that
commit makes GitHub Pages republish. The build writes everything into the HTML, so visitors and
Google get the finished page without running any script:
  - the saved wording into the pages' text, title and description;
  - the room cards, contact details and room choices into index.html;
  - one page per room (rooms/<room>/index.html, from templates/room.html);
  - structured data (schema.org) for the business and each room, sitemap.xml.
The site never calls the Apps Script when it loads. The repository's pages and wording.json keep the
original text (wording.json defaults).

Text written here comes from wording keys, always passed to wt() as a literal string (check_wording.py
looks for them). Room details and contact details come from the saved data. Everything is escaped.
"""
import argparse
import calendar
import datetime
import html
import json
import re
import shutil
import sys

from wording_lib import PAGES, ROOM_TEMPLATE, ROOT, bake, defaults_map, fill, one_line

# Files and folders that are part of the published site (plus any google*.html Search Console file).
SITE = ["index.html", "404.html", "tenant.html", "wording.json", "robots.txt", "CNAME", ".nojekyll", "assets", "photos"]
DATA_FILE = ROOT / "data" / "site.json"
PHOTOS_JS = ROOT / "assets" / "js" / "photos.js"
PHOTO_ALT = ROOT / "tools" / "photo_alt.json"
DATA_BLOCK_RE = re.compile(r'(<script type="application/json" id="cq-data">)(.*?)(</script>)', re.S)
WORDING_BLOCK_RE = re.compile(r'<script type="application/json" id="cq-wording">.*?</script>', re.S)
YEAR_RE = re.compile(r'(<span id="year">)\d*(</span>)')
ROOM_FIELDS = ("room", "price", "description", "availableNow", "availableFrom", "availableText")
CARD_SIZES = "(min-width: 1000px) 340px, (min-width: 700px) 50vw, 100vw"
PAGE_SIZES = "(min-width: 900px) 600px, 100vw"

TEXTS = {}  # key -> text (office text or default), set in main()


def wt(key, **values):
    """A wording text, with {name} placeholders filled. Plain text: escape it when writing HTML."""
    return fill(TEXTS[key], values)


def text(v):
    if v is None or isinstance(v, bool):
        return ""
    return str(v).strip()


def esc(v):
    return html.escape(str(v), quote=True)


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


# ---------------- Formatting (same rules as assets/js/app.js) ----------------

def slug(v):
    return re.sub(r"[^a-z0-9]+", "-", text(v).lower()).strip("-") or "room"


def room_label(name):
    return wt("rooms.numberedName", room=name) if re.match(r"^\d+[a-z]?$", name, re.I) else name


def number(price):
    if isinstance(price, (int, float)) and not isinstance(price, bool):
        return float(price)
    p = text(price)
    return float(p) if re.match(r"^\d+(\.\d+)?$", p) else None


def format_price(price):
    n = number(price)
    if n is None:
        return text(price)
    s = ("{:,.2f}".format(n)).rstrip("0").rstrip(".")
    suffix = wt("rooms.priceSuffix")
    return "$" + s + (" " + suffix if suffix else "")


def format_phone(v):
    s = text(v)
    d = re.sub(r"\D", "", s)
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    return "%s-%s-%s" % (d[:3], d[3:6], d[6:]) if len(d) == 10 else s


def schema_phone(v):
    d = re.sub(r"\D", "", text(v))
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    return "+1-%s-%s-%s" % (d[:3], d[3:6], d[6:]) if len(d) == 10 else text(v)


def month_year(v):
    m = re.match(r"^(\d{4})-(\d{1,2})", text(v))
    if not m or not 1 <= int(m.group(2)) <= 12:
        return ""
    return "%s %s" % (calendar.month_name[int(m.group(2))], m.group(1))


def availability(r):
    """availableText exactly as the back office sends it. The fallback is the only text not in wording."""
    now = r["availableNow"]
    t = r["availableText"]
    if not t:
        month = month_year(r["availableFrom"])
        t = "Available now" if now else ("Available " + month if month else "Ask about availability")
    return {"now": now or t.lower() == "available now", "text": t}


def contact_sentence(c):
    phone, email = format_phone(c["phone"]), c["email"]
    if not phone or not email:
        return ""
    s = wt("common.reachUs", phone=phone, email=email)
    return " " + s if s else ""


def short(s, limit):
    s = one_line(s)
    if len(s) <= limit:
        return s
    return s[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


# ---------------- Photos ----------------

def direct_image_url(v):
    """Only http(s) links. Google Drive share links become direct image links (as in app.js)."""
    u = text(v)
    if not re.match(r"^https?://", u, re.I):
        return ""
    m = re.match(r"^https://drive\.google\.com/(?:file/d/([\w-]+)|(?:open|uc)\?(?:[^#]*&)?id=([\w-]+))", u)
    return "https://lh3.googleusercontent.com/d/%s=w2000" % (m.group(1) or m.group(2)) if m else u


def load_repo_photos():
    src = PHOTOS_JS.read_text(encoding="utf-8")
    body = src[src.index("{", src.index("CQ_PHOTOS")):src.rindex("}") + 1]
    photos = json.loads(body)
    try:
        alts = json.loads(PHOTO_ALT.read_text(encoding="utf-8"))
    except FileNotFoundError:
        alts = {}
    for key, items in photos.items():
        captions = alts.get(key) if isinstance(alts.get(key), list) else []
        for i, p in enumerate(items):
            p["caption"] = text(captions[i]) if i < len(captions) else ""
    return photos


def room_photos(r, repo):
    """The room's saved photos (first = main photo), or the repo photos when it has none."""
    out = []
    for p in r["photos"]:
        url = direct_image_url(p)
        if url and url not in [o["src"] for o in out]:
            out.append({"src": url, "full": url, "remote": True})
    if out:
        return out
    m = re.match(r"^room\s*(.+)$", r["room"], re.I)
    items = repo.get(slug(r["room"])) or (m and repo.get(slug(m.group(1)))) or []
    site_path = lambda p: p if re.match(r"^(https?:)?/", p) else "/" + p
    return [dict(p, src=site_path(p["src"]), full=site_path(p.get("full") or p["src"]),
                 srcset=", ".join(site_path(s.strip()) for s in p["srcset"].split(",")) if p.get("srcset") else None)
            for p in items]


def photo_alt(label, p, i, n):
    # Screen-reader / search text (not wording). Describes the room's fixtures only.
    if p.get("caption"):
        return "%s: %s" % (label, p["caption"])
    return "%s, photo %d of %d" % (label, i + 1, n)


def gallery_html(r, photos, label, sizes, eager):
    if not photos:
        return '<div class="gallery gallery-empty" data-room="%s" data-label="%s"><span>%s</span></div>' % (
            esc(r["room"]), esc(label), esc(wt("rooms.noPhotos")))
    slides = []
    for i, p in enumerate(photos):
        first = eager and i == 0
        attrs = [
            'src="%s"' % esc(p["src"]),
            'srcset="%s" sizes="%s"' % (esc(p["srcset"]), sizes) if p.get("srcset") else "",
            'width="%d" height="%d"' % (p["w"], p["h"]) if p.get("w") and p.get("h") else "",
            'alt="%s"' % esc(photo_alt(label, p, i, len(photos))),
            'loading="eager" fetchpriority="high"' if first else 'loading="lazy"',
            'decoding="async"',
            'data-full="%s"' % esc(p["full"]),
            'referrerpolicy="no-referrer" data-remote' if p.get("remote") else "",
        ]
        slides.append('<button class="slide" type="button" aria-label="View larger: %s, photo %d"><img %s></button>' % (
            esc(label), i + 1, " ".join(a for a in attrs if a)))
    nav = ""
    if len(photos) > 1:
        nav = ('<button class="gallery-nav prev" type="button" aria-label="Previous photo">&lsaquo;</button>'
               '<button class="gallery-nav next" type="button" aria-label="Next photo">&rsaquo;</button>'
               '<span class="gallery-count">1 / %d</span>' % len(photos))
    return ('<div class="gallery" data-room="%s" data-label="%s"><div class="gallery-track" tabindex="0" aria-label="%s photos">%s</div>%s</div>'
            % (esc(r["room"]), esc(label), esc(label), "".join(slides), nav))


# ---------------- Rooms ----------------

def badge_html(avail):
    return '<span class="badge %s">%s</span>' % ("badge-now" if avail["now"] else "badge-later", esc(avail["text"]))


def room_card(room, repo, eager):
    r, label, url = room["data"], room["label"], room["path"]
    price = format_price(r.get("price"))
    parts = [
        '<article class="card room" id="%s" aria-label="%s">' % (esc(room["anchor"]), esc(label)),
        gallery_html(r, room_photos(r, repo), label, CARD_SIZES, eager),
        '<div class="room-body"><div class="room-top"><h3><a href="%s">%s</a></h3>%s</div>' % (
            esc(url), esc(label), '<p class="price">%s</p>' % esc(price) if price else ""),
        badge_html(availability(r)),
        '<p class="desc">%s</p>' % html.escape(r["description"], quote=False) if r["description"] else "",
        '<a class="details-link" href="%s">%s</a>' % (esc(url), esc(wt("rooms.detailsLink"))),
        '<button class="btn btn-primary btn-block" type="button" data-ask="%s">%s</button>' % (esc(r["room"]), esc(wt("rooms.askButton"))),
        "</div></article>",
    ]
    return "".join(parts)


def rooms_html(rooms, repo, contact):
    if not rooms:
        return '<div class="notice"><p>%s</p><a class="btn btn-primary" href="#contact">%s</a></div>' % (
            esc(wt("rooms.none") + contact_sentence(contact)), esc(wt("rooms.noneButton")))
    return "\n".join(room_card(room, repo, i == 0) for i, room in enumerate(rooms))


def room_options(rooms):
    return "".join('<option value="%s">%s</option>' % (esc(r["data"]["room"]), esc(r["label"])) for r in rooms)


def contact_html(c):
    items = []
    phone, email, address = format_phone(c["phone"]), c["email"], c["address"]
    if phone:
        items.append(('contact.phoneLabel', "tel:" + re.sub(r"[^\d+]", "", phone), phone, ""))
    if email:
        items.append(('contact.emailLabel', "mailto:" + email, email, ""))
    if address:
        from urllib.parse import quote
        items.append(('contact.addressLabel', "https://www.google.com/maps/search/?api=1&query=" + quote(address),
                      address, ' target="_blank" rel="noopener"'))
    labels = {"contact.phoneLabel": wt("contact.phoneLabel"), "contact.emailLabel": wt("contact.emailLabel"),
              "contact.addressLabel": wt("contact.addressLabel")}
    return "".join('<li><span class="label">%s</span> <a href="%s"%s>%s</a></li>' % (esc(labels[k]), esc(href), extra, esc(t))
                   for k, href, t, extra in items)


def other_rooms_html(rooms, current):
    items = []
    for room in rooms:
        if room is current:
            continue
        r = room["data"]
        price = format_price(r.get("price"))
        items.append('<li><a href="%s">%s</a>%s <span class="muted">%s</span></li>' % (
            esc(room["path"]), esc(room["label"]), " · " + esc(price) if price else "", esc(availability(r)["text"])))
    return "".join(items)


# ---------------- Structured data (schema.org) ----------------

STREET_END = r"(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Pike|Hwy|Highway|Ter|Terrace|Cir|Circle|Pkwy|Parkway)\.?"


def postal_address(s):
    """'12 N College St Athens OH 45701' (commas optional) -> PostalAddress. Never fails the build."""
    addr = {"@type": "PostalAddress", "addressCountry": "US"}
    s = re.sub(r"\s+", " ", text(s)).strip(" ,")
    m = re.match(r"^(?P<rest>.+?)[,\s]+(?P<state>[A-Za-z]{2}|Ohio)\.?[,\s]+(?P<zip>\d{5}(?:-\d{4})?)(?:[,\s]+(?:USA|US|United States))?$", s)
    if not m:
        if s:
            addr["streetAddress"] = s
        return addr
    rest = m.group("rest").strip(" ,")
    addr["addressRegion"] = "OH" if m.group("state").lower() == "ohio" else m.group("state").upper()
    addr["postalCode"] = m.group("zip")
    if "," in rest:
        street, city = rest.rsplit(",", 1)
    else:
        sm = re.match(r"^(.*\b%s)\s+(.+)$" % STREET_END, rest, re.I)
        street, city = (sm.group(1), sm.group(2)) if sm else (rest, "")
    addr["streetAddress"] = street.strip(" ,")
    if city.strip(" ,"):
        addr["addressLocality"] = city.strip(" ,")
    return addr


def business_ld(base, c, full):
    node = {
        "@type": "LodgingBusiness",
        "@id": base + "/#business",
        "name": one_line(TEXTS["site.name"]),
        "url": base + "/",
        "address": postal_address(c["address"]),
    }
    if c["phone"]:
        node["telephone"] = schema_phone(c["phone"])
    if full:
        node["description"] = one_line(TEXTS["meta.description"])
        node["image"] = base + "/assets/img/og-image.jpg"
        if c["email"]:
            node["email"] = c["email"]
        if c["landlord"]:
            node["parentOrganization"] = {"@type": "Organization", "name": c["landlord"]}
    return node


def offer_ld(base, room, repo):
    r, url = room["data"], base + room["path"]
    avail = availability(r)
    offer = {
        "@type": "Offer",
        "@id": url + "#offer",
        "url": url,
        "name": room["label"],
        "itemOffered": {
            "@type": "Room",
            "@id": url + "#room",
            "name": room["label"],
            "url": url,
            "containedInPlace": {"@id": base + "/#business"},
        },
        "offeredBy": {"@id": base + "/#business"},
        # Rented now = InStock; a later start month = PreOrder with the start date (machine data, never shown).
        "availability": "https://schema.org/InStock" if avail["now"] else "https://schema.org/PreOrder",
    }
    if r["description"]:
        offer["itemOffered"]["description"] = one_line(r["description"])
    photos = [p["full"] for p in room_photos(r, repo)]
    if photos:
        offer["itemOffered"]["image"] = [p if p.startswith("http") else base + p for p in photos]
    if not avail["now"] and re.match(r"^\d{4}-\d{2}-\d{2}$", r["availableFrom"]):
        offer["availabilityStarts"] = r["availableFrom"]
    n = number(r.get("price"))
    if n is not None:
        price = ("%.2f" % n).rstrip("0").rstrip(".")
        offer["price"] = price
        offer["priceCurrency"] = "USD"
        offer["priceSpecification"] = {"@type": "UnitPriceSpecification", "price": price, "priceCurrency": "USD",
                                       "unitCode": "MON", "unitText": "month"}
    return offer


def ld_script(obj):
    return ('<script type="application/ld+json">\n%s\n</script>'
            % json.dumps(obj, ensure_ascii=False, indent=1).replace("<", "\\u003c"))


# ---------------- Pages ----------------

def put(page_html, marker, content, name):
    if page_html.count(marker) != 1:
        sys.exit("%s needs exactly one %s" % (name, marker))
    return page_html.replace(marker, content)


def contact_block(c):
    data = {"phone": format_phone(c["phone"]), "email": c["email"]}
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def finish(page_html, c, name):
    page_html, n = DATA_BLOCK_RE.subn(lambda m: m.group(1) + contact_block(c) + m.group(3), page_html)
    if n != 1:
        sys.exit("%s needs exactly one cq-data block" % name)
    return YEAR_RE.sub(lambda m: m.group(1) + str(datetime.date.today().year) + m.group(2), page_html)


def build_index(page_html, rooms, repo, c, base):
    offers = [offer_ld(base, room, repo) for room in rooms]
    biz = business_ld(base, c, True)
    if offers:
        biz["makesOffer"] = offers
    ld = {"@context": "https://schema.org", "@graph": [
        biz, {"@type": "WebSite", "@id": base + "/#website", "name": one_line(TEXTS["site.name"]), "url": base + "/"}]}
    page_html = put(page_html, "<!--cq:ldjson-->", ld_script(ld), "index.html")
    page_html = put(page_html, "<!--cq:rooms-->", rooms_html(rooms, repo, c), "index.html")
    page_html = put(page_html, "<!--cq:room-options-->", room_options(rooms), "index.html")
    page_html = put(page_html, "<!--cq:contact-->", contact_html(c), "index.html")
    return finish(page_html, c, "index.html")


def build_room_page(template, room, rooms, repo, c, base, wording_block):
    r, label = room["data"], room["label"]
    url = base + room["path"]
    price = format_price(r.get("price"))
    avail = availability(r)
    values = {"room": label, "price": price, "availability": avail["text"],
              "description": short(r["description"], 160)}
    texts = dict(TEXTS)
    for k in ("room.pageTitle", "room.pageDescription", "room.formTitle"):
        texts[k] = fill(TEXTS[k], values)
    page_html = bake(re.sub(r"\n  <!-- Template for the room pages.*?-->", "", template, count=1, flags=re.S), texts)

    photos = room_photos(r, repo)
    image = photos[0]["full"] if photos else "/assets/img/og-image.jpg"
    offer = offer_ld(base, room, repo)
    ld = {"@context": "https://schema.org", "@graph": [
        offer, business_ld(base, c, False),
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": one_line(TEXTS["site.name"]), "item": base + "/"},
            {"@type": "ListItem", "position": 2, "name": label, "item": url}]}]}

    name = "room page " + room["path"]
    page_html = put(page_html, "<!--cq:ldjson-->", ld_script(ld), name)
    page_html = WORDING_BLOCK_RE.sub(lambda _: wording_block, page_html, count=1)
    for token, value in (("{{url}}", url), ("{{image}}", image if image.startswith("http") else base + image),
                         ("{{room}}", r["room"]), ("{{message}}", wt("dialog.message", room=label))):
        page_html = page_html.replace(token, esc(value))
    page_html = put(page_html, "<!--cq:label-->", esc(label), name)
    page_html = put(page_html, "<!--cq:price-->", '<p class="price">%s</p>' % esc(price) if price else "", name)
    page_html = put(page_html, "<!--cq:badge-->", badge_html(avail), name)
    page_html = put(page_html, "<!--cq:gallery-->", gallery_html(r, photos, label, PAGE_SIZES, True), name)
    page_html = put(page_html, "<!--cq:description-->",
                    '<p class="desc">%s</p>' % html.escape(r["description"], quote=False) if r["description"] else "", name)
    page_html = put(page_html, "<!--cq:contact-->", contact_html(c), name)
    others = other_rooms_html(rooms, room)
    page_html = put(page_html, "<!--cq:other-rooms-->", others, name)
    if not others:
        page_html = re.sub(r'<section class="section" id="other-rooms".*?</section>', "", page_html, flags=re.S)
    return finish(page_html, c, name)


def sitemap(base, rooms):
    urls = [base + "/"] + [base + room["path"] for room in rooms]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n'
            % "".join("  <url><loc>%s</loc></url>\n" % html.escape(u) for u in urls))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--data-file", help="read the website data from this file instead of data/site.json")
    args = ap.parse_args()

    defaults = defaults_map()
    data = load_data((ROOT / args.data_file).resolve() if args.data_file else DATA_FILE)
    office, unknown = office_wording(data, defaults)
    TEXTS.update(defaults, **office)
    site = public_data(data)
    repo = load_repo_photos()
    base = "https://" + (ROOT / "CNAME").read_text(encoding="utf-8").strip().rstrip("/")

    rooms, used = [], set()
    for r in site["rooms"]:
        s = slug(r["room"])
        while s in used:
            s += "-%d" % (len(rooms) + 1)
        used.add(s)
        rooms.append({"data": r, "label": room_label(r["room"]), "slug": s, "anchor": "room-" + s, "path": "/rooms/%s/" % s})

    out = (ROOT / args.out).resolve()
    if out == ROOT or ROOT not in out.parents:
        sys.exit("--out must be a folder inside the repository, e.g. _site")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in SITE + sorted(p.name for p in ROOT.glob("google*.html")):
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, out / name, ignore=shutil.ignore_patterns("*.md", ".DS_Store"))
        elif src.exists():
            shutil.copy2(src, out / name)

    for page in PAGES:
        path = out / page
        page_html = bake(path.read_text(encoding="utf-8"), TEXTS)
        if page == "index.html":
            page_html = build_index(page_html, rooms, repo, site, base)
        path.write_text(page_html, encoding="utf-8")

    index_html = (out / "index.html").read_text(encoding="utf-8")
    wording_block = WORDING_BLOCK_RE.search(index_html).group(0)
    template = (ROOT / ROOM_TEMPLATE).read_text(encoding="utf-8")
    for room in rooms:
        path = out / room["path"].strip("/") / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(build_room_page(template, room, rooms, repo, site, base, wording_block), encoding="utf-8")

    (out / "sitemap.xml").write_text(sitemap(base, rooms), encoding="utf-8")

    print("Built %s: %d rooms (each with its own page), %d texts from the office, %d defaults." % (
        out.relative_to(ROOT), len(rooms), len(office), len(TEXTS) - len(office)))
    for k in sorted(office):
        print("  office text: %s" % k)
    if unknown:
        print("NOTE the saved wording has keys the site doesn't use: " + ", ".join(sorted(unknown)))


if __name__ == "__main__":
    main()
