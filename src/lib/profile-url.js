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

export function extractScreenName(html) {
  const patterns = [
    /android-app:\/\/com\.twitter\.android\/twitter\/user\?screen_name=([A-Za-z0-9_]{1,15})/,
    /"screen_name":"([A-Za-z0-9_]{1,15})"/,
    /"screenName":"([A-Za-z0-9_]{1,15})"/
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (isScreenName(match?.[1])) return match[1];
  }
  return null;
}
