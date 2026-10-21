"""Shared helpers for wording.json and the pages' built-in text (used by check_wording.py and build_site.py)."""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDING = ROOT / "wording.json"
PAGES = ["index.html", "404.html", "tenant.html"]
# Built into one page per room by build_site.py (not published as-is). Checked like a page.
ROOM_TEMPLATE = "templates/room.html"
CHECKED_PAGES = PAGES + [ROOM_TEMPLATE]
JS_DIR = ROOT / "assets" / "js"
BUILD_SCRIPT = ROOT / "tools" / "build_site.py"
KEY_RE = re.compile(r"^[A-Za-z0-9._-]+$")

# <tag ... data-w="key" ...>plain text</tag>   (plain text only: no tags inside)
ELEMENT_RE = re.compile(
    r'<(?P<tag>[a-zA-Z][\w-]*)(?P<attrs>[^>]*?\sdata-w="(?P<key>[^"]*)"[^>]*)>(?P<body>[^<]*)</(?P=tag)\s*>'
)
PLACEHOLDER_TAG_RE = re.compile(r'<[^>]*\sdata-w-placeholder="(?P<key>[^"]*)"[^>]*>')
CONTENT_TAG_RE = re.compile(r'<meta\b[^>]*\sdata-w-content="(?P<key>[^"]*)"[^>]*>')
PLACEHOLDER_ATTR_RE = re.compile(r'(?<![\w-])placeholder="[^"]*"')
CONTENT_ATTR_RE = re.compile(r'(?<![\w-])content="[^"]*"')
BLOCK_RE = re.compile(r'(<script type="application/json" id="cq-wording">)(?P<json>.*?)(</script>)', re.S)
JS_KEY_RE = re.compile(r'\bW\.t\(\s*"([^"]+)"')
BUILD_KEY_RE = re.compile(r'\bwt\(\s*"([^"]+)"')
ONE_LINE_KEYS_TAGS = {"title"}


def one_line(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def load_wording():
    """Returns (data, items) where items is a list of item dicts in order. Raises ValueError on bad JSON."""
    data = json.loads(WORDING.read_text(encoding="utf-8"))
    items = []
    for section in data.get("sections", []) if isinstance(data, dict) else []:
        for item in section.get("items", []) if isinstance(section, dict) else []:
            items.append(item)
    return data, items


def defaults_map():
    _, items = load_wording()
    return {i["key"]: i["default"] for i in items}


def page_texts(page_html):
    """All built-in texts on a page: list of (key, kind, text). kind: element/title/placeholder/content/block."""
    found = []
    for m in ELEMENT_RE.finditer(page_html):
        kind = "title" if m.group("tag").lower() in ONE_LINE_KEYS_TAGS else "element"
        found.append((m.group("key"), kind, html.unescape(m.group("body"))))
    for m in PLACEHOLDER_TAG_RE.finditer(page_html):
        a = PLACEHOLDER_ATTR_RE.search(m.group(0))
        found.append((m.group("key"), "placeholder", html.unescape(a.group(0)[len('placeholder="'):-1]) if a else None))
    for m in CONTENT_TAG_RE.finditer(page_html):
        a = CONTENT_ATTR_RE.search(m.group(0))
        found.append((m.group("key"), "content", html.unescape(a.group(0)[len('content="'):-1]) if a else None))
    b = BLOCK_RE.search(page_html)
    if b:
        for k, v in json.loads(b.group("json")).items():
            found.append((k, "block", v))
    return found


def js_keys():
    keys = {}
    for f in sorted(JS_DIR.glob("*.js")):
        for m in JS_KEY_RE.finditer(f.read_text(encoding="utf-8")):
            keys.setdefault(m.group(1), f.relative_to(ROOT).as_posix())
    return keys


def build_keys():
    """Keys build_site.py writes into the pages itself (room cards, room pages, contact list): wt("key")."""
    return sorted(set(BUILD_KEY_RE.findall(BUILD_SCRIPT.read_text(encoding="utf-8"))))


def fill(text, values):
    """Fill {name} placeholders; unknown names are left as they are."""
    return re.sub(r"\{(\w+)\}", lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), text)


def _script_json(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2).replace("<", "\\u003c")


def bake(page_html, texts):
    """Write texts (key -> text) into a page's built-in text. Text is escaped, never inserted as HTML."""

    def element(m):
        key = m.group("key")
        if key not in texts:
            return m.group(0)
        text = one_line(texts[key]) if m.group("tag").lower() in ONE_LINE_KEYS_TAGS else texts[key]
        return "<%s%s>%s</%s>" % (m.group("tag"), m.group("attrs"), html.escape(text, quote=False), m.group("tag"))

    def attr(attr_re, name, single_line):
        def fix(m):
            key = m.group("key")
            if key not in texts:
                return m.group(0)
            text = one_line(texts[key]) if single_line else texts[key]
            return attr_re.sub(lambda _: '%s="%s"' % (name, html.escape(text, quote=True)), m.group(0), count=1)
        return fix

    page_html = ELEMENT_RE.sub(element, page_html)
    page_html = PLACEHOLDER_TAG_RE.sub(attr(PLACEHOLDER_ATTR_RE, "placeholder", False), page_html)
    page_html = CONTENT_TAG_RE.sub(attr(CONTENT_ATTR_RE, "content", True), page_html)

    def block(m):
        data = json.loads(m.group("json"))
        data = {k: texts.get(k, v) for k, v in data.items()}
        return m.group(1) + "\n" + _script_json(data) + "\n" + m.group(3)

    return BLOCK_RE.sub(block, page_html)
