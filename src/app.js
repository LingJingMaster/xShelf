import { clearAll, dumpDatabase, getAll, getSetting, putMany, remove, restoreDatabase, setSetting } from "./lib/db.js";
import { filterPosts } from "./lib/search.js";
import { rowsForExport, rowsToMarkdown } from "./lib/export.js";
import { isAllowedPreviewUrl } from "./lib/link-preview.js";
import { parseTimelineResponse } from "./lib/x-sync.js";
import { applyTagsToRows, rowTags } from "./lib/tags.js";

const $ = selector => document.querySelector(selector);
const CATEGORIES = {
  bookmark: { label: "书签", singular: "书签", store: "posts", openUrl: "https://x.com/i/bookmarks", instruction: "打开 X 书签页" },
  like: { label: "喜欢", singular: "喜欢", store: "posts", openUrl: "https://x.com/i/history/likes", instruction: "打开 X 的喜欢历史页" },
  post: { label: "推文", singular: "推文", store: "posts", openUrl: "https://x.com/home", instruction: "打开当前账号的 X 主页" },
  reply: { label: "回复", singular: "回复", store: "posts", openUrl: "https://x.com/home", instruction: "打开当前账号的 X 回复页" },
  following: { label: "正在关注", singular: "用户", store: "users", openUrl: "https://x.com/home", instruction: "打开当前账号正在关注的人" },
  blocked: { label: "已屏蔽", singular: "用户", store: "users", openUrl: "https://x.com/settings/blocked/all", instruction: "打开 X 的已屏蔽账号设置" }
};
const USER_CATEGORIES = new Set(["following", "blocked"]);
const state = {
  posts: [],
  users: [],
  category: "like",
  tag: "all",
  view: "compact",
  tags: [],
  selectedIds: new Set(),
  filters: { query: "", contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false },
  captureWaitId: 0,
  reconnects: {},
  syncReady: false,
  captureCategories: {},
  awaitingCapture: false,
  syncing: false,
  stopSync: false
};

const stage = $("#stage");
const toast = $("#toast");
const previewLoading = new Set();
const previewFailed = new Set();
const imageProxyRequests = new Map();
let toastTimer;
let editingTagRow = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function runtimeMessage(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) return Promise.resolve({ ok: true, ready: false });
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, error: "No response from extension background." });
    });
  });
}

function formatDate(seconds) {
  if (!seconds) return "日期未知";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(seconds * 1000));
}

function currentDataset() {
  return CATEGORIES[state.category].store === "users" ? state.users : state.posts;
}

function rowBelongsToCategory(row, category) {
  const storedCategory = row.category || "bookmark";
  if (category === "reply") return storedCategory === "reply" || (storedCategory === "post" && row.postType === "reply");
  if (category === "post") return storedCategory === "post" && row.postType !== "reply";
  return storedCategory === category;
}

function categoryRows() {
  return currentDataset().filter(row => rowBelongsToCategory(row, state.category));
}

function currentRows() {
  const filters = { ...state.filters, tag: state.tag };
  if (USER_CATEGORIES.has(state.category)) {
    filters.contentType = "all";
    filters.postType = "all";
  }
  return filterPosts(categoryRows(), filters);
}

function tagNames() {
  const values = new Set(state.tags);
  currentDataset().forEach(row => rowTags(row).forEach(tag => values.add(tag)));
  return [...values].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function openTagCreateDialog() {
  const form = $("#tagCreateForm");
  form.reset();
  $("#tagCreateError").textContent = "";
  $("#tagCreateDialog").showModal();
  requestAnimationFrame(() => form.elements.name.focus());
}

async function createTag(name) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const error = $("#tagCreateError");
  if (!normalized) {
    error.textContent = "请输入标签名称。";
    return false;
  }
  if (normalized.length > 24) {
    error.textContent = "名称最多 24 个字符。";
    return false;
  }
  if (["all", "untagged", "全部", "无标签"].includes(normalized.toLowerCase())) {
    error.textContent = "这个名称由 xShelf 保留，请换一个。";
    return false;
  }
  if (tagNames().some(tag => tag.toLocaleLowerCase("zh-CN") === normalized.toLocaleLowerCase("zh-CN"))) {
    error.textContent = "这个标签已经存在。";
    return false;
  }
  state.tags.push(normalized);
  await setSetting("tags", state.tags);
  render();
  showToast("标签已创建。现在可以添加到内容。");
  return true;
}

