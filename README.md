# Homey Firmware & Version Tracker

An unofficial, self-updating changelog archive for Homey's various software
lines, published as a static searchable website via GitHub Pages.

Tabs / data sources:

| Tab | Source | Has an official date? |
|---|---|---|
| Homey Pro & Homey Pro mini | `https://ota-api.homeypro.net/api/v1/changelog/?channel=beta` | No – "date first available" is the date this tracker first saw the version |
| Homey Pro (2016 – 2019) | `https://firmware.athom.com/api/update/changelog/?channel=beta` | Yes, from the API |
| Homey Cloud | `https://ota-api.homeycloud.net/api/v1/changelog?channel=stable` | Yes (`createdAt`) |
| Homey Mobile App | scraped from `homey.app/en-us/wiki/homey-mobile-app-changelog` | No – discovered date |
| Homey Web App | scraped from `homey.app/en-us/wiki/homey-web-app-changelog` | No – discovered date |

Homey Bridge is intentionally left out — Athom doesn't publish a changelog for it.

## How it works

1. `scripts/update-all.mjs` runs on a schedule (every 6 hours by default, see
   `.github/workflows/update-firmware.yml`), via `npm run update`.
2. It hits the three JSON APIs directly, and scrapes the two wiki pages with
   a headless Chromium (Playwright), since those pages render their
   changelog client-side and have no API.
3. Results are merged into `data/*.json`. For sources with no official
   release date, a version's date is stamped **once**, the first time the
   tracker sees it, and never changed again — that's what "date first
   available" means for those tabs. Sources that do publish a real date
   always use that instead.
4. If anything changed, the workflow commits `data/*.json` straight back to
   `main`.
5. GitHub Pages serves the repo's static files directly, so a new commit to
   `data/*.json` is live the moment Pages picks it up — there's no
   separate build/deploy step.

The site itself (`index.html` / `style.css` / `app.js`) is a plain static
page: it fetches `data/manifest.json` and then each `data/<source>.json`,
renders one tab per source with a Version / Date first available /
Description table, and filters rows live as you type in the search box
(matches against both the version number and the changelog text).

## One-time setup

1. Create a new GitHub repo and push everything in this folder to it.
2. In the repo, go to **Settings → Pages** and set "Build and deployment"
   to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
3. Go to **Settings → Actions → General → Workflow permissions** and make
   sure "Read and write permissions" is selected (needed so the scheduled
   job can commit `data/*.json` back to the repo). The workflow also
   declares `permissions: contents: write` itself, but on some org-level
   default settings you still need the repo setting enabled too.
4. Trigger the workflow once by hand: **Actions → Update Homey changelogs
   → Run workflow**. This does the first real data pull — the `data/*.json`
   files ship empty (`[]`) in this deliverable since I can't reach Athom's
   API/pages from my own sandboxed environment to verify live output; the
   parsing logic was built and checked against real responses I fetched via
   web search/fetch tools during development, but the first Action run is
   the first time the code itself talks to these endpoints end to end.
5. After that run finishes and pushes data, your site is live at
   `https://<your-username>.github.io/<repo-name>/`.

## Local development

```bash
npm install
npx playwright install --with-deps chromium   # only needed for the scraper
npm run update                                 # pulls fresh data into data/*.json
python3 -m http.server 8000                    # or any static file server
# open http://localhost:8000
```

(Opening `index.html` directly via a `file://` URL will NOT work — browsers
block `fetch()` against `file://` paths, so you need a local static server,
same as GitHub Pages serves it.)

## Adjusting things later

- **Change the schedule**: edit the `cron` line in
  `.github/workflows/update-firmware.yml`.
- **Add Homey Bridge back in** if Athom ever publishes a changelog for it:
  add a fetcher/scraper following the pattern in `scripts/fetch-api-sources.mjs`
  or `scripts/scrape-wiki.mjs`, register it in `SOURCES` in
  `scripts/update-all.mjs`, and seed `data/homey-bridge.json` with `[]`.
- **If the wiki page structure changes**, `scrapeMobileAppChangelog` /
  `scrapeWebAppChangelog` in `scripts/scrape-wiki.mjs` will start returning
  zero entries; `update-all.mjs` deliberately leaves the existing
  `data/*.json` file untouched in that case (logged as a warning in the
  Action run) rather than overwriting good history with nothing, but you'll
  need to update the scraper's selectors.
