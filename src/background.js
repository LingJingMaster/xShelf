const APP_URL = chrome.runtime.getURL("app.html");
const CAPTURED_KEY = "xBookmarkRequest";
const SAFE_HEADERS = new Set([
  "authorization",
  "x-csrf-token",
  "x-client-uuid",
  "x-client-transaction-id",
  "x-twitter-active-user",
  "x-twitter-auth-type",
  "x-twitter-client-language"
]);

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: APP_URL + "*" });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  details => {
    if (details.tabId < 0 || !/\/(Bookmarks|BookmarkFolderTimeline)(?:\?|$)/.test(details.url)) return;
    const headers = {};
    for (const header of details.requestHeaders || []) {
      const name = header.name.toLowerCase();
      if (SAFE_HEADERS.has(name) && header.value) headers[name] = header.value;
    }
    if (!headers.authorization || !headers["x-csrf-token"]) return;
    chrome.storage.session.set({
      [CAPTURED_KEY]: { url: details.url, headers, capturedAt: Date.now() }
    });
  },
  { urls: ["https://x.com/i/api/graphql/*"] },
  ["requestHeaders", "extraHeaders"]
);

function buildPageUrl(templateUrl, cursor) {
  const url = new URL(templateUrl);
  const variables = JSON.parse(url.searchParams.get("variables") || "{}");
  variables.count = 100;
  if (cursor) variables.cursor = cursor;
  else delete variables.cursor;
  variables.includePromotedContent = false;
  url.searchParams.set("variables", JSON.stringify(variables));
  return url.toString();
}

async function getCaptureStatus() {
  const stored = await chrome.storage.session.get(CAPTURED_KEY);
  const capture = stored[CAPTURED_KEY];
  return capture ? { ready: true, capturedAt: capture.capturedAt } : { ready: false };
}

async function fetchBookmarkPage(cursor) {
  const stored = await chrome.storage.session.get(CAPTURED_KEY);
  const capture = stored[CAPTURED_KEY];
  if (!capture) throw new Error("Open X bookmarks once so xShelf can observe a signed-in request.");
  const response = await fetch(buildPageUrl(capture.url, cursor), {
    method: "GET",
    headers: capture.headers,
    credentials: "include"
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("X returned a response xShelf could not read (HTTP " + response.status + ")."); }
  if (!response.ok) {
    const reset = response.headers.get("x-rate-limit-reset");
    const suffix = reset ? " Try again after " + new Date(Number(reset) * 1000).toLocaleTimeString() + "." : "";
    throw new Error("X sync failed (HTTP " + response.status + ")." + suffix);
  }
  return { data, rateRemaining: response.headers.get("x-rate-limit-remaining") };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const task = message?.type === "capture-status"
    ? getCaptureStatus()
    : message?.type === "fetch-bookmarks-page"
      ? fetchBookmarkPage(message.cursor || null)
      : null;
  if (!task) return false;
  task.then(result => sendResponse({ ok: true, ...result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
