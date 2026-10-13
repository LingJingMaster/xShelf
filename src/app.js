import { dumpDatabase, getAll, putMany, remove, restoreDatabase } from "./lib/db.js";
import { filterPosts } from "./lib/search.js";
import { parseBookmarksResponse } from "./lib/x-sync.js";

const $ = selector => document.querySelector(selector);
const state = {
  posts: [],
  folder: "all",
  view: "cards",
  filters: { query: "", contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false },
  syncReady: false,
  syncing: false,
  stopSync: false
};

const stage = $("#stage");
const toast = $("#toast");
let toastTimer;

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

function folderName(folder) {
  return folder === "unsorted" ? "未分类" : folder;
}

function formatDate(seconds) {
  if (!seconds) return "日期未知";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(seconds * 1000));
}

function currentRows() {
  return filterPosts(state.posts, { ...state.filters, folder: state.folder });
}

function folders() {
  const values = new Set(state.posts.map(post => post.folder || "unsorted"));
  values.add("unsorted");
  return [...values].sort((a, b) => a === "unsorted" ? -1 : b === "unsorted" ? 1 : a.localeCompare(b, "zh-CN"));
}

function renderFolders() {
  const list = $("#folderList");
  list.replaceChildren();
  const all = element("button", {
    className: "folder-item" + (state.folder === "all" ? " active" : ""),
    onclick: () => selectFolder("all")
  }, [element("span", { text: "全部" }), element("small", { text: String(state.posts.length) })]);
  list.append(all);
  for (const folder of folders()) {
    const count = state.posts.filter(post => (post.folder || "unsorted") === folder).length;
    list.append(element("button", {
      className: "folder-item" + (state.folder === folder ? " active" : ""),
      onclick: () => selectFolder(folder)
    }, [element("span", { text: folderName(folder) }), element("small", { text: String(count) })]));
  }
}

function selectFolder(folder) {
  state.folder = folder;
  $("#app").classList.remove("nav-open");
  render();
}

function makeAvatar(post) {
  const avatar = element("div", { className: "avatar" });
  if (post.avatarUrl) {
    const image = element("img", { src: post.avatarUrl, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    image.addEventListener("error", () => image.remove());
    avatar.append(image);
  } else {
    avatar.textContent = (post.authorName || "?").slice(0, 1);
  }
  return avatar;
}

function makeCard(post) {
  const authorCopy = element("div", { className: "author-copy" }, [
    element("b", { text: post.authorName || "Unknown" }),
    element("span", { text: post.authorHandle || "" })
  ]);
  const deleteButton = element("button", {
    className: "card-menu",
    title: "仅从本地删除",
    "aria-label": "仅从本地删除",
    text: "×",
    onclick: async () => {
      if (!confirm("只从 xShelf 本地删除这条书签？X 上的原书签不会变化。")) return;
      await remove("posts", post.id);
      state.posts = state.posts.filter(item => item.id !== post.id);
      render();
    }
  });
  const author = element("div", { className: "author" }, [makeAvatar(post), authorCopy, deleteButton]);
  const textLink = element("a", { className: "bookmark-text", href: post.url || "#", target: "_blank", rel: "noreferrer" });
  textLink.textContent = post.text || post.articleTitle || "（没有可显示的正文）";
  textLink.style.color = "inherit";
  textLink.style.textDecoration = "none";

  const select = element("select", { className: "folder-select", "aria-label": "移动到文件夹" });
  for (const folder of folders()) {
    const option = element("option", { value: folder, text: folderName(folder) });
    option.selected = (post.folder || "unsorted") === folder;
    select.append(option);
  }
  select.addEventListener("change", async () => {
    post.folder = select.value;
    await putMany("posts", [post]);
    render();
  });
  const foot = element("div", { className: "card-foot" }, [
    element("span", { text: formatDate(post.createdAt) }),
    post.contentTypes?.length ? element("span", { text: post.contentTypes.join(" / ") }) : element("span"),
    select
  ]);
  return element("article", { className: "bookmark-card" }, [author, textLink, foot]);
}

function renderStats(rows) {
  const counts = new Map();
  rows.forEach(post => counts.set(post.folder || "unsorted", (counts.get(post.folder || "unsorted") || 0) + 1));
  const max = Math.max(1, ...counts.values());
  const bars = element("div");
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    bars.append(element("div", { className: "bar-row" }, [
      element("span", { text: folderName(name) }),
      element("div", { className: "bar-track" }, [element("div", { className: "bar-fill", style: "width:" + (count / max * 100) + "%" })]),
      element("span", { text: String(count) })
    ]));
  });
  const authors = new Set(rows.map(post => post.authorHandle).filter(Boolean)).size;
  stage.append(element("div", { className: "stats-board" }, [
    element("section", { className: "stat-panel" }, [element("div", { className: "big-number", text: String(rows.length) }), element("p", { text: "当前范围内的书签" }), element("div", { className: "big-number", text: String(authors) }), element("p", { text: "位作者" })]),
    element("section", { className: "stat-panel" }, [element("p", { text: "文件夹分布" }), bars])
  ]));
}

