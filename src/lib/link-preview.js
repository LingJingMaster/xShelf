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

function xImageUrl(value) {
  try {
    const url = new URL(decodeHtml(value));
    if (url.protocol === "https:" && (url.hostname === "pbs.twimg.com" || url.hostname.endsWith(".twimg.com"))) return url.toString();
  } catch {}
  return null;
}

export function extractRedirectTarget(html) {
  const source = String(html || "");
  const refresh = source.match(/URL=([^"'\s>]+)/i)?.[1];
  const replaced = source.match(/location\.replace\(\s*["']([^"']+)["']/i)?.[1];
  const candidate = decodeHtml((refresh || replaced || "").replaceAll("\\/", "/")).replace(/^http:\/\/((?:www\.)?(?:x|twitter)\.com)/, "https://$1");
  return isAllowedPreviewUrl(candidate) ? candidate : null;
}

function isPlaceholderImage(url) {
  return url.includes("/rweb/ssr/default/") || url.endsWith("/og/image.png");
}

export function extractPreviewImage(html) {
  const source = String(html || "");
  const tags = source.match(/<meta\s+[^>]*>/gi) || [];
  const images = [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    const image = content && xImageUrl(content);
    if (image && !isPlaceholderImage(image)) images.push(image);
  }
  const media = images.find(url => url.includes("pbs.twimg.com/media/"));
  if (media) return media;
  if (images[0]) return images[0];
  const srcset = source.match(/imageSrcSet=["']([^"']+)["']/i)?.[1] || "";
  const candidates = srcset.split(",").map(item => item.trim().split(/\s+/)[0]).map(xImageUrl).filter(url => url && !isPlaceholderImage(url));
  return candidates.find(url => url.includes("name=large")) || candidates[0] || null;
}
