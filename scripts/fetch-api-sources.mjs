import { sanitizeHtml, toPlainText } from "./lib/sanitize.mjs";

const UA = "homey-firmware-tracker/1.0 (+https://github.com/; personal changelog aggregator)";

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function extractChangelogText(changelog) {
  // Some sources give a plain string, others { en: "...", nl: "...", ... }.
  if (typeof changelog === "string") return changelog;
  if (changelog && typeof changelog === "object") {
    return changelog.en ?? Object.values(changelog)[0] ?? "";
  }
  return "";
}

function toFreshEntry({ version, channel, changelogHtml, officialDate }) {
  const clean = sanitizeHtml(changelogHtml);
  return {
    version: String(version),
    channel: channel ?? null,
    description: clean,
    descriptionText: toPlainText(clean),
    officialDate: officialDate ?? undefined,
  };
}

/**
 * Homey Pro (2023/2026) & Homey Pro mini.
 * https://ota-api.homeypro.net/api/v1/changelog/?channel=beta
 * Response shape: { entries or top-level array } of
 *   { version, channel, changelog }  <-- NO date field.
 */
export async function fetchHomeyProMini() {
  const url = "https://ota-api.homeypro.net/api/v1/changelog/?channel=beta";
  const data = await getJson(url);
  const list = Array.isArray(data) ? data : data.entries ?? data.changelog ?? data.updates ?? [];
  return list.map((item) =>
    toFreshEntry({
      version: item.version,
      channel: item.channel,
      changelogHtml: extractChangelogText(item.changelog),
      // No date provided by this endpoint - store.mjs will stamp
      // "date first discovered" for any version we haven't seen before.
    })
  );
}

/**
 * Homey Pro (2016 - 2019) / Homey (2016-2019).
 * https://firmware.athom.com/api/update/changelog/?channel=beta
 * Response shape: { success, message: { updates: [...] } } or a bare array,
 * entries: { version, changelog: { en: "..." }, channels: [...], date }.
 */
export async function fetchHomeyPro2016to2019() {
  const url = "https://firmware.athom.com/api/update/changelog/?channel=beta";
  const data = await getJson(url);
  const list = Array.isArray(data)
    ? data
    : data.message?.updates ?? data.updates ?? data.entries ?? [];
  return list.map((item) =>
    toFreshEntry({
      version: item.version,
      channel: Array.isArray(item.channels) ? item.channels.join(", ") : item.channel,
      changelogHtml: extractChangelogText(item.changelog),
      officialDate: item.date,
    })
  );
}

/**
 * Homey Cloud.
 * https://ota-api.homeycloud.net/api/v1/changelog?channel=stable
 * Response shape: bare array of { version, channel, changelog, labels, createdAt }.
 */
export async function fetchHomeyCloud() {
  const url = "https://ota-api.homeycloud.net/api/v1/changelog?channel=stable";
  const data = await getJson(url);
  const list = Array.isArray(data) ? data : data.entries ?? [];
  return list.map((item) =>
    toFreshEntry({
      version: item.version,
      channel: item.channel,
      changelogHtml: extractChangelogText(item.changelog),
      officialDate: item.createdAt,
    })
  );
}