function renderEmpty(hasAnyPosts) {
  const title = hasAnyPosts ? "没有找到符合条件的书签" : "书架还是空的";
  const copy = hasAnyPosts ? "换个关键词，或清除筛选条件后再看看。" : "先打开 X 的书签页，让 xShelf 识别当前会话，然后回到这里同步。也可以导入已有的 JSON、JSONL 或 ZIP 备份。";
  const action = element("button", { className: "ink-button", text: hasAnyPosts ? "清除搜索和筛选" : "打开 X 书签", onclick: () => {
    if (hasAnyPosts) {
      state.filters = { query: "", contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false };
      $("#searchInput").value = "";
      $("#filterForm").reset();
      render();
    } else window.open("https://x.com/i/bookmarks", "_blank");
  }});
  stage.append(element("div", { className: "empty-state" }, [element("div", { className: "empty-mark" }), element("h2", { text: title }), element("p", { text: copy }), action]));
}

function render() {
  renderFolders();
  const rows = currentRows();
  $("#totalCount").textContent = String(state.posts.length);
  $("#contextLabel").textContent = state.folder === "all" ? "全部书签" : folderName(state.folder);
  $("#pageTitle").textContent = rows.length + " 条可回看的内容";
  const activeFilters = [state.filters.contentType !== "all", state.filters.postType !== "all", state.filters.startDate, state.filters.endDate, state.filters.oldest].filter(Boolean).length;
  $("#filterCount").textContent = activeFilters ? String(activeFilters) : "";
  stage.className = state.view === "compact" ? "card-grid compact" : "card-grid";
  stage.replaceChildren();
  if (!rows.length) renderEmpty(state.posts.length > 0);
  else if (state.view === "stats") renderStats(rows);
  else rows.forEach(post => stage.append(makeCard(post)));
}

async function refreshCaptureStatus() {
  const response = await runtimeMessage({ type: "capture-status" });
  state.syncReady = Boolean(response?.ok && response.ready);
  $("#syncLight").classList.toggle("ready", state.syncReady);
  if (!state.syncing) {
    $("#syncLabel").textContent = state.syncReady ? "同步书签" : "连接 X";
    $("#syncMeta").textContent = state.syncReady ? "已识别当前会话" : "先打开 X 书签页";
  }
}

