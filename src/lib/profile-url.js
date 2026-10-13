const PROFILE_ROUTES = Object.freeze({
  post: "",
  reply: "/with_replies",
  following: "/following",
  follower: "/followers"
});

export function isScreenName(value) {
  return /^[A-Za-z0-9_]{1,15}$/.test(value || "");
}

export function profileUrl(category, screenName) {
  if (!isScreenName(screenName) || !Object.hasOwn(PROFILE_ROUTES, category)) return null;
  return "https://x.com/" + screenName + PROFILE_ROUTES[category];
}

export function needsProfileUrl(category) {
  return Object.hasOwn(PROFILE_ROUTES, category);
}
