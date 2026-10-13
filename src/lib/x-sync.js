function unwrapTweet(result) {
  if (result?.__typename === "TweetWithVisibilityResults") return result.tweet;
  return result;
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

function mediaTypes(legacy) {
  const media = legacy?.extended_entities?.media || legacy?.entities?.media || [];
  const types = new Set();
  media.forEach(item => {
    if (item.type === "photo") types.add("image");
    if (item.type === "video") types.add("video");
    if (item.type === "animated_gif") types.add("gif");
  });
  return [...types];
}

export function normalizeTweet(raw, category = "bookmark") {
  const tweet = unwrapTweet(raw);
  const legacy = tweet?.legacy;
  if (!tweet?.rest_id || !legacy) return null;
  const user = tweet.core?.user_results?.result;
  const userLegacy = user?.legacy || {};
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
  const article = tweet.article?.article_results?.result;
  const postType = legacy.retweeted_status_result ? "repost" : legacy.in_reply_to_status_id_str ? "reply" : legacy.quoted_status_id_str ? "quote" : "post";
  return {
    id: category + "_" + tweet.rest_id,
    category,
    tweetId: tweet.rest_id,
    text: noteText || legacy.full_text || "",
    authorId: user?.rest_id || "",
    authorName: userLegacy.name || "Unknown",
    authorHandle: userLegacy.screen_name ? "@" + userLegacy.screen_name : "",
    avatarUrl: userLegacy.profile_image_url_https || "",
    createdAt: Math.floor(Date.parse(legacy.created_at || 0) / 1000) || 0,
    savedAt: Math.floor(Date.now() / 1000),
    folder: "unsorted",
    contentTypes: [...mediaTypes(legacy), ...(article ? ["article"] : [])],
    postType,
    articleTitle: article?.title || "",
    articlePreview: article?.preview_text || "",
    url: userLegacy.screen_name ? "https://x.com/" + userLegacy.screen_name + "/status/" + tweet.rest_id : "https://x.com/i/status/" + tweet.rest_id,
    media: (legacy.extended_entities?.media || []).map(item => ({
      type: item.type,
      url: item.media_url_https,
      videoUrl: item.video_info?.variants?.filter(v => v.content_type === "video/mp4").sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url || ""
    }))
  };
}

export function normalizeUser(raw, category) {
  const user = raw?.__typename === "UserUnavailable" ? null : raw;
  const legacy = user?.legacy;
  if (!user?.rest_id || !legacy) return null;
  return {
    id: category + "_" + user.rest_id,
    category,
    userId: user.rest_id,
    authorName: legacy.name || "Unknown",
    authorHandle: legacy.screen_name ? "@" + legacy.screen_name : "",
    avatarUrl: legacy.profile_image_url_https || "",
    description: legacy.description || "",
    createdAt: Math.floor(Date.parse(legacy.created_at || 0) / 1000) || 0,
    savedAt: Math.floor(Date.now() / 1000),
    folder: "unsorted",
    followersCount: legacy.followers_count || 0,
    followingCount: legacy.friends_count || 0,
    postCount: legacy.statuses_count || 0,
    canDm: Boolean(legacy.can_dm),
    isProtected: Boolean(legacy.protected),
    url: legacy.screen_name ? "https://x.com/" + legacy.screen_name : "https://x.com/i/user/" + user.rest_id
  };
}

export function parseTimelineResponse(payload, category = "bookmark") {
  const userCategory = ["following", "follower", "blocked"].includes(category);
  const rawRows = findResults(payload, userCategory ? "user_results" : "tweet_results");
  const normalize = userCategory ? raw => normalizeUser(raw, category) : raw => normalizeTweet(raw, category);
  const seen = new Set();
  const rows = rawRows.map(normalize).filter(row => {
    if (!row || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return { rows, cursor: findBottomCursor(payload), store: userCategory ? "users" : "posts" };
}

export function parseBookmarksResponse(payload) {
  const parsed = parseTimelineResponse(payload, "bookmark");
  return { posts: parsed.rows, cursor: parsed.cursor };
}