async function syncBookmarks() {
  if (state.syncing) {
    state.stopSync = true;
    $("#syncMeta").textContent = "将在本页结束后停止";
    return;
  }
  await refreshCaptureStatus();
  if (!state.syncReady) {
    window.open("https://x.com/i/bookmarks", "_blank");
    showToast("X 书签页加载完成后，回到这里再次点击同步。");
    return;
  }
  state.syncing = true;
  state.stopSync = false;
  $("#syncLight").classList.add("busy");
  $("#syncLabel").textContent = "停止同步";
  const known = new Map(state.posts.map(post => [post.id, post]));
  let cursor = null;
  let previousCursor = null;
  let added = 0;
  let pages = 0;
  try {
    while (!state.stopSync && pages < 50) {
      $("#syncMeta").textContent = "正在读取第 " + (pages + 1) + " 页";
      const response = await runtimeMessage({ type: "fetch-bookmarks-page", cursor });
      if (!response?.ok) throw new Error(response?.error || "同步失败");
      const parsed = parseBookmarksResponse(response.data);
      const newOnPage = parsed.posts.filter(post => !known.has(post.id)).length;
      const merged = parsed.posts.map(post => {
        const old = known.get(post.id);
        return old ? { ...post, folder: old.folder, bookmarkedAt: old.bookmarkedAt } : post;
      });
      await putMany("posts", merged);
      merged.forEach(post => known.set(post.id, post));
      added += newOnPage;
      pages += 1;
      state.posts = [...known.values()];
      render();
      if (!parsed.cursor || parsed.cursor === previousCursor || !parsed.posts.length || (pages > 1 && newOnPage < 10)) break;
      previousCursor = cursor;
      cursor = parsed.cursor;
    }
    showToast("同步完成：新增 " + added + " 条，读取 " + pages + " 页。");
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
  const rows = currentRows();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), "xshelf-" + stamp + ".json");
  } else if (format === "csv") {
    const columns = ["tweetId", "authorName", "authorHandle", "text", "createdAt", "folder", "url"];
    const quote = value => '"' + String(value ?? "").replaceAll('"', '""').replaceAll("\n", "\\n") + '"';
    const csv = "\ufeff" + [columns.join(","), ...rows.map(row => columns.map(key => quote(row[key])).join(","))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "xshelf-" + stamp + ".csv");
  } else {
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const cards = rows.map(row => '<article><p>' + escape(row.text) + '</p><small>' + escape(row.authorName) + ' ' + escape(row.authorHandle) + ' · ' + escape(folderName(row.folder)) + '</small><a href="' + escape(row.url) + '">查看原帖</a></article>').join("");
    const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>xShelf export</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;background:#e5e7e3;color:#18201b;font:16px Georgia,serif}h1{font-size:42px}article{margin:12px 0;padding:20px;background:#fafaf7;border:1px solid #ccd1cc;border-radius:10px}small{color:#68726b}a{display:block;margin-top:14px;color:#146b50}</style><h1>xShelf</h1>' + cards;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "xshelf-" + stamp + ".html");
  }
  $("#exportDialog").close();
  showToast("已导出 " + rows.length + " 条书签。");
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
  const tweetId = source.tweetId || source.rest_id || source.id_str || String(source.id || index).split("_").at(-1);
  const user = source.user || source.core?.user_results?.result?.legacy || {};
  const handle = source.authorHandle || source.screen_name || user.screen_name || "";
  const created = source.createdAt ?? source.created_at;
  return {
    id: String(source.id || "bookmark_" + tweetId),
    tweetId: String(tweetId),
    text: source.text || source.full_text || source.note_tweet?.text || "",
    authorId: String(source.authorId || source.user_id || ""),
    authorName: source.authorName || source.name || user.name || "Unknown",
    authorHandle: handle ? (String(handle).startsWith("@") ? String(handle) : "@" + handle) : "",
    avatarUrl: source.avatarUrl || source.profile_image_url_https || user.profile_image_url_https || "",
    createdAt: typeof created === "number" ? (created > 1e12 ? Math.floor(created / 1000) : created) : Math.floor(Date.parse(created || 0) / 1000) || 0,
    bookmarkedAt: source.bookmarkedAt || Math.floor(Date.now() / 1000),
    folder: source.folder || "unsorted",
    contentTypes: source.contentTypes || [],
    postType: source.postType || "post",
    articleTitle: source.articleTitle || source.article?.title || "",
    articlePreview: source.articlePreview || source.article?.preview_text || "",
    url: source.url || (handle ? "https://x.com/" + String(handle).replace(/^@/, "") + "/status/" + tweetId : "https://x.com/i/status/" + tweetId),
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
      await putMany("posts", rows.map(normalizeImported));
      showToast("已导入 " + rows.length + " 条书签。");
    }
    state.posts = await getAll("posts");
    render();
    if (backupMode) $("#backupDialog").close();
  } catch (error) {
    showToast("无法导入：" + error.message);
  }
}

function bindEvents() {
  $("#openNav").onclick = () => $("#app").classList.add("nav-open");
  $("#closeNav").onclick = () => $("#app").classList.remove("nav-open");
  $("#syncButton").onclick = syncBookmarks;
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
  $("#filterForm").addEventListener("submit", event => {
    if (event.submitter?.value !== "apply") return;
    const data = new FormData(event.currentTarget);
    state.filters = { ...state.filters, contentType: data.get("contentType"), postType: data.get("postType"), startDate: data.get("startDate"), endDate: data.get("endDate"), oldest: data.get("oldest") === "on" };
    render();
  });
  $("#clearFilters").onclick = () => { $("#filterForm").reset(); state.filters = { ...state.filters, contentType: "all", postType: "all", startDate: "", endDate: "", oldest: false }; render(); };
  $("#exportButton").onclick = () => $("#exportDialog").showModal();
  document.querySelectorAll("[data-export]").forEach(button => button.onclick = () => exportRows(button.dataset.export));
  $("#backupButton").onclick = () => $("#backupDialog").showModal();
  $("#createBackup").onclick = createBackup;
  $("#restoreInput").onchange = event => event.target.files[0] && importFile(event.target.files[0], true);
  $("#importButton").onclick = () => $("#importInput").click();
  $("#importInput").onchange = event => event.target.files[0] && importFile(event.target.files[0]);
  $("#newFolder").onclick = async () => {
    const name = prompt("新文件夹名称");
    if (!name?.trim()) return;
    state.folder = name.trim();
    render();
    showToast("文件夹已创建。把卡片移动进来后会永久保存。");
  };
}

async function start() {
  bindEvents();
  state.posts = await getAll("posts");
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