async function updateTagEverywhere(oldTag, nextTag = null) {
  const updateRows = rows => rows.map(row => {
    if (!rowTags(row).includes(oldTag)) return row;
    const tags = rowTags(row).filter(tag => tag !== oldTag);
    if (nextTag) tags.push(nextTag);
    return { ...row, tags: [...new Set(tags)] };
  });
  const nextPosts = updateRows(state.posts);
  const nextUsers = updateRows(state.users);
  const changedPosts = nextPosts.filter((row, index) => row !== state.posts[index]);
  const changedUsers = nextUsers.filter((row, index) => row !== state.users[index]);
  await Promise.all([putMany("posts", changedPosts), putMany("users", changedUsers)]);
  state.posts = nextPosts;
  state.users = nextUsers;
  state.tags = tagNames().filter(tag => tag !== oldTag);
  if (nextTag) state.tags.push(nextTag);
  state.tags = [...new Set(state.tags)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  await setSetting("tags", state.tags);
  if (state.tag === oldTag) state.tag = nextTag || "all";
}

function renderTagManager() {
  const list = $("#tagManagerList");
  list.replaceChildren();
  const names = tagNames();
  if (!names.length) {
    list.append(element("p", { className: "tag-choice-empty", text: "还没有标签。" }));
    return;
  }
  names.forEach(tag => {
    const input = element("input", { type: "text", value: tag, maxlength: "24", "aria-label": "标签名称" });
    const rename = element("button", { className: "quiet-button", type: "button", text: "重命名", onclick: async () => {
      const next = input.value.trim().replace(/\s+/g, " ");
      if (!next || next === tag) return;
      if (tagNames().some(name => name !== tag && name.toLocaleLowerCase("zh-CN") === next.toLocaleLowerCase("zh-CN"))) {
        showToast("这个标签已经存在。");
        return;
      }
      await updateTagEverywhere(tag, next);
      renderTagManager();
      render();
      showToast("标签已重命名。");
    }});
    const removeTag = element("button", { className: "tag-manager-delete", type: "button", text: "删除", onclick: async () => {
      await updateTagEverywhere(tag);
      renderTagManager();
      render();
      showToast("标签已删除，内容记录仍然保留。");
    }});
    list.append(element("div", { className: "tag-manager-row" }, [input, rename, removeTag]));
  });
}

function openTagManager() {
  renderTagManager();
  $("#manageTagsDialog").showModal();
}

function renderTags() {
  const list = $("#tagList");
  const rows = categoryRows();
  list.replaceChildren(element("button", {
    className: "tag-item" + (state.tag === "all" ? " active" : ""),
    onclick: () => selectTag("all")
  }, [element("span", { text: "全部" }), element("small", { text: String(rows.length) })]));
  const untaggedCount = rows.filter(row => rowTags(row).length === 0).length;
  list.append(element("button", {
    className: "tag-item" + (state.tag === "untagged" ? " active" : ""),
    onclick: () => selectTag("untagged")
  }, [element("span", { text: "无标签" }), element("small", { text: String(untaggedCount) })]));
  for (const tag of tagNames()) {
    const count = rows.filter(row => rowTags(row).includes(tag)).length;
    list.append(element("button", {
      className: "tag-item" + (state.tag === tag ? " active" : ""),
      onclick: () => selectTag(tag)
    }, [element("span", { text: tag }), element("small", { text: String(count) })]));
  }
}

function selectTag(tag) {
  state.tag = tag;
  state.selectedIds.clear();
  $("#app").classList.remove("nav-open");
  render();
}

async function proxyImageUrl(url) {
  if (!imageProxyRequests.has(url)) {
    imageProxyRequests.set(url, runtimeMessage({ type: "fetch-image-data", url }).finally(() => imageProxyRequests.delete(url)));
  }
  const response = await imageProxyRequests.get(url);
  return response?.ok ? response.dataUrl : null;
}

function loadImage(image, url, onFailure) {
  let triedProxy = false;
  image.addEventListener("error", async () => {
    if (triedProxy) {
      onFailure?.();
      return;
    }
    triedProxy = true;
    const dataUrl = await proxyImageUrl(url);
    if (dataUrl) image.src = dataUrl;
    else onFailure?.();
  });
  image.src = url;
}

function makeAvatar(post) {
  const avatar = element("div", { className: "avatar" });
  if (post.avatarUrl) {
    const image = element("img", { alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    loadImage(image, post.avatarUrl, () => {
      image.remove();
      avatar.textContent = (post.authorName || "?").slice(0, 1);
    });
    avatar.append(image);
  } else {
    avatar.textContent = (post.authorName || "?").slice(0, 1);
  }
  return avatar;
}

function previewRank(value) {
  if (/\/(?:photo|video)\/|pic\.twitter\.com|pbs\.twimg\.com/.test(value)) return 3;
  if (/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(value) || value.includes("t.co/")) return 2;
  return 0;
}

function previewCandidates(row) {
  const best = new Map();
  const add = (url, rank) => {
    if (!isAllowedPreviewUrl(url)) return;
    best.set(url, Math.max(best.get(url) || 0, rank));
  };
  for (const link of row.links || []) {
    const target = link.expandedUrl && link.expandedUrl !== link.url ? link.expandedUrl : link.url;
    add(link.url, previewRank(target || link.url));
    add(link.expandedUrl, previewRank(link.expandedUrl || ""));
  }
  for (const match of (row.text || "").matchAll(/https:\/\/t\.co\/[A-Za-z0-9]+/g)) add(match[0], 1);
  if ((row.contentTypes || []).includes("article") && /\/status\/\d+/.test(row.url || "")) add(row.url, 4);
  return [...best].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([url]) => url);
}

function displayMedia(row) {
  return (row.media || []).find(item => item?.url && !item.url.includes("/profile_images/") && !item.url.includes("/profile_banners/"));
}

async function hydrateLinkPreview(row) {
  if (displayMedia(row) || previewLoading.has(row.id) || previewFailed.has(row.id)) return;
  const candidates = previewCandidates(row);
  if (!candidates.length) return;
  previewLoading.add(row.id);
  let imageUrl = null;
  let targetUrl = null;
  for (const url of candidates) {
    const response = await runtimeMessage({ type: "resolve-link-preview", url });
    if (response?.imageUrl) {
      imageUrl = response.imageUrl;
      targetUrl = response.targetUrl;
      break;
    }
  }
  previewLoading.delete(row.id);
  if (!imageUrl) {
    previewFailed.add(row.id);
    if (state.view === "gallery" || state.view === "compact") render();
    return;
  }
  row.media = [{ type: "photo", url: imageUrl, alt: "" }];
  row.contentTypes = [...new Set([...(row.contentTypes || []), "image"])];
  if (targetUrl) row.linkTargetUrl = targetUrl;
  await putMany("posts", [row]);
  if (state.view === "gallery" || state.view === "compact") render();
}

function mediaCell(row, compact = false) {
  const className = compact ? "compact-media" : "media-preview";
  const media = displayMedia(row);
  if (media?.url) {
    const image = element("img", { alt: media.alt || "", loading: "lazy", referrerpolicy: "no-referrer" });
    loadImage(image, media.url, () => image.closest("." + className)?.classList.add("media-error"));
    return element("a", { className, href: row.url || media.url, target: "_blank", rel: "noreferrer" }, [image]);
  }
  const hasPreviewLink = previewCandidates(row).length > 0;
  if (hasPreviewLink && !previewFailed.has(row.id)) {
    hydrateLinkPreview(row);
    return element("div", { className: className + " media-loading", text: compact ? "读取中…" : "正在读取链接预览…" });
  }
  return element("div", { className: className + " media-empty", text: "—" });
}

function renderTagChoices(container, selected = []) {
  const selectedSet = new Set(selected);
  container.replaceChildren();
  const names = tagNames();
  if (!names.length) {
    container.append(element("p", { className: "tag-choice-empty", text: "还没有标签。先在侧栏新建一个标签。" }));
    return;
  }
  names.forEach(tag => {
    const input = element("input", { type: "checkbox", value: tag });
    input.checked = selectedSet.has(tag);
    container.append(element("label", { className: "tag-choice" }, [input, element("span", { text: tag })]));
  });
}

function checkedTags(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function openEditTagsDialog(row) {
  editingTagRow = row;
  renderTagChoices($("#editTagChoices"), rowTags(row));
  $("#editTagsDialog").showModal();
}

function openBatchTagsDialog() {
  if (!state.selectedIds.size) return;
  renderTagChoices($("#batchTagChoices"));
  $("#batchTagCopy").textContent = "将修改已选择的 " + state.selectedIds.size + " 条内容。";
  $("#addBatchTags").disabled = true;
  $("#removeBatchTags").disabled = true;
  $("#batchTagsDialog").showModal();
}

function openDeleteDialog() {
  if (!state.selectedIds.size) return;
  $("#deleteSelectedCopy").textContent = "将从 xShelf 本地永久删除已选择的 " + state.selectedIds.size + " 条内容。X 上的原始内容不会变化。";
  $("#deleteDialog").showModal();
}

function updateSelectionUi(rows = currentRows()) {
  const visibleIds = rows.map(row => row.id);
  const selectedVisible = visibleIds.filter(id => state.selectedIds.has(id)).length;
  const button = $("#deleteSelected");
  const batchTagButton = $("#batchTagButton");
  const exportButton = $("#exportButton");
  button.disabled = state.selectedIds.size === 0;
  batchTagButton.disabled = state.selectedIds.size === 0;
  button.textContent = state.selectedIds.size ? "删除 " + state.selectedIds.size : "删除";
  batchTagButton.textContent = state.selectedIds.size ? "批量标签 " + state.selectedIds.size : "批量标签";
  exportButton.textContent = state.selectedIds.size ? "导出 " + state.selectedIds.size : "导出";
  const master = $("#selectAll");
  if (master) {
    master.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    master.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }
}

function selectionCheckbox(row) {
  const input = element("input", {
    className: "row-select",
    type: "checkbox",
    "aria-label": "选择这条内容"
  });
  input.checked = state.selectedIds.has(row.id);
  input.addEventListener("change", () => {
    if (input.checked) state.selectedIds.add(row.id);
    else state.selectedIds.delete(row.id);
    input.closest(".bookmark-card")?.classList.toggle("selected", input.checked);
    updateSelectionUi();
  });
  return input;
}

function tagEditor(row) {
  const tags = rowTags(row);
  const children = tags.length
    ? tags.map(tag => element("span", { className: "tag-chip", text: tag }))
    : [element("span", { className: "tag-empty", text: "无标签" })];
  children.push(element("span", { className: "tag-edit-mark", text: "编辑" }));
  return element("button", {
    className: "tag-editor",
    type: "button",
    "aria-label": "编辑标签",
    onclick: () => openEditTagsDialog(row)
  }, children);
}

function makeCard(row) {
  const isUser = USER_CATEGORIES.has(state.category);
  const authorCopy = element("div", { className: "author-copy" }, [
    element("b", { text: row.authorName || "Unknown" }),
    element("span", { text: row.authorHandle || "" })
  ]);
  const deleteButton = element("button", {
    className: "card-menu",
    title: "仅从本地删除",
    "aria-label": "仅从本地删除",
    text: "×",
    onclick: () => {
      state.selectedIds.clear();
      state.selectedIds.add(row.id);
      updateSelectionUi();
      openDeleteDialog();
    }
  });
  const checkbox = selectionCheckbox(row);
  const author = element("div", { className: "author" }, [state.view === "compact" ? null : checkbox, makeAvatar(row), authorCopy, deleteButton].filter(Boolean));
  const textLink = element("a", { className: "bookmark-text", href: row.url || "#", target: "_blank", rel: "noreferrer" });
  textLink.textContent = isUser ? (row.description || "（没有个人简介）") : (row.text || row.articleTitle || "（没有可显示的正文）");
  textLink.style.color = "inherit";
  textLink.style.textDecoration = "none";

  const tags = tagEditor(row);
  const detail = isUser ? (row.followersCount || 0).toLocaleString() + " 关注者" : (row.contentTypes?.join(" / ") || "");
  const foot = element("div", { className: "card-foot" }, [
    element("span", { text: formatDate(row.createdAt) }),
    element("span", { text: detail }),
    tags
  ]);
  if (state.view === "compact") {
    const tagCell = element("div", { className: "compact-tags" }, [tags, element("small", { text: formatDate(row.createdAt) })]);
    return element("article", { className: "bookmark-card" + (state.selectedIds.has(row.id) ? " selected" : "") }, [checkbox, author, tagCell, textLink, isUser ? element("div", { className: "compact-media media-empty", text: "—" }) : mediaCell(row, true)]);
  }
  const children = [author];
  const textOnly = !displayMedia(row);
  if (state.view === "gallery" && !textOnly) children.push(mediaCell(row));
  children.push(textLink, foot);
  return element("article", { className: (state.view === "gallery" && textOnly ? "bookmark-card text-only" : "bookmark-card") + (state.selectedIds.has(row.id) ? " selected" : "") }, children);
}

function renderStats(rows) {
  const counts = new Map();
  rows.forEach(row => {
    const tags = rowTags(row);
    if (!tags.length) counts.set("无标签", (counts.get("无标签") || 0) + 1);
    tags.forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  const max = Math.max(1, ...counts.values());
  const bars = element("div");
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    bars.append(element("div", { className: "bar-row" }, [
      element("span", { text: name }),
      element("div", { className: "bar-track" }, [element("div", { className: "bar-fill", style: "width:" + (count / max * 100) + "%" })]),
      element("span", { text: String(count) })
    ]));
  });
  const people = new Set(rows.map(row => row.authorHandle).filter(Boolean)).size;
  const unit = USER_CATEGORIES.has(state.category) ? "位用户" : "条内容";
  stage.append(element("div", { className: "stats-board" }, [
    element("section", { className: "stat-panel" }, [element("div", { className: "big-number", text: String(rows.length) }), element("p", { text: "当前范围内的" + unit }), element("div", { className: "big-number", text: String(people) }), element("p", { text: USER_CATEGORIES.has(state.category) ? "个账号" : "位作者" })]),
    element("section", { className: "stat-panel" }, [element("p", { text: "标签分布" }), bars])
  ]));
}

function renderEmpty(hasAnyRows) {
  const config = CATEGORIES[state.category];
  const title = hasAnyRows ? "没有找到符合条件的内容" : config.label + "还是空的";
  const copy = hasAnyRows ? "换个关键词，或清除筛选条件后再看看。" : "点击下方按钮后，xShelf 会打开对应的 X 页面；识别到列表请求后会自动返回并开始同步。";
  const action = element("button", { className: "ink-button", text: hasAnyRows ? "清除搜索和筛选" : config.instruction, onclick: () => {
    if (hasAnyRows) {
      state.filters = { query: "", contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false };
      $("#searchInput").value = "";
      $("#filterForm").reset();
      render();
    } else requestSync();
  }});
  stage.append(element("div", { className: "empty-state" }, [element("div", { className: "empty-mark" }), element("h2", { text: title }), element("p", { text: copy }), action]));
}

function render() {
  renderTags();
  const rows = currentRows();
  document.querySelectorAll("[data-count]").forEach(node => {
    const category = node.dataset.count;
    const source = CATEGORIES[category].store === "users" ? state.users : state.posts;
    node.textContent = String(source.filter(row => rowBelongsToCategory(row, category)).length);
  });
  document.querySelectorAll("[data-category]").forEach(node => node.classList.toggle("active", node.dataset.category === state.category));
  const postOnlyFilters = USER_CATEGORIES.has(state.category) ? [] : [state.filters.contentType !== "all", state.filters.postType !== "all"];
  const activeFilters = [...postOnlyFilters, state.filters.startDate, state.filters.endDate, state.filters.oldest].filter(Boolean).length;
  $("#filterCount").textContent = activeFilters ? String(activeFilters) : "";
  stage.className = state.view === "compact" ? "card-grid compact" : state.view === "gallery" ? "card-grid gallery" : "card-grid";
  stage.replaceChildren();
  if (!rows.length) renderEmpty(categoryRows().length > 0);
  else if (state.view === "stats") renderStats(rows);
  else {
    if (state.view === "compact") {
      const selectAll = element("input", { id: "selectAll", className: "row-select", type: "checkbox", "aria-label": "选择当前范围的全部内容" });
      selectAll.addEventListener("change", () => {
        rows.forEach(row => selectAll.checked ? state.selectedIds.add(row.id) : state.selectedIds.delete(row.id));
        render();
      });
      stage.append(element("div", { className: "compact-header" }, [
        selectAll,
        element("span", { text: "用户" }),
        element("span", { text: "标签" }),
        element("span", { text: USER_CATEGORIES.has(state.category) ? "简介" : "内容" }),
        element("span", { text: USER_CATEGORIES.has(state.category) ? "" : "媒体" })
      ]));
    }
    rows.forEach(row => stage.append(makeCard(row)));
  }
  updateSelectionUi(rows);
}

async function refreshCaptureStatus() {
  const response = await runtimeMessage({ type: "capture-status" });
  state.captureCategories = response?.categories || {};
  const captureCategory = CATEGORIES[state.category].syncCategory || state.category;
  state.syncReady = Boolean(response?.ok && state.captureCategories[captureCategory]);
  $("#syncLight").classList.toggle("ready", state.syncReady);
  if (!state.syncing && !state.awaitingCapture) {
    $("#syncLabel").textContent = state.syncReady ? "同步" + CATEGORIES[state.category].label : "连接 " + CATEGORIES[state.category].label;
    $("#syncMeta").textContent = state.syncReady ? "已识别该列表请求" : CATEGORIES[state.category].instruction;
  }
}

function requestSync() {
  state.reconnects[state.category] = 0;
  return syncCategory();
}

async function syncCategory(categoryOverride = state.category) {
  const category = typeof categoryOverride === "string" ? categoryOverride : state.category;
  if (state.awaitingCapture) {
    showToast("正在等待 X 页面加载对应列表。");
    return;
  }
  if (state.syncing) {
    state.stopSync = true;
    $("#syncMeta").textContent = "将在本页结束后停止";
    return;
  }
  await refreshCaptureStatus();
  const config = CATEGORIES[category];
  const captureCategory = config.syncCategory || category;
  if (!state.captureCategories[captureCategory]) {
    if ((state.reconnects[category] || 0) >= 1) {
      state.awaitingCapture = false;
      $("#syncLight").classList.remove("busy");
      showToast("X 页面已打开，但没有拿到可用的列表请求。请停一下再试。");
      return;
    }
    state.reconnects[category] = (state.reconnects[category] || 0) + 1;
    state.awaitingCapture = true;
    const waitId = ++state.captureWaitId;
    setTimeout(() => {
      if (state.captureWaitId !== waitId || !state.awaitingCapture) return;
      state.awaitingCapture = false;
      $("#syncLight").classList.remove("busy");
      refreshCaptureStatus();
      showToast("没有识别到对应的 X 列表请求。请确认已经登录 X，然后重试。");
    }, 30000);
    $("#syncLight").classList.add("busy");
    $("#syncLabel").textContent = "正在连接" + config.label;
    $("#syncMeta").textContent = "捕获成功后会自动返回并同步";
    const response = await runtimeMessage({
      type: "begin-sync-capture",
      category: captureCategory,
      requestedCategory: category,
      url: config.openUrl
    });
    if (!response?.ok) {
      state.awaitingCapture = false;
      $("#syncLight").classList.remove("busy");
      await refreshCaptureStatus();
      showToast(response?.error || "无法打开 X 同步页面。");
    }
    return;
  }
  state.reconnects[category] = 0;
  state.syncing = true;
  state.stopSync = false;
  $("#syncLight").classList.add("busy");
  $("#syncLabel").textContent = "停止同步";
  const collection = config.store === "users" ? state.users : state.posts;
  const known = new Map(collection.filter(row => (row.category || "bookmark") === captureCategory).map(row => [row.id, row]));
  let cursor = null;
  const seenCursors = new Set();
  let added = 0;
  let pages = 0;
  try {
    const pageLimit = USER_CATEGORIES.has(category) ? 200 : 50;
    while (!state.stopSync && pages < pageLimit) {
      $("#syncMeta").textContent = "正在读取第 " + (pages + 1) + " 页";
      const response = await runtimeMessage({ type: "fetch-timeline-page", category: captureCategory, cursor });
      if (!response?.ok) throw new Error(response?.error || "同步失败");
      const parsed = parseTimelineResponse(response.data, captureCategory);
      const legacyReplies = captureCategory === "reply"
        ? collection.filter(row => (row.category || "bookmark") === "post" && row.postType === "reply" && parsed.rows.some(item => item.tweetId === row.tweetId))
        : [];
      if (legacyReplies.length) {
        await Promise.all(legacyReplies.map(row => remove("posts", row.id)));
        legacyReplies.forEach(row => collection.splice(collection.indexOf(row), 1));
      }
      const newOnPage = parsed.rows.filter(row => !known.has(row.id) && !legacyReplies.some(item => item.tweetId === row.tweetId)).length;
      const merged = parsed.rows.map(row => {
        const old = known.get(row.id) || legacyReplies.find(item => item.tweetId === row.tweetId);
        return old ? { ...row, tags: rowTags(old), savedAt: old.savedAt || old.bookmarkedAt || row.savedAt } : row;
      });
      await putMany(config.store, merged);
      merged.forEach(row => known.set(row.id, row));
      added += newOnPage;
      pages += 1;
      state[config.store] = [
        ...collection.filter(row => (row.category || "bookmark") !== captureCategory),
        ...known.values()
      ];
      render();
      const noMoreUsers = USER_CATEGORIES.has(category) && newOnPage === 0;
      const noMorePosts = !USER_CATEGORIES.has(category) && pages > 1 && newOnPage < 10;
      if (!parsed.cursor || seenCursors.has(parsed.cursor) || !parsed.rows.length || noMoreUsers || noMorePosts) break;
      seenCursors.add(parsed.cursor);
      cursor = parsed.cursor;
    }
    showToast(CATEGORIES[category].label + "同步完成：新增 " + added + " 条，读取 " + pages + " 页。");
  } catch (error) {
    showToast(error.message);
  } finally {
    state.syncing = false;
    $("#syncLight").classList.remove("busy");
    await refreshCaptureStatus();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = element("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRows(format) {
  const rows = rowsForExport(currentRows(), categoryRows(), state.selectedIds);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), "xshelf-" + stamp + ".json");
  } else if (format === "markdown") {
    const title = "xShelf · " + CATEGORIES[state.category].label + (state.tag === "all" ? "" : " · " + (state.tag === "untagged" ? "无标签" : state.tag));
    const markdown = rowsToMarkdown(rows, { title });
    downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), "xshelf-" + state.category + "-" + stamp + ".md");
  } else if (format === "csv") {
    const columns = USER_CATEGORIES.has(state.category)
      ? ["userId", "authorName", "authorHandle", "description", "followersCount", "followingCount", "postCount", "createdAt", "tags", "url"]
      : ["tweetId", "authorName", "authorHandle", "text", "createdAt", "tags", "url"];
    const quote = value => '"' + String(value ?? "").replaceAll('"', '""').replaceAll("\n", "\\n") + '"';
    const csv = "\ufeff" + [columns.join(","), ...rows.map(row => columns.map(key => quote(row[key])).join(","))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "xshelf-" + stamp + ".csv");
  } else {
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const cards = rows.map(row => '<article><p>' + escape(row.text || row.description) + '</p><small>' + escape(row.authorName) + ' ' + escape(row.authorHandle) + ' · ' + escape(rowTags(row).join("、") || "无标签") + '</small><a href="' + escape(row.url) + '">在 X 查看</a></article>').join("");
    const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>xShelf export</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;background:#e5e7e3;color:#18201b;font:16px Georgia,serif}h1{font-size:42px}article{margin:12px 0;padding:20px;background:#fafaf7;border:1px solid #ccd1cc;border-radius:10px}small{color:#68726b}a{display:block;margin-top:14px;color:#146b50}</style><h1>xShelf</h1>' + cards;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "xshelf-" + stamp + ".html");
  }
  $("#exportDialog").close();
  showToast("已导出 " + rows.length + " 条记录。");
}

