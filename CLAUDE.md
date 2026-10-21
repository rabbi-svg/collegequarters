# College Quarters website — rules for every session

Public site for College Quarters, student rooms in Athens, Ohio (landlord: Chabad Servicing Ohio University),
served at https://collegequarters.net/ from GitHub Pages. Audience: Ohio University students and their parents.
The owner is not technical: do all the work, and give exact click-by-click steps for anything they must do.

## Wording: the Rentals back office controls every word on the site

1. **Every piece of visible text lives in `wording.json`** at the site root (published at
   https://collegequarters.net/wording.json). Format:
   ```json
   { "sections": [ { "title": "Top of the page", "items": [
       { "key": "hero.title", "label": "Big headline at the top", "default": "the current text", "long": false } ] } ] }
   ```
   - One item per piece of text: headings, paragraphs, button labels, form labels and placeholders,
     messages the site shows after a form is sent, footer, plus the page title (`meta.title`) and the
     description used in Google and link previews (`meta.description`).
   - Sections in the order they appear on the page. Labels in plain words a non-technical person understands.
   - `"long": true` for paragraphs, `false` for short text. Line breaks in text must show as line breaks.
   - Keys only use letters, numbers, dots, dashes and underscores, and **never change once created**, even if
     the text moves or is reworded. Only add new keys or remove ones that no longer exist.
   - `default` is the original text and is the only place text is written in the repo besides the pages'
     built-in copies (which must match it).
   - **Not in wording.json**: room names, prices, descriptions and availability, and the phone, e-mail and
     address. Those come from the saved website data (`data/site.json`). Use its phone, e-mail and address for all
     contact details (`assets/js/config.js` `FALLBACK_CONTACT` is only a backup if the data has none).

2. **Website data is saved, not fetched.** When the owner presses Save on the Website or Setup tab of the Rentals app
   (and once a night, from the `dailyWebsiteSave` trigger that `setupWebsite()` installs), the
   Apps Script (`apps-script/WebsitePublish.gs`, `publishWebsite()`) writes `data/site.json` to `main` through the
   GitHub API: `{ landlord, phone, email, address, rooms: [...], wording: { key: text } }` (wording = only the
   texts the office changed). That commit runs `.github/workflows/publish.yml`. **The website never calls the
   Apps Script when a page loads**: no live feed, no swapping text after load. Don't edit `data/site.json` by hand.

3. **The build writes everything into the pages** (so Google reads it without running any script).
   `tools/build_site.py` reads `data/site.json` and writes each key's text (office text if present, otherwise the
   `wording.json` default; keys matched ignoring spaces and capitals, blank texts ignored) into the pages' text,
   title and description. It also writes, straight into the HTML: the room cards (photos, price, availability,
   description), the contact list and the room choices into index.html (at the `<!--cq:...-->` markers); one page
   per room at `/rooms/<room>/` from `templates/room.html`; schema.org structured data (the business with its
   address, and each room's price and availability); `sitemap.xml`; and the phone and e-mail into the `cq-data`
   block for the scripts' messages. Text is always escaped, **never inserted as HTML**. It writes into a `_site`
   copy only; the repo keeps the original text, so `wording.json` defaults stay the original text. If
   `data/site.json` is missing or invalid the build fails, so the previous site stays live.
   `assets/js/app.js` only adds behaviour (galleries, photo viewer, forms) to that HTML; it never builds room cards.

4. **Before finishing any change**, run `python3 tools/check_wording.py`. It must pass: `wording.json` is valid,
   every key used on the pages and in the scripts is in it, no unused keys, and built-in text matches the defaults.

### How text is wired up (do it this way when adding or changing text)

- HTML text: an element containing only plain text with `data-w="key"` (no tags inside; wrap in a `<span>` if
  needed). Placeholders: `data-w-placeholder="key"` plus `placeholder="…"`. `<meta>`: `data-w-content="key"`.
- Text shown by scripts: call `W.t("key")` (or `W.t("key", { name: value })` for `{name}` placeholders) with a
  **literal** key string, and add the key with its default to the `cq-wording` JSON block in `index.html`
  (the room pages get a copy of that block when the site is built).
- Text the build writes itself (room cards, room pages, contact list): `wt("key")` or `wt("key", name=value)` in
  `tools/build_site.py`, with a **literal** key string; the default comes from `wording.json`.
- Room pages: `templates/room.html` is checked like a page (`data-w` keys); `{room}`, `{price}`, `{availability}`
  and `{description}` in the `room.*` texts are filled in per room. Room details go in at its `cq:` markers and
  `{{...}}` spots. It is not published as-is.
- Never hard-code visible text in `app.js`, `build_site.py` or the HTML without a key. Screen-reader-only text
  (aria-labels, alt text) and the availability fallback in `app.js` / `build_site.py` (availability comes from the
  feed) are the only exceptions.
- Add the item to `wording.json` in the right section and position, with a plain-words label; mention any
  `{placeholder}` in the label.
- `assets/js/wording.js` applies wording in the browser; `tools/wording_lib.py` does the same for the build and
  checker. Keep them consistent. `build_site.py` repeats `app.js`'s formatting rules (room name, price, phone,
  availability, photo links): keep those consistent too.

