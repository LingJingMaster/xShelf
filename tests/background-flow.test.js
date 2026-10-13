import test from "node:test";
import assert from "node:assert/strict";

function makeChrome() {
  const session = {};
  const calls = { created: [], updated: [], removed: [], sent: [] };
  const listeners = {};
  const getKeys = keys => {
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter(key => key in session).map(key => [key, session[key]]));
  };
  const chrome = {
    runtime: {
      getURL: path => "chrome-extension://test/" + path,
      onMessage: { addListener: listener => { listeners.message = listener; } },
      sendMessage: async message => { calls.sent.push(message); }
    },
    action: { onClicked: { addListener: listener => { listeners.action = listener; } } },
    webRequest: { onBeforeSendHeaders: { addListener: listener => { listeners.request = listener; } } },
    tabs: {
      onRemoved: { addListener: listener => { listeners.removed = listener; } },
      query: async () => [],
      create: async options => { calls.created.push(options); return { id: 22, windowId: 2 }; },
      update: async (id, options) => { calls.updated.push([id, options]); return { id, windowId: id === 11 ? 1 : 2 }; },
      get: async id => ({ id, windowId: 1 }),
      remove: async id => { calls.removed.push(id); }
    },
    windows: { update: async () => {} },
    storage: {
      session: {
        get: async keys => getKeys(keys),
        set: async values => { Object.assign(session, values); },
        remove: async key => { delete session[key]; }
      }
    }
  };
  return { chrome, session, calls, listeners };
}

function sendToListener(listener, message, sender) {
  return new Promise(resolve => listener(message, sender, resolve));
}

test("opens the likes page, captures its request, and returns to xShelf", async () => {
  const harness = makeChrome();
  globalThis.chrome = harness.chrome;
  await import("../src/background.js?integrated-flow-test");

  const opened = await sendToListener(harness.listeners.message, {
    type: "begin-sync-capture",
    category: "like",
    requestedCategory: "like",
    url: "https://x.com/i/history/likes"
  }, { tab: { id: 11 } });

  assert.equal(opened.ok, true);
  assert.deepEqual(harness.calls.created, [{ url: "about:blank", active: true }]);
  assert.deepEqual(harness.calls.updated[0], [22, { url: "https://x.com/i/history/likes" }]);
  assert.equal(harness.session.pendingSyncCapture.appTabId, 11);

  harness.listeners.request({
    tabId: 22,
    url: "https://x.com/i/api/graphql/query-id/Likes?variables=%7B%7D",
    requestHeaders: [
      { name: "authorization", value: "Bearer test" },
      { name: "x-csrf-token", value: "csrf" }
    ]
  });
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(harness.session.xRequestTemplates.like.url.includes("/Likes?"), true);
  assert.equal("pendingSyncCapture" in harness.session, false);
  assert.deepEqual(harness.calls.updated.at(-1), [11, { active: true }]);
  assert.deepEqual(harness.calls.removed, [22]);
  assert.deepEqual(harness.calls.sent.at(-1), {
    type: "sync-capture-ready",
    category: "like",
    captureCategory: "like"
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    url: "https://x.com/readswithravi/status/2107321952050524605",
    headers: { get: name => name === "content-type" ? "text/html; charset=UTF-8" : null },
    text: async () => '<meta property="og:image" content="https://pbs.twimg.com/media/HT5z3VOWUAAzdyW?format=webp&amp;name=large">'
  });
  const preview = await sendToListener(harness.listeners.message, {
    type: "resolve-link-preview",
    url: "https://t.co/1EGqlEXEwS"
  }, { tab: { id: 11 } });
  globalThis.fetch = originalFetch;
  assert.equal(preview.ok, true);
  assert.equal(preview.imageUrl, "https://pbs.twimg.com/media/HT5z3VOWUAAzdyW?format=webp&name=large");

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: name => name === "content-type" ? "image/png" : null },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
  });
  const image = await sendToListener(harness.listeners.message, {
    type: "fetch-image-data",
    url: "https://pbs.twimg.com/media/example.png"
  }, { tab: { id: 11 } });
  globalThis.fetch = originalFetch;
  assert.equal(image.ok, true);
  assert.equal(image.dataUrl, "data:image/png;base64,iVBORw==");

  delete globalThis.chrome;
});

test("opens the signed-in user's separate post and reply pages", async () => {
  const harness = makeChrome();
  harness.session.xRequestTemplates = {
    bookmark: { headers: { authorization: "Bearer test", "x-csrf-token": "csrf" }, url: "https://x.com/i/api/graphql/id/Bookmarks" }
  };
  globalThis.chrome = harness.chrome;
  globalThis.fetch = async url => {
    assert.equal(url, "https://x.com/i/api/1.1/account/settings.json");
    return { ok: true, json: async () => ({ screen_name: "LingJingMaster" }) };
  };
  await import("../src/background.js?profile-routes");

  await sendToListener(harness.listeners.message, {
    type: "begin-sync-capture",
    category: "post",
    requestedCategory: "post",
    url: "https://x.com/home"
  }, { tab: { id: 11 } });
  assert.equal(harness.calls.updated.at(-1)[1].url, "https://x.com/LingJingMaster");

  await sendToListener(harness.listeners.message, {
    type: "begin-sync-capture",
    category: "reply",
    requestedCategory: "reply",
    url: "https://x.com/home"
  }, { tab: { id: 11 } });
  assert.equal(harness.calls.updated.at(-1)[1].url, "https://x.com/LingJingMaster/with_replies");
  delete globalThis.chrome;
  delete globalThis.fetch;
});
