import { categoryFromUrl } from "./lib/x-capture.js";

const APP_URL = chrome.runtime.getURL("app.html");
const CAPTURED_KEY = "xRequestTemplates";
const LEGACY_CAPTURED_KEY = "xBookmarkRequest";
const SAFE_HEADERS = new Set([
  "authorization",
  "x-csrf-token",
  "x-client-uuid",
  "x-client-transaction-id",
  "x-twitter-active-user",
  "x-twitter-auth-type",
  "x-twitter-client-language"
]);
let captureQueue = Promise.resolve();

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
    if (details.tabId < 0) return;
    const category = categoryFromUrl(details.url);
    if (!category) return;
    const headers = {};
    for (const header of details.requestHeaders || []) {
      const name = header.name.toLowerCase();
      if (SAFE_HEADERS.has(name) && header.value) headers[name] = header.value;
    }
    if (!headers.authorization || !headers["x-csrf-token"]) return;
    captureQueue = captureQueue.then(async () => {
      const stored = await chrome.storage.session.get(CAPTURED_KEY);
      const templates = stored[CAPTURED_KEY] || {};
      templates[category] = { url: details.url, headers, capturedAt: Date.now() };
      await chrome.storage.session.set({ [CAPTURED_KEY]: templates });
    });
  },
  { urls: ["https://x.com/i/api/graphql/*"] },
  ["requestHeaders", "extraHeaders"]
);

function buildPageUrl(templateUrl, cursor) {
  const url = new URL(templateUrl);
  const variables = JSON.parse(url.searchParams.get("variables") || "{}");
  variables.count = 20;
  if (cursor) variables.cursor = cursor;
  else delete variables.cursor;
  if ("includePromotedContent" in variables) variables.includePromotedContent = false;
  url.searchParams.set("variables", JSON.stringify(variables));
  return url.toString();
}

async function getTemplates() {
  const stored = await chrome.storage.session.get([CAPTURED_KEY, LEGACY_CAPTURED_KEY]);
  const templates = stored[CAPTURED_KEY] || {};
  if (!templates.bookmark && stored[LEGACY_CAPTURED_KEY]) templates.bookmark = stored[LEGACY_CAPTURED_KEY];
  return templates;
}

async function getCaptureStatus() {
  const templates = await getTemplates();
  const categories = Object.fromEntries(Object.entries(templates).map(([category, capture]) => [category, capture.capturedAt]));
  return { ready: Object.keys(categories).length > 0, categories };
}

async function fetchTimelinePage(category, cursor) {
  const templates = await getTemplates();
  const capture = templates[category];
  if (!capture) throw new Error("Open the matching X page once so xShelf can observe its signed-in request.");
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
    : message?.type === "fetch-timeline-page"
      ? fetchTimelinePage(message.category, message.cursor || null)
      : message?.type === "fetch-bookmarks-page"
        ? fetchTimelinePage("bookmark", message.cursor || null)
        : null;
  if (!task) return false;
  task.then(result => sendResponse({ ok: true, ...result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
