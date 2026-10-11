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
- **Photos** are stored in this repository (`photos/`), matched to rooms by the room name in the feed.
- The site only shows room details and your business contact details. It never displays tenant information.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page, including the link-preview (title, description, image) tags |
| `assets/js/config.js` | **Settings**: feed URL, app URL, price suffix, fallback contact details |
| `assets/js/app.js` | Loads rooms and handles the forms |
| `assets/js/photos.js` | List of room photos (generated, don't edit by hand) |
| `assets/css/site.css` | Styles |
| `assets/img/og-image.jpg` | Image shown when the link is shared |
| `tools/prepare_photos.py` | Resizes room photos, strips their location data, and updates `photos.js` |

## Adding or replacing room photos

Put the originals in a folder with one sub-folder per room, named exactly as the room appears in the
feed, then run:

```
python3 tools/prepare_photos.py /path/to/originals
```

Name the files `01.jpg`, `02.jpg`, … to set the order. The first one is the cover photo.

## Connecting your own domain

1. Add a file named `CNAME` containing just the domain (for example `www.collegequarters.com`).
2. Replace `https://rabbi-svg.github.io/collegequarters/` with the new address in `index.html`
   (canonical, `og:url`, `og:image`, `twitter:image` and the JSON-LD block).
3. At your domain registrar, add the DNS records GitHub lists under **Settings → Pages → Custom domain**.
