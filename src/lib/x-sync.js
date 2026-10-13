function unwrapTweet(result) {
  if (result?.__typename === "TweetWithVisibilityResults") return result.tweet;
  return result?.tweet || result;
}

function unwrapUser(result) {
  let user = result;
  for (let depth = 0; depth < 4 && user; depth += 1) {
    if (user.legacy || user.core || user.rest_id) return user;
    user = user.user || user.result;
  }
  return user;
}

function findResults(node, key, output = []) {
  if (!node || typeof node !== "object") return output;
  if (node[key]?.result) {
    output.push(node[key].result);
    return output;
  }
  if (Array.isArray(node)) node.forEach(item => findResults(item, key, output));
  else Object.values(node).forEach(value => findResults(value, key, output));
  return output;
}

function findBottomCursor(node) {
  if (!node || typeof node !== "object") return null;
  if (node.cursorType === "Bottom" && node.value) return node.value;
  for (const value of Object.values(node)) {
    const found = findBottomCursor(value);
    if (found) return found;
  }
  return null;
}

const USER_TIMELINE_KEYS = Object.freeze({ follower: ["followers_timeline"], following: ["following_timeline"] });

function scopedTimeline(payload, category) {
  const keys = USER_TIMELINE_KEYS[category];
  if (!keys) return payload;
  const matches = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    for (const key of keys) if (node[key]) matches.push(node[key]);
    for (const value of Object.values(node)) walk(value);
  }
  walk(payload);
  return matches.length ? matches : payload;
}

function timelineCursor(payload) {
  const candidates = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.instructions)) {
      for (const instruction of node.instructions) {
        const entries = [
          ...(Array.isArray(instruction.entries) ? instruction.entries : []),
          ...(instruction.entry ? [instruction.entry] : [])
        ];
        const cursor = entries.map(entry => entry?.content).find(content => content?.cursorType === "Bottom" && content.value)?.value;
        if (!cursor) continue;
        const users = entries.reduce((sum, entry) => sum + findResults(entry, "user_results").length, 0);
        candidates.push({ cursor, users });
      }
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(payload);
  return candidates.sort((a, b) => a.users - b.users).at(-1)?.cursor || findBottomCursor(payload);
}

export function nextTimelineUrl(templateUrl, cursor) {
  const url = new URL(templateUrl);
  const variables = JSON.parse(url.searchParams.get("variables") || "{}");
  if (!Number.isInteger(variables.count) || variables.count <= 0) variables.count = 20;
  if (cursor) variables.cursor = cursor;
  else delete variables.cursor;
  if ("includePromotedContent" in variables) variables.includePromotedContent = false;
  url.searchParams.set("variables", JSON.stringify(variables));
  return url.toString();
}

function userFields(raw) {
  const user = unwrapUser(raw) || {};
  const legacy = user.legacy || {};
  const core = user.core || {};
  const avatar = user.avatar || {};
  return {
    user,
    legacy,
    id: user.rest_id || user.id_str || user.id || "",
    name: legacy.name || core.name || user.name || "Unknown",
    screenName: legacy.screen_name || core.screen_name || user.screen_name || "",
    avatarUrl: legacy.profile_image_url_https || user.profile_image_url_https || avatar.image_url || core.profile_image_url_https || "",
    description: legacy.description || user.profile_bio?.description || user.description || "",
    createdAt: legacy.created_at || core.created_at || user.created_at,
    followersCount: legacy.followers_count ?? user.public_metrics?.followers_count ?? user.followers_count ?? 0,
    followingCount: legacy.friends_count ?? user.public_metrics?.following_count ?? user.friends_count ?? 0,
    postCount: legacy.statuses_count ?? user.public_metrics?.tweet_count ?? user.statuses_count ?? 0,
    canDm: Boolean(legacy.can_dm ?? user.can_dm),
    isProtected: Boolean(legacy.protected ?? user.is_protected ?? user.protected)
  };
}

function unwrapMedia(item) {
  return item?.media_results?.result || item?.result || item;
}

function cardMedia(tweet) {
  const bindings = tweet?.card?.legacy?.binding_values || [];
  return bindings.flatMap(binding => {
    const key = binding?.key || "";
    const value = binding?.value?.string_value || "";
    if (!/image|photo|thumbnail/i.test(key)) return [];
    if (!/^https:\/\/(?:pbs\.twimg\.com|video\.twimg\.com)\//.test(value)) return [];
    return [{ type: "photo", media_url_https: value, ext_alt_text: key, rank: /large|original/i.test(key) ? 1 : 0 }];
  }).sort((a, b) => b.rank - a.rank);
}

function extractMedia(tweet, legacy) {
  const quoted = tweet?.quoted_status_result?.result || legacy?.retweeted_status_result?.result;
  const sources = [
    legacy?.extended_entities?.media,
    legacy?.entities?.media,
    tweet?.extended_entities?.media,
    tweet?.entities?.media,
    tweet?.media_entities2,
    quoted?.media_entities2,
    quoted?.legacy?.extended_entities?.media,
    tweet?.media?.all,
    tweet?.media?.media_items,
    cardMedia(tweet)
  ];
  const seen = new Set();
  const rows = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      const item = unwrapMedia(raw);
      const url = item?.media_url_https || item?.media_url || item?.preview_image_url || "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const variants = item.video_info?.variants || item.variants || [];
      rows.push({
        type: item.type || item.media_type || (variants.length ? "video" : "photo"),
        url,
        alt: item.ext_alt_text || item.alt_text || "",
        width: item.original_info?.width || item.sizes?.large?.w || 0,
        height: item.original_info?.height || item.sizes?.large?.h || 0,
        videoUrl: variants
          .filter(variant => (variant.content_type === "video/mp4" || variant.type === "video/mp4") && variant.url)
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url || ""
      });
    }
  }
  return rows;
}

