function unwrapTweet(result) {
  if (result?.__typename === "TweetWithVisibilityResults") return result.tweet;
  return result;
}

function findTweetResults(node, output = []) {
  if (!node || typeof node !== "object") return output;
  if (node.tweet_results?.result) {
    output.push(node.tweet_results.result);
    return output;
  }
  if (Array.isArray(node)) node.forEach(item => findTweetResults(item, output));
  else Object.values(node).forEach(value => findTweetResults(value, output));
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

export function normalizeTweet(raw) {
  const tweet = unwrapTweet(raw);
  const legacy = tweet?.legacy;
  if (!tweet?.rest_id || !legacy) return null;
  const user = tweet.core?.user_results?.result;
  const userLegacy = user?.legacy || {};
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
  const article = tweet.article?.article_results?.result;
  const postType = legacy.retweeted_status_result ? "repost" : legacy.in_reply_to_status_id_str ? "reply" : legacy.quoted_status_id_str ? "quote" : "post";
  return {
    id: "bookmark_" + tweet.rest_id,
    tweetId: tweet.rest_id,
    text: noteText || legacy.full_text || "",
    authorId: user?.rest_id || "",
    authorName: userLegacy.name || "Unknown",
    authorHandle: userLegacy.screen_name ? "@" + userLegacy.screen_name : "",
    avatarUrl: userLegacy.profile_image_url_https || "",
    createdAt: Math.floor(Date.parse(legacy.created_at || 0) / 1000) || 0,
    bookmarkedAt: Math.floor(Date.now() / 1000),
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

export function parseBookmarksResponse(payload) {
  const seen = new Set();
  const posts = findTweetResults(payload).map(normalizeTweet).filter(post => {
    if (!post || seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  return { posts, cursor: findBottomCursor(payload) };
}
