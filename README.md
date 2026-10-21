# College Quarters

Public website for College Quarters, student rooms for rent in Athens, Ohio
(landlord: Chabad Servicing Ohio University). It's a plain static site hosted free on GitHub Pages.

## How it works

- **Rooms, prices, availability, contact details and wording** are saved by the Rentals app: pressing Save on its
  Website tab writes `data/site.json` into this repository (GitHub API), and GitHub Pages republishes in about a
  minute. The app also saves by itself every night, so availability that follows the leases stays current. The site
  never calls the Apps Script when a page loads. The Apps Script file is in `apps-script/`.
- **Forms** (ask about a room, general contact, current tenants "e-mail me my link") send a JSON body as
  `Content-Type: text/plain` to the back-office web app (`APP_URL`). If it answers `ok: false`, the visitor
  sees its `error` text.
- **Wording**: every visible text is in `wording.json` (key, plain-words label, original default). The office's
  changed texts are in `data/site.json` and are written into the published pages when the site is built. Rules: `CLAUDE.md`.
- **Search engines**: the build writes the rooms, prices, photos and wording straight into the HTML, makes one
  page per room (`/rooms/2/` etc.), adds schema.org structured data (business, address, each room's price and
  availability) and a `sitemap.xml`.
- **Photos** come from each room's saved `photos` list (first one is the main photo). When a room's
  list is empty, the photos stored in this repository (`photos/`) are used, matched by the room name.
- The site only shows room details and your business contact details. It never displays tenant information.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The home page, including the link-preview (title, description, image) tags |
| `templates/room.html` | Template for the room pages (one per room, made by the build) |
| `404.html` | "Page not found" page |
| `wording.json` | Every visible text: key, label, original default (see `CLAUDE.md`) |
| `data/site.json` | Website data saved by the Rentals app (don't edit by hand) |
| `apps-script/WebsitePublish.gs` | The Apps Script file that saves `data/site.json` (copy for the Rentals app) |
| `assets/js/config.js` | **Settings**: app URL for the forms, backup contact details |
| `assets/js/wording.js` | Gives the scripts their texts (messages, buttons) |
| `assets/js/app.js` | Photo galleries, photo viewer and the forms |
| `assets/js/photos.js` | List of room photos (generated, don't edit by hand) |
| `assets/css/site.css` | Styles |
| `assets/img/og-image.jpg` | Image shown when the link is shared |
| `tools/photo_alt.json` | Alt text (descriptions for screen readers and Google) of the repo photos |
| `tools/prepare_photos.py` | Resizes room photos, strips their location data, and updates `photos.js` |
| `tools/check_wording.py` | Checks `wording.json` against the pages (run before every commit) |
| `tools/build_site.py` | Builds the published copy from `data/site.json`: pages, room pages, structured data, sitemap |
| `.github/workflows/publish.yml` | Publishes the site: on every change to `main` (including each Save) and by hand |

## Adding or replacing room photos

Put the originals in a folder with one sub-folder per room, named exactly as the room appears in the
feed, then run:

```
python3 tools/prepare_photos.py /path/to/originals
```

Name the files `01.jpg`, `02.jpg`, … to set the order. The first one is the cover photo. Then update the room's
alt text in `tools/photo_alt.json` (one description per photo, in the same order).

## Publishing and domain

- GitHub Pages publishes through GitHub Actions (`.github/workflows/publish.yml`): on every change to `main`
  (each Save in the Rentals app is one) and by hand from the **Actions** tab.
- The site is served at **https://collegequarters.net/**. The `CNAME` file holds that domain; keep it.
  The link-preview and canonical addresses in `index.html` use the same domain.
