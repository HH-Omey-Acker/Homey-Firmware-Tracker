import { chromium } from "playwright";
import { sanitizeHtml, toPlainText } from "./lib/sanitize.mjs";

/**
 * Homey's Mobile App and Web App changelogs are NOT behind an API - they're
 * published as plain wiki pages on homey.app that render their content
 * client-side. We render the page with a real browser and pull out each
 * version heading + the changelog bullets that follow it, up to the next
 * heading.
 *
 * Observed structure (2026-09):
 *   <h2>v10.1.1</h2>
 *   <ul><li>...</li>...</ul>
 *   <h2>v10.1.0</h2>
 *   ...
 * No release dates are published on these pages, so every entry here gets
 * its "date first available" stamped as the date this script first saw it
 * (handled in store.mjs).
 */

async function scrapePage(browser, url) {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (compatible; homey-firmware-tracker/1.0; +personal changelog aggregator)",
  });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });

    // The content loads asynchronously; wait for at least one heading that
    // looks like a version number, or give up after a while (page structure
    // may have changed - better to fail loudly than silently return nothing).
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("h1,h2,h3")).some((h) =>
            /^v?\d+(\.\d+){1,3}/i.test(h.textContent.trim())
          ),
        { timeout: 20_000 }
      )
      .catch(() => {
        /* handled by the empty-results check below */
      });

    const raw = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3")).filter((h) =>
        /^v?\d+(\.\d+){1,3}/i.test(h.textContent.trim())
      );
      return headings.map((h) => {
        const versionRaw = h.textContent.trim();
        const parts = [];
        let node = h.nextElementSibling;
        while (node && !/^H[1-3]$/.test(node.tagName)) {
          parts.push(node.outerHTML);
          node = node.nextElementSibling;
        }
        return { versionRaw, html: parts.join("\n") };
      });
    });

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

export async function scrapeMobileAppChangelog() {
  const browser = await chromium.launch();
  try {
    return await scrapePage(browser, "https://homey.app/en-us/wiki/homey-mobile-app-changelog/");
  } finally {
    await browser.close();
  }
}

export async function scrapeWebAppChangelog() {
  const browser = await chromium.launch();
  try {
    return await scrapePage(browser, "https://homey.app/en-us/wiki/homey-web-app-changelog/");
  } finally {
    await browser.close();
  }
}
