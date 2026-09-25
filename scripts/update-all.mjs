import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchHomeyProMini,
  fetchHomeyPro2016to2019,
  fetchHomeyCloud,
} from "./fetch-api-sources.mjs";
import {
  scrapeMobileAppChangelog,
  scrapeWebAppChangelog,
  scrapeHomeySHSChangelog,
} from "./scrape-wiki.mjs";
import { loadExisting, mergeEntries, saveChangelog } from "./lib/store.mjs";
import { writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const SOURCES = [
  {
    id: "homey-pro-mini",
    label: "Homey Pro & Homey Pro mini",
    fetcher: fetchHomeyProMini,
  },
  {
    id: "homey-shs",
    label: "Homey SHS (Self-Hosted Server)",
    fetcher: scrapeHomeySHSChangelog,
  },
  {
    id: "homey-cloud",
    label: "Homey Cloud",
    fetcher: fetchHomeyCloud,
  },
  {
    id: "homey-pro-2016-2019",
    label: "Homey Pro (2016 – 2019)",
    fetcher: fetchHomeyPro2016to2019,
  },
  {
    id: "homey-mobile-app",
    label: "Homey Mobile App",
    fetcher: scrapeMobileAppChangelog,
  },
  {
    id: "homey-web-app",
    label: "Homey Web App",
    fetcher: scrapeWebAppChangelog,
  },
];

let hadFailure = false;
const changedFiles = [];

for (const source of SOURCES) {
  const path = join(DATA_DIR, `${source.id}.json`);
  process.stdout.write(`\n[${source.label}] fetching...\n`);
  try {
    const fresh = await source.fetcher();
    if (!fresh || fresh.length === 0) {
      console.warn(
        `[${source.label}] got 0 entries - leaving existing data/${source.id}.json untouched ` +
          `(likely a source outage or the page structure changed; not overwriting good data with nothing).`
      );
      continue;
    }
    const existing = await loadExisting(path);
    const merged = mergeEntries(existing, fresh);
    const changed = await saveChangelog(path, merged);
    console.log(
      `[${source.label}] ${merged.length} versions total` +
        (changed ? " (data/*.json updated)" : " (no changes)")
    );
    if (changed) changedFiles.push(`data/${source.id}.json`);
  } catch (err) {
    hadFailure = true;
    console.error(`[${source.label}] FAILED:`, err.message);
  }
}

console.log(
  changedFiles.length
    ? `\nChanged files: ${changedFiles.join(", ")}`
    : "\nNo changelog files changed."
);

// A small manifest the site reads to show "last updated" and to know which
// data files + display labels/order to fetch, without hardcoding it twice.
await writeFile(
  join(DATA_DIR, "manifest.json"),
  JSON.stringify(
    {
      lastRun: new Date().toISOString(),
      sources: SOURCES.map((s) => ({ id: s.id, label: s.label, file: `${s.id}.json` })),
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// Exit non-zero only if every single source failed - a partial failure
// (e.g. one API briefly down) shouldn't block committing the sources that
// did succeed, but a total wipeout should be visible in the Action's log.
if (hadFailure && changedFiles.length === 0) {
  process.exitCode = 1;
}