async function createBackup() {
  const data = await dumpDatabase();
  const files = {};
  for (const [name, rows] of Object.entries(data)) {
    files[name + ".jsonl"] = new TextEncoder().encode(rows.map(row => JSON.stringify(row)).join("\n"));
  }
  const zipped = globalThis.fflate.zipSync(files, { level: 9 });
  downloadBlob(new Blob([zipped], { type: "application/zip" }), "xshelf-backup-" + new Date().toISOString().replaceAll(":", "-").slice(0, 19) + ".zip");
  $("#backupDialog").close();
  showToast("备份已下载。ZIP 内是未加密的 JSONL。");
}

function normalizeImported(row, index) {
  const source = row?._data ? { ...row._data, ...row } : row;
  const requestedCategory = source.category || state.category;
  const category = requestedCategory === "reply" ? "post" : requestedCategory;
  const recordId = source.tweetId || source.userId || source.rest_id || source.id_str || String(source.id || index).split("_").at(-1);
  const user = source.user || source.core?.user_results?.result?.legacy || {};
  const handle = source.authorHandle || source.screen_name || user.screen_name || "";
  const screenName = String(handle).replace(/^@/, "");
  const created = source.createdAt ?? source.created_at;
  const isUser = USER_CATEGORIES.has(category);
  return {
    id: String(source.id || category + "_" + recordId),
    category,
    ...(isUser ? { userId: String(source.userId || source.user_id || recordId) } : { tweetId: String(recordId) }),
    text: source.text || source.full_text || source.note_tweet?.text || "",
    description: source.description || user.description || "",
    authorId: String(source.authorId || source.user_id || ""),
    authorName: source.authorName || source.name || user.name || "Unknown",
    authorHandle: handle ? (String(handle).startsWith("@") ? String(handle) : "@" + handle) : "",
    avatarUrl: source.avatarUrl || source.profile_image_url_https || user.profile_image_url_https || "",
    createdAt: typeof created === "number" ? (created > 1e12 ? Math.floor(created / 1000) : created) : Math.floor(Date.parse(created || 0) / 1000) || 0,
    savedAt: source.savedAt || source.bookmarkedAt || Math.floor(Date.now() / 1000),
    tags: Array.isArray(source.tags) ? source.tags : [],
    followersCount: source.followersCount || source.followers_count || 0,
    followingCount: source.followingCount || source.friends_count || 0,
    postCount: source.postCount || source.statuses_count || 0,
    canDm: Boolean(source.canDm ?? source.can_dm),
    isProtected: Boolean(source.isProtected ?? source.protected),
    contentTypes: source.contentTypes || [],
    postType: source.postType || (requestedCategory === "reply" ? "reply" : "post"),
    articleTitle: source.articleTitle || source.article?.title || "",
    articlePreview: source.articlePreview || source.article?.preview_text || "",
    url: source.url || (isUser ? "https://x.com/" + screenName : (screenName ? "https://x.com/" + screenName + "/status/" + recordId : "https://x.com/i/status/" + recordId)),
    media: source.media || []
  };
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function readArchive(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const archive = globalThis.fflate.unzipSync(bytes);
  const data = {};
  for (const [path, content] of Object.entries(archive)) {
    const name = path.split("/").at(-1).replace(/\.jsonl$/, "");
    if (["posts", "users", "settings"].includes(name)) data[name] = parseJsonLines(new TextDecoder().decode(content));
  }
  return data;
}

async function importFile(file, backupMode = false) {
  try {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const data = await readArchive(file);
      await restoreDatabase(data, false);
      showToast("备份已合并到本地资料库。");
    } else {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".jsonl") ? parseJsonLines(text) : JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : parsed.posts || [];
      const normalized = rows.map(normalizeImported);
      const userRows = normalized.filter(row => USER_CATEGORIES.has(row.category));
      const postRows = normalized.filter(row => !USER_CATEGORIES.has(row.category));
      await putMany("posts", postRows);
      await putMany("users", userRows);
      showToast("已导入 " + rows.length + " 条记录。");
    }
    state.posts = await getAll("posts");
    state.users = await getAll("users");
    state.tags = await getSetting("tags", []);
    render();
    if (backupMode) $("#backupDialog").close();
  } catch (error) {
    showToast("无法导入：" + error.message);
  }
}

