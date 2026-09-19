import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Each JSON file in /data is an array of entries shaped like:
 * {
 *   version: string,
 *   date: "YYYY-MM-DD",           // the date we SHOW on the site
 *   dateSource: "official" | "discovered",
 *   description: string,          // sanitized HTML
 *   descriptionText: string,      // plain text, used for search
 *   channel: string | null,       // "stable" | "beta" | null when unknown
 *   firstSeenAt: string           // ISO timestamp of the first time our script recorded this version, for audit
 * }
 *
 * "date" rules:
 *  - If the upstream source gives us a real release date/timestamp, we use
 *    it (dateSource "official") and keep it in sync if it ever changes.
 *  - If the upstream source has no date at all (this is true for the
 *    Homey Pro / Pro mini API and for the scraped Mobile/Web App wiki
 *    pages), we stamp it with the date this script first saw the version
 *    and never touch it again (dateSource "discovered"). That stamped
 *    date is what "date first available" means for those two.
 */

export async function loadExisting(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.warn(`[store] Could not read/parse ${path}, starting fresh:`, err.message);
    return [];
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Merge freshly-fetched entries into the existing stored list.
 *
 * @param {Array} existing - previously stored entries for this changelog
 * @param {Array} fresh - newly fetched entries, each:
 *   { version, description, descriptionText, channel, officialDate? }
 *   officialDate should be an ISO date string when the source provides one,
 *   omitted/undefined otherwise.
 */
export function mergeEntries(existing, fresh) {
  const byVersion = new Map(existing.map((e) => [e.version, e]));
  const now = new Date().toISOString();
  const today = todayUtc();

  for (const item of fresh) {
    const prev = byVersion.get(item.version);

    if (item.officialDate) {
      // Source has a real date for this version - trust it, always.
      byVersion.set(item.version, {
        version: item.version,
        date: item.officialDate.slice(0, 10),
        dateSource: "official",
        description: item.description,
        descriptionText: item.descriptionText,
        channel: item.channel ?? prev?.channel ?? null,
        firstSeenAt: prev?.firstSeenAt ?? now,
      });
    } else if (prev) {
      // Already known - keep its original discovered/official date,
      // just refresh the description text in case Athom edited it.
      byVersion.set(item.version, {
        ...prev,
        description: item.description,
        descriptionText: item.descriptionText,
        channel: item.channel ?? prev.channel ?? null,
      });
    } else {
      // Brand new version with no official date - stamp today as the
      // date it was first discovered by this tracker.
      byVersion.set(item.version, {
        version: item.version,
        date: today,
        dateSource: "discovered",
        description: item.description,
        descriptionText: item.descriptionText,
        channel: item.channel ?? null,
        firstSeenAt: now,
      });
    }
  }

  return Array.from(byVersion.values()).sort((a, b) => {
    // Most recent date first; ties broken by a best-effort version compare.
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareVersions(b.version, a.version);
  });
}

function compareVersions(a, b) {
  const pa = String(a).match(/\d+/g)?.map(Number) ?? [];
  const pb = String(b).match(/\d+/g)?.map(Number) ?? [];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return String(a).localeCompare(String(b));
}

export async function saveChangelog(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  const json = JSON.stringify(entries, null, 2) + "\n";
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === json) return false; // unchanged, nothing to commit
  await writeFile(path, json, "utf8");
  return true;
}
