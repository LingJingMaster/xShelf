import { categoryFromUrl } from "./lib/x-capture.js";
import { extractPreviewImage, isAllowedPreviewUrl } from "./lib/link-preview.js";
import { extractScreenName, isScreenName, needsProfileUrl, profileUrl } from "./lib/profile-url.js";

const APP_URL = chrome.runtime.getURL("app.html");
const CAPTURED_KEY = "xRequestTemplates";
const LEGACY_CAPTURED_KEY = "xBookmarkRequest";
const PENDING_SYNC_KEY = "pendingSyncCapture";
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
      await completePendingCapture(category);
    });
  },
  { urls: ["https://x.com/i/api/graphql/*", "https://api.x.com/graphql/*", "https://api.x.com/i/api/graphql/*"] },
  ["requestHeaders", "extraHeaders"]
);

async function completePendingCapture(category) {
  const stored = await chrome.storage.session.get(PENDING_SYNC_KEY);
  const pending = stored[PENDING_SYNC_KEY];
  if (!pending || pending.captureCategory !== category) return;
  await chrome.storage.session.remove(PENDING_SYNC_KEY);
  try {
    await chrome.tabs.update(pending.appTabId, { active: true });
    const appTab = await chrome.tabs.get(pending.appTabId);
    if (appTab.windowId) await chrome.windows.update(appTab.windowId, { focused: true });
  } catch {}
  if (pending.xTabId !== pending.appTabId) {
    try { await chrome.tabs.remove(pending.xTabId); } catch {}
  }
  try {
    await chrome.runtime.sendMessage({
      type: "sync-capture-ready",
      category: pending.requestedCategory,
      captureCategory: category
    });
  } catch {}
}

async function rememberScreenName(value) {
  if (!isScreenName(value)) return null;
  await chrome.storage.session.set({ xScreenName: value });
  return value;
}

async function resolveScreenName() {
  const cached = (await chrome.storage.session.get("xScreenName")).xScreenName;
  if (isScreenName(cached)) return cached;
  const templates = await getTemplates();
  const capture = Object.values(templates).find(item => item?.headers?.authorization && item?.headers?.["x-csrf-token"]);
  if (capture) {
    try {
      const response = await fetch("https://x.com/i/api/1.1/account/settings.json", {
        credentials: "include",
        signal: AbortSignal.timeout(4000),
        headers: {
          accept: "application/json",
          authorization: capture.headers.authorization,
          "x-csrf-token": capture.headers["x-csrf-token"],
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": capture.headers["x-twitter-auth-type"] || "OAuth2Session"
        }
      });
      if (response.ok) {
        const data = await response.json();
        const name = await rememberScreenName(data.screen_name);
        if (name) return name;
      }
    } catch {}
  }
  try {
    const response = await fetch("https://x.com/home", { credentials: "include", signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const name = await rememberScreenName(extractScreenName(await response.text()));
      if (name) return name;
    }
  } catch {}
  return null;
}

async function readScreenNameFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const href = document.querySelector("a[data-testid='AppTabBar_Profile_Link'], a[aria-label='Profile'], a[aria-label='个人资料']")?.getAttribute("href") || "";
        const name = href.split("/").filter(Boolean)[0] || "";
        return /^[A-Za-z0-9_]{1,15}$/.test(name) ? name : "";
      }
    });
    return result?.result || "";
  } catch {
    return "";
  }
}

async function continuePendingProfile(screenName) {
  const pending = (await chrome.storage.session.get(PENDING_SYNC_KEY))[PENDING_SYNC_KEY];
  if (!pending?.awaitProfile) return;
  const url = profileUrl(pending.captureCategory, screenName);
  if (!url) return;
  pending.awaitProfile = false;
  await chrome.storage.session.set({ [PENDING_SYNC_KEY]: pending });
  await chrome.tabs.update(pending.xTabId, { url });
}

