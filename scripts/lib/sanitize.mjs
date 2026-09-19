/**
 * Very small HTML sanitizer/normalizer for changelog snippets coming from
 * Athom's own APIs and wiki pages. We do NOT trust it blindly (it's a public
 * site), so we strip everything down to a tiny allowlist of formatting tags
 * before it's ever written to the JSON files that the static site fetches
 * and injects into the DOM.
 */

const ALLOWED_TAGS = new Set(["p", "ul", "ol", "li", "strong", "em", "b", "i", "br"]);

/**
 * Strip any tag that isn't in the allowlist, strip all attributes from tags
 * that survive, and drop script/style content entirely.
 */
export function sanitizeHtml(input) {
  if (!input) return "";
  let html = String(input);

  // Nuke script/style blocks completely (content included).
  html = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Remove any tag not on the allowlist, keeping its inner text.
  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    // Strip attributes (including on:*, href=javascript:, style=, etc).
    const isClosing = match.startsWith("</");
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  // Collapse Windows line endings / stray whitespace left behind.
  html = html.replace(/\r\n/g, "\n").trim();

  return html;
}

/** Plain-text version of a changelog snippet, used for search indexing. */
export function toPlainText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/(p|ul|ol|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