## Other standing rules

- **Never show tenant information.** Only room details and business contact details are published: both
  `WebsitePublish.gs` and `build_site.py` keep only the whitelisted fields.
- Rooms: only rooms switched on in the back office are in the saved data, already in order. They change on the
  website only on a Save or the nightly save (the Apps Script builds them with its own `siteFeed_()` rules; the old
  public `?feed=rooms` address no longer exists). Only `WebsitePublish.gs` is kept in `apps-script/`: the app's
  other files contain its passcode and must never be committed to this public repo.
- The Apps Script side lives in the owner's Rentals spreadsheet (Extensions > Apps Script); `apps-script/` holds the
  copies the owner pastes in. The GitHub key is the Script Property `GITHUB_TOKEN` (fine-grained, this repo only,
  Contents read and write) and must never be written into any file.
- Availability: show `availableText` exactly as sent ("Available May 2027", "Available now"). `availableFrom` is
  always the 1st of a month. **Never show a day of the month anywhere on the site.**
- Forms POST JSON to `APP_URL` with `Content-Type: text/plain` (no CORS preflight):
  `{ action: "inquiry", name, email, phone, room, moveIn, message, website }` and `{ action: "mylink", email }`.
  `website` is a hidden honeypot that must stay empty. When `ok` is false, show the `error` text. After `mylink`,
  always show the same confirmation.
- Mobile first, fast (no frameworks or libraries), good link previews.
- Room photos: a room's saved `photos` array (image URLs, first = main photo) is shown when present. If it is
  missing or empty, or every one fails to load, the repo photos (`assets/js/photos.js`) are used. Only
  http(s) URLs are used; Google Drive share links are converted to direct image links. Those photos are not
  processed by this repo, so the back office is responsible for their privacy (blurring, metadata).
- Photos: `python3 tools/prepare_photos.py <folder>` (one sub-folder per room, named as in the feed). It makes
  web-sized copies with all metadata removed. Then update `tools/photo_alt.json` (alt text for each repo photo, in
  order): describe only the room and its fixtures, never tenants' belongings. Look at every photo first: rooms are often occupied, so blur
  tenants' personal details (photos of people, screens, papers and notes, reflections) before processing, and
  never commit the original uploads (this repo is public; remove uploaded originals from history too).
  Use full-size originals: files under 1600px on the long side (e.g. Apple `…_4_5005_c.jpeg` previews) make
  a soft enlarged view; the tool warns about them, so ask the owner for the originals.
- When changing CSS or JS, bump the `?v=` number on the asset links in `index.html` (and `404.html`).

## Search (SEO)

- Home page title/description: `meta.title` / `meta.description`; room pages: `room.pageTitle` /
  `room.pageDescription`. Canonical URLs, the sitemap and structured data use the domain in `CNAME`.
- `robots.txt` points to the sitemap. Don't block `/tenant` there (it has `noindex`, which Google must be able to see).
- A Google Search Console verification file (`google….html`) at the repo root is published automatically.

## Publishing

- GitHub Pages source is **GitHub Actions** (`.github/workflows/publish.yml`); the custom domain
  `collegequarters.net` and Enforce HTTPS are set in Settings → Pages. Keep the `CNAME` file.
- Work happens on a feature branch; it goes live once merged into `main`.
- Test locally: `python3 tools/build_site.py --out _site` (or `--data-file other.json`), then serve
  `_site` and open it in a browser.
