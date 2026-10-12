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
     address. Those come from the feed. Use the feed's phone, e-mail and address for all contact details
     (`assets/js/config.js` `FALLBACK_CONTACT` is only a backup for when the feed can't load).

2. **The feed** (`<Apps Script URL>?feed=rooms`) returns `"wording": { key: text }` with only the texts the office
   changed. Each key shows its built-in default, replaced by the feed's text when present (a key missing from the
   feed shows the `wording.json` default). Insert it as plain text (`textContent` / attributes), **never as HTML**.
   If the feed fails, the built-in text stays.

3. **Google and link previews** read the page before the feed loads, so `.github/workflows/publish.yml` builds the
   site with the office's current wording written into the pages' built-in text, title and description, and
   publishes it: on every push to `main`, once a day, and by hand. The build (`tools/build_site.py`) writes into a
   `_site` copy only; the repo keeps the original text, so `wording.json` defaults stay the original text.

4. **Before finishing any change**, run `python3 tools/check_wording.py`. It must pass: `wording.json` is valid,
   every key used on the pages and in the scripts is in it, no unused keys, and built-in text matches the defaults.

### How text is wired up (do it this way when adding or changing text)

- HTML text: an element containing only plain text with `data-w="key"` (no tags inside; wrap in a `<span>` if
  needed). Placeholders: `data-w-placeholder="key"` plus `placeholder="…"`. `<meta>`: `data-w-content="key"`.
- Text shown by scripts: call `W.t("key")` (or `W.t("key", { name: value })` for `{name}` placeholders) with a
  **literal** key string, and add the key with its default to the `cq-wording` JSON block in `index.html`.
- Never hard-code visible text in `app.js` or the HTML without a key. Screen-reader-only text (aria-labels, alt
  text) and the availability fallback in `app.js` (availability comes from the feed) are the only exceptions.
- Add the item to `wording.json` in the right section and position, with a plain-words label; mention any
  `{placeholder}` in the label.
- `assets/js/wording.js` applies wording in the browser; `tools/wording_lib.py` does the same for the build and
  checker. Keep them consistent.

## Other standing rules

- **Never show tenant information.** Only room details and business contact details from the feed are displayed.
- Rooms: only rooms switched on in the back office are in the feed, already in order. Fetch the feed on every
  visit (`cache: "no-store"`; also re-fetch on Back and when returning to a tab after 5+ minutes).
- Availability: show `availableText` exactly as sent ("Available May 2027", "Available now"). `availableFrom` is
  always the 1st of a month. **Never show a day of the month anywhere on the site.**
- Forms POST JSON to `APP_URL` with `Content-Type: text/plain` (no CORS preflight):
  `{ action: "inquiry", name, email, phone, room, moveIn, message, website }` and `{ action: "mylink", email }`.
  `website` is a hidden honeypot that must stay empty. When `ok` is false, show the `error` text. After `mylink`,
  always show the same confirmation.
- Mobile first, fast (no frameworks or libraries), good link previews.
- Photos: `python3 tools/prepare_photos.py <folder>` (one sub-folder per room, named as in the feed).
- When changing CSS or JS, bump the `?v=` number on the asset links in `index.html` (and `404.html`).

## Publishing

- GitHub Pages source is **GitHub Actions** (`.github/workflows/publish.yml`); the custom domain
  `collegequarters.net` and Enforce HTTPS are set in Settings → Pages. Keep the `CNAME` file.
- Work happens on a feature branch; it goes live once merged into `main`.
- Test locally: `python3 tools/build_site.py --out _site` (add `--feed-file saved.json` when offline), then serve
  `_site` and open it in a browser.
