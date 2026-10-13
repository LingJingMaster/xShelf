const ALLOWED_HOSTS = new Set(["t.co", "x.com", "www.x.com", "twitter.com", "www.twitter.com"]);

export function isAllowedPreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

export function extractPreviewImage(html) {
  const tags = html.match(/<meta\s+[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (!content) continue;
    const decoded = decodeHtml(content);
    try {
      const url = new URL(decoded);
      if (url.protocol === "https:" && (url.hostname === "pbs.twimg.com" || url.hostname.endsWith(".twimg.com"))) return url.toString();
    } catch {}
  }
  return null;
}