async function beginSyncCapture(message, sender) {
  const appTabId = sender.tab?.id;
  if (!appTabId) throw new Error("xShelf must be open in a browser tab.");
  let targetUrl = message.url;
  let awaitProfile = false;
  if (needsProfileUrl(message.category)) {
    const screenName = await resolveScreenName();
    targetUrl = screenName ? profileUrl(message.category, screenName) : "https://x.com/home";
    awaitProfile = !screenName;
  }
  const target = new URL(targetUrl);
  if (target.protocol !== "https:" || target.hostname !== "x.com") throw new Error("Invalid X sync page.");
  const previous = (await chrome.storage.session.get(PENDING_SYNC_KEY))[PENDING_SYNC_KEY];
  if (previous?.xTabId && previous.xTabId !== appTabId) {
    try { await chrome.tabs.remove(previous.xTabId); } catch {}
  }
  const xTab = await chrome.tabs.create({ url: "about:blank", active: true });
  await chrome.storage.session.set({
    [PENDING_SYNC_KEY]: {
      appTabId,
      xTabId: xTab.id,
      captureCategory: message.category,
      requestedCategory: message.requestedCategory || message.category,
      awaitProfile,
      startedAt: Date.now()
    }
  });
  await chrome.tabs.update(xTab.id, { url: target.toString() });
  return { opened: true, awaitProfile };
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const pending = (await chrome.storage.session.get(PENDING_SYNC_KEY))[PENDING_SYNC_KEY];
  if (!pending?.awaitProfile || pending.xTabId !== tabId) return;
  const name = await rememberScreenName(await readScreenNameFromTab(tabId));
  if (name) await continuePendingProfile(name);
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const stored = await chrome.storage.session.get(PENDING_SYNC_KEY);
  const pending = stored[PENDING_SYNC_KEY];
  if (!pending || pending.xTabId !== tabId) return;
  await chrome.storage.session.remove(PENDING_SYNC_KEY);
  try { await chrome.runtime.sendMessage({ type: "sync-capture-cancelled", category: pending.requestedCategory }); } catch {}
});

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

async function fetchImageData(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com") throw new Error("Only X image assets can be loaded.");
  const response = await fetch(url.toString(), { credentials: "omit" });
  if (!response.ok) throw new Error("Image returned HTTP " + response.status + ".");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error("Asset is not an image.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Image is too large to proxy.");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return { dataUrl: "data:" + contentType + ";base64," + btoa(binary) };
}

async function resolveLinkPreview(value) {
  if (!isAllowedPreviewUrl(value)) throw new Error("Only t.co and X links can be previewed.");
  const response = await fetch(value, { redirect: "follow", credentials: "include" });
  if (!response.ok) throw new Error("Preview page returned HTTP " + response.status + ".");
  if (!isAllowedPreviewUrl(response.url)) throw new Error("Preview redirected outside X.");
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("image/")) return { imageUrl: response.url, targetUrl: response.url };
  if (!contentType.includes("text/html")) return { imageUrl: null, targetUrl: response.url };
  const html = await response.text();
  return { imageUrl: extractPreviewImage(html), targetUrl: response.url };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "x-screen-name") {
    rememberScreenName(message.screenName).then(name => name && continuePendingProfile(name));
    return false;
  }
  const task = message?.type === "capture-status"
    ? getCaptureStatus()
    : message?.type === "begin-sync-capture"
      ? beginSyncCapture(message, sender)
      : message?.type === "resolve-link-preview"
      ? resolveLinkPreview(message.url)
      : message?.type === "fetch-image-data"
        ? fetchImageData(message.url)
        : message?.type === "fetch-timeline-page"
      ? fetchTimelinePage(message.category, message.cursor || null)
      : message?.type === "fetch-bookmarks-page"
        ? fetchTimelinePage("bookmark", message.cursor || null)
        : null;
  if (!task) return false;
  task.then(result => sendResponse({ ok: true, ...result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