function handleRuntimeMessage(message) {
  if (message?.type === "sync-capture-ready") {
    state.captureWaitId += 1;
    state.awaitingCapture = false;
    $("#syncLight").classList.remove("busy");
    state.category = message.category || state.category;
    state.tag = "all";
    render();
    refreshCaptureStatus().then(() => syncCategory(state.category));
  }
  if (message?.type === "sync-capture-cancelled") {
    state.captureWaitId += 1;
    state.awaitingCapture = false;
    $("#syncLight").classList.remove("busy");
    refreshCaptureStatus();
    showToast("X 页面已关闭，本次连接已取消。");
  }
}

function applyTheme() {
  const stored = localStorage.getItem("xshelf-theme");
  const theme = stored === "dark" ? "dark" : "light";
  if (stored && stored !== "light" && stored !== "dark") localStorage.setItem("xshelf-theme", "light");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const button = $("#themeButton");
  if (!button) return;
  const dark = theme === "dark";
  button.textContent = dark ? "深色模式：开" : "深色模式：关";
  button.setAttribute("aria-pressed", String(dark));
}

function bindTheme() {
  applyTheme();
  $("#themeButton").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("xshelf-theme", next);
    applyTheme();
  };
}

function bindStickyBars() {
  const topbar = $(".topbar");
  const updateHeight = () => {
    document.documentElement.style.setProperty("--topbar-sticky-height", Math.ceil(topbar.getBoundingClientRect().height) + "px");
  };
  updateHeight();
  new ResizeObserver(updateHeight).observe(topbar);
}