function extractLinks(tweet, legacy) {
  const links = [];
  const seen = new Set();
  const sources = [legacy?.entities?.urls, tweet?.entities?.urls];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const shortUrl = item?.url || "";
      const expandedUrl = item?.expanded_url || item?.expandedUrl || shortUrl;
      if (!shortUrl && !expandedUrl) continue;
      const key = shortUrl || expandedUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ url: shortUrl || expandedUrl, expandedUrl, displayUrl: item?.display_url || "" });
    }
  }
  const text = legacy?.full_text || tweet?.text || "";
  for (const match of text.matchAll(/https:\/\/t\.co\/[A-Za-z0-9]+/g)) {
    if (seen.has(match[0])) continue;
    seen.add(match[0]);
    links.push({ url: match[0], expandedUrl: match[0], displayUrl: "" });
  }
  return links;
}

function mediaTypes(media) {
  const types = new Set();
  media.forEach(item => {
    if (item.type === "photo" || item.type === "image") types.add("image");
    if (item.type === "video") types.add("video");
    if (item.type === "animated_gif" || item.type === "gif") types.add("gif");
  });
  return [...types];
}

export function normalizeTweet(raw, category = "bookmark") {
  const tweet = unwrapTweet(raw);
  const legacy = tweet?.legacy || {};
  if (!tweet?.rest_id && !tweet?.id_str) return null;
  if (!legacy.full_text && !tweet.note_tweet && !tweet.article && !tweet.core) return null;
  const tweetId = tweet.rest_id || tweet.id_str;
  const author = userFields(tweet.core?.user_results?.result || tweet.author_results?.result || tweet.user_results?.result);
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text || tweet.note_tweet?.text;
  const article = tweet.article?.article_results?.result || tweet.article;
  const media = extractMedia(tweet, legacy);
  const links = extractLinks(tweet, legacy);
  const postType = legacy.retweeted_status_result ? "repost" : legacy.in_reply_to_status_id_str ? "reply" : legacy.quoted_status_id_str || tweet.quoted_status_result ? "quote" : "post";
  return {
    id: category + "_" + tweetId,
    category,
    tweetId,
    text: noteText || legacy.full_text || tweet.text || "",
    authorId: author.id,
    authorName: author.name,
    authorHandle: author.screenName ? "@" + author.screenName : "",
    avatarUrl: author.avatarUrl,
    createdAt: Math.floor(Date.parse(legacy.created_at || tweet.created_at || 0) / 1000) || 0,
    savedAt: Math.floor(Date.now() / 1000),
    folder: "unsorted",
    contentTypes: [...mediaTypes(media), ...(article ? ["article"] : [])],
    postType,
    articleTitle: article?.title || "",
    articlePreview: article?.preview_text || article?.description || "",
    url: author.screenName ? "https://x.com/" + author.screenName + "/status/" + tweetId : "https://x.com/i/status/" + tweetId,
    media,
    links
  };
}

export function normalizeUser(raw, category) {
  if (raw?.__typename === "UserUnavailable") return null;
  const fields = userFields(raw);
  if (!fields.id) return null;
  return {
    id: category + "_" + fields.id,
    category,
    userId: fields.id,
    authorName: fields.name,
    authorHandle: fields.screenName ? "@" + fields.screenName : "",
    avatarUrl: fields.avatarUrl,
    description: fields.description,
    createdAt: Math.floor(Date.parse(fields.createdAt || 0) / 1000) || 0,
    savedAt: Math.floor(Date.now() / 1000),
    folder: "unsorted",
    followersCount: fields.followersCount,
    followingCount: fields.followingCount,
    postCount: fields.postCount,
    canDm: fields.canDm,
    isProtected: fields.isProtected,
    url: fields.screenName ? "https://x.com/" + fields.screenName : "https://x.com/i/user/" + fields.id
  };
}

export function parseTimelineResponse(payload, category = "bookmark") {
  const userCategory = ["following", "follower", "blocked"].includes(category);
  const scoped = scopedTimeline(payload, category);
  const rawRows = findResults(scoped, userCategory ? "user_results" : "tweet_results");
  const normalize = userCategory ? raw => normalizeUser(raw, category) : raw => normalizeTweet(raw, category);
  const seen = new Set();
  const rows = rawRows.map(normalize).filter(row => {
    if (!row || seen.has(row.id)) return false;
    if (category === "reply" && row.postType !== "reply") return false;
    if (category === "post" && row.postType === "reply") return false;
    seen.add(row.id);
    return true;
  });
  return { rows, cursor: timelineCursor(scoped), store: userCategory ? "users" : "posts" };
}

export function parseBookmarksResponse(payload) {
  const parsed = parseTimelineResponse(payload, "bookmark");
  return { posts: parsed.rows, cursor: parsed.cursor };
}
