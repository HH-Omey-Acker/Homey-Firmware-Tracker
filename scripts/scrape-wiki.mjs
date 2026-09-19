import { chromium } from "playwright";
import { sanitizeHtml, toPlainText } from "./lib/sanitize.mjs";

/**
 * A few Homey changelogs aren't behind a clean JSON API - they're published
 * as plain web pages that we render with a real browser and scrape:
 *   - Homey Mobile App changelog (homey.app wiki, client-rendered)
 *   - Homey Web App changelog (homey.app wiki, client-rendered)
 *   - Homey SHS (Self-Hosted Server) changelog (ota-api.homeyshs.net)
 *
 * Observed structure for all three (2026-09):
 *   <h2>v10.1.1</h2>
 *   <h3>Core</h3>          <-- optional category subheading, varies per page
 *   <ul><li>...</li>...</ul>
 *   <h2>v10.1.0</h2>
 *   ...
 * The SHS page in particular mixes "###" subheadings and plain bold text
 * for its per-category labels within a version, so we deliberately do NOT
 * stop at every h1-h3 - we only stop at the next heading that itself looks
 * like a version number. Everything in between (including any subheadings)
 * is kept as part of that version's description.
 *
 * None of these three pages publish a release date, so every entry here
 * gets its "date first available" stamped as the date this script first
 * saw it (handled in store.mjs), never touched again after that.
 */

const VERSION_PATTERN = /^v?\d+(\.\d+){1,3}/i;

async function scrapePage(browser, url) {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (compatible; homey-firmware-tracker/1.0; +personal changelog aggregator)",
  });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });

    // Some of these pages load their content asynchronously; wait for at
    // least one heading that looks like a version number, or give up after
    // a while (page structure may have changed - better to fail loudly via
    // the empty-results check in update-all.mjs than silently return junk).
    await page
      .waitForFunction(
        (pattern) =>
          Array.from(document.querySelectorAll("h1,h2,h3,h4")).some((h) =>
            new RegExp(pattern, "i").test(h.textContent.trim())
          ),
        VERSION_PATTERN.source,
        { timeout: 20_000 }
      )
      .catch(() => {
        /* handled by the empty-results check below */
      });

    const raw = await page.evaluate((pattern) => {
      const versionRe = new RegExp(pattern, "i");
      const isVersionHeading = (el) =>
        el && /^H[1-6]$/.test(el.tagName) && versionRe.test(el.textContent.trim());

      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(
        isVersionHeading
      );

      return headings.map((h) => {
        const versionRaw = h.textContent.trim();
        const parts = [];
        let node = h.nextElementSibling;
        // Stop only at the NEXT version heading, not at any heading - a
        // version's own category subheadings (h3 "Core", etc.) stay in.
        while (node && !isVersionHeading(node)) {
          parts.push(node.outerHTML);
          node = node.nextElementSibling;
        }
        return { versionRaw, html: parts.join("\n") };
      });
    }, VERSION_PATTERN.source);

    return raw.map(({ versionRaw, html }) => {
      const version = versionRaw.replace(/^v/i, "").trim();
      const clean = sanitizeHtml(html);
      return {
        version,
        channel: null,
        description: clean,
        descriptionText: toPlainText(clean),
      };
    });
  } finally {
    await page.close();
  }
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

export async function scrapeMobileAppChangelog() {
  return withBrowser((browser) =>
    scrapePage(browser, "https://homey.app/en-us/wiki/homey-mobile-app-changelog/")
  );
}

export async function scrapeWebAppChangelog() {
  return withBrowser((browser) =>
    scrapePage(browser, "https://homey.app/en-us/wiki/homey-web-app-changelog/")
  );
}

export async function scrapeHomeySHSChangelog() {
  return withBrowser((browser) => scrapePage(browser, "https://ota-api.homeyshs.net/changelog.html"));
}