function resetClearDialog() {
  $("#clearWarning").hidden = false;
  $("#clearFinal").hidden = true;
  $("#confirmClear").textContent = "我已了解风险";
  $("#confirmClear").dataset.step = "warn";
}

async function bindClearData() {
  resetClearDialog();
  $("#clearButton").onclick = () => {
    resetClearDialog();
    $("#clearDialog").showModal();
  };
  $("#confirmClear").onclick = async () => {
    if ($("#confirmClear").dataset.step !== "final") {
      $("#clearWarning").hidden = true;
      $("#clearFinal").hidden = false;
      $("#confirmClear").textContent = "确认清空";
      $("#confirmClear").dataset.step = "final";
      return;
    }
    await clearAll();
    state.posts = [];
    state.users = [];
    state.tags = [];
    state.selectedIds.clear();
    state.category = "like";
    state.tag = "all";
    $("#clearDialog").close();
    resetClearDialog();
    render();
    showToast("本地资料已全部清空。");
  };
}

function bindEvents() {
  $("#openNav").onclick = () => $("#app").classList.add("nav-open");
  $("#closeNav").onclick = () => $("#app").classList.remove("nav-open");
  $("#syncButton").onclick = () => requestSync();
  if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.tag = "all";
    state.selectedIds.clear();
    $("#app").classList.remove("nav-open");
    render();
    await refreshCaptureStatus();
  });
  $("#searchInput").addEventListener("input", event => { state.filters.query = event.target.value; render(); });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      $("#searchInput").focus();
    }
  });
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => {
    state.view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    render();
  });
  $("#filterButton").onclick = () => $("#filterDialog").showModal();
  $("#batchTagButton").onclick = openBatchTagsDialog;
  $("#batchTagChoices").addEventListener("change", () => {
    const hasTags = checkedTags($("#batchTagChoices")).length > 0;
    $("#addBatchTags").disabled = !hasTags;
    $("#removeBatchTags").disabled = !hasTags;
  });
  const applyBatchTags = async mode => {
    const selectedTags = checkedTags($("#batchTagChoices"));
    const ids = new Set(state.selectedIds);
    if (!selectedTags.length || !ids.size) return;
    const store = CATEGORIES[state.category].store;
    const nextRows = applyTagsToRows(state[store], ids, selectedTags, mode);
    const updated = nextRows.filter((row, index) => row !== state[store][index]);
    await putMany(store, updated);
    state[store] = nextRows;
    state.selectedIds.clear();
    $("#batchTagsDialog").close();
    render();
    showToast("已为 " + updated.length + " 条内容" + (mode === "add" ? "添加" : "移除") + "标签。");
  };
  $("#addBatchTags").onclick = () => applyBatchTags("add");
  $("#removeBatchTags").onclick = () => applyBatchTags("remove");
  $("#saveTags").onclick = async () => {
    if (!editingTagRow) return;
    editingTagRow.tags = checkedTags($("#editTagChoices"));
    await putMany(CATEGORIES[state.category].store, [editingTagRow]);
    editingTagRow = null;
    $("#editTagsDialog").close();
    render();
    showToast("标签已保存。");
  };
  $("#deleteSelected").onclick = openDeleteDialog;
  $("#confirmDeleteSelected").onclick = async () => {
    const ids = [...state.selectedIds];
    if (!ids.length) return;
    const store = CATEGORIES[state.category].store;
    await Promise.all(ids.map(id => remove(store, id)));
    state[store] = state[store].filter(row => !state.selectedIds.has(row.id));
    state.selectedIds.clear();
    $("#deleteDialog").close();
    render();
    showToast("已从本地删除 " + ids.length + " 条内容。");
  };
  $("#filterForm").addEventListener("submit", event => {
    if (event.submitter?.value !== "apply") return;
    const data = new FormData(event.currentTarget);
    state.filters = { ...state.filters, contentType: data.get("contentType"), postType: data.get("postType"), startDate: data.get("startDate"), endDate: data.get("endDate"), oldest: data.get("oldest") === "on" };
    render();
  });
  $("#clearFilters").onclick = () => { $("#filterForm").reset(); state.filters = { ...state.filters, contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false }; render(); };
  $("#exportButton").onclick = () => {
    const count = state.selectedIds.size;
    $("#exportScope").textContent = count ? "仅导出已选内容" : "带走你的资料";
    $("#exportTitle").textContent = count ? "导出已选 " + count + " 条" : "导出当前范围";
    $("#exportDialog").showModal();
  };
  document.querySelectorAll("[data-export]").forEach(button => button.onclick = () => exportRows(button.dataset.export));
  $("#backupButton").onclick = () => $("#backupDialog").showModal();
  $("#createBackup").onclick = createBackup;
  $("#restoreInput").onchange = event => event.target.files[0] && importFile(event.target.files[0], true);
  $("#importButton").onclick = () => $("#importInput").click();
  $("#importInput").onchange = event => event.target.files[0] && importFile(event.target.files[0]);
  $("#manageTags").onclick = openTagManager;
  $("#newTag").onclick = openTagCreateDialog;
  $("#tagCreateForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      $("#tagCreateDialog").close();
      return;
    }
    const created = await createTag(event.currentTarget.elements.name.value);
    if (created) $("#tagCreateDialog").close();
  });
}

async function start() {
  bindTheme();
  bindStickyBars();
  bindClearData();
  bindEvents();
  state.posts = await getAll("posts");
  state.users = await getAll("users");
  state.tags = await getSetting("tags", []);
  render();
  await refreshCaptureStatus();
  if (!globalThis.chrome?.runtime) {
    $("#notice").textContent = "当前是普通网页预览；同步功能只在加载为 Chrome 扩展后可用。";
    $("#notice").classList.remove("hidden");
  }
}

start().catch(error => {
  console.error(error);
  showToast("xShelf 启动失败：" + error.message);
});
