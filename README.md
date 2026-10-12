# College Quarters

Public website for College Quarters, student rooms for rent in Athens, Ohio
(landlord: Chabad Servicing Ohio University). It's a plain static site hosted free on GitHub Pages.

## How it works

- **Rooms, prices and availability** come live from the back office on every visit:
  `GET <Apps Script web app URL>?feed=rooms` (see `assets/js/config.js`). Rooms you switch off in the back office disappear
  from the site right away, with no change needed here.
- **Forms** (ask about a room, general contact, current tenants "e-mail me my link") send a JSON body as
  `Content-Type: text/plain` to the back-office web app (`APP_URL`). If it answers `ok: false`, the visitor
  sees its `error` text.
- **Wording**: every visible text is in `wording.json` (key, plain-words label, original default). The back office
  overrides any of them through the feed's `"wording"` object; the site applies it on every visit, and a daily
  GitHub Actions run writes it into the published pages for Google and link previews. Rules: `CLAUDE.md`.
- **Photos** are stored in this repository (`photos/`), matched to rooms by the room name in the feed.
- The site only shows room details and your business contact details. It never displays tenant information.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page, including the link-preview (title, description, image) tags |
| `404.html` | "Page not found" page |
| `wording.json` | Every visible text: key, label, original default (see `CLAUDE.md`) |
| `assets/js/config.js` | **Settings**: feed URL, app URL, backup contact details |
| `assets/js/wording.js` | Applies the office's wording from the feed in the browser |
| `assets/js/app.js` | Loads rooms and handles the forms |
| `assets/js/photos.js` | List of room photos (generated, don't edit by hand) |
| `assets/css/site.css` | Styles |
| `assets/img/og-image.jpg` | Image shown when the link is shared |
| `tools/prepare_photos.py` | Resizes room photos, strips their location data, and updates `photos.js` |
| `tools/check_wording.py` | Checks `wording.json` against the pages (run before every commit) |
| `tools/build_site.py` | Builds the published copy with the office's wording written in |
| `.github/workflows/publish.yml` | Publishes the site: on every change to `main`, daily, and by hand |

## Adding or replacing room photos

Put the originals in a folder with one sub-folder per room, named exactly as the room appears in the
feed, then run:

```
python3 tools/prepare_photos.py /path/to/originals
```

Name the files `01.jpg`, `02.jpg`, … to set the order. The first one is the cover photo.

## Publishing and domain

- GitHub Pages publishes through GitHub Actions (`.github/workflows/publish.yml`): on every change to `main`,
  once a day (to pick up wording changed in the back office), and by hand from the **Actions** tab.
- The site is served at **https://collegequarters.net/**. The `CNAME` file holds that domain; keep it.
  The link-preview and canonical addresses in `index.html` use the same domain.
