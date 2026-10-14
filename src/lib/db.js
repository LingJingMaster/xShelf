const DB_NAME = "xshelf";
const DB_VERSION = 2;
export const STORES = ["posts", "users", "settings"];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      let posts;
      if (!db.objectStoreNames.contains("posts")) {
        posts = db.createObjectStore("posts", { keyPath: "id" });
        posts.createIndex("createdAt", "createdAt");
        posts.createIndex("authorHandle", "authorHandle");
      } else posts = transaction.objectStore("posts");
      if (posts.indexNames.contains("folder")) posts.deleteIndex("folder");
      if (!posts.indexNames.contains("tags")) posts.createIndex("tags", "tags", { multiEntry: true });
      let users;
      if (!db.objectStoreNames.contains("users")) users = db.createObjectStore("users", { keyPath: "id" });
      else users = transaction.objectStore("users");
      if (!users.indexNames.contains("tags")) users.createIndex("tags", "tags", { multiEntry: true });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const rows = await requestResult(transaction.objectStore(storeName).getAll());
  db.close();
  return rows;
}

export async function putMany(storeName, rows) {
  if (!rows.length) return 0;
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  rows.forEach(row => store.put(row));
  await transactionDone(transaction);
  db.close();
  return rows.length;
}

export async function remove(storeName, id) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
  db.close();
}

export async function clearAll() {
  const db = await openDatabase();
  const transaction = db.transaction(STORES, "readwrite");
  STORES.forEach(name => transaction.objectStore(name).clear());
  await transactionDone(transaction);
  db.close();
}

export async function setSetting(key, value) { return putMany("settings", [{ key, value }]); }

export async function getSetting(key, fallback = null) {
  const db = await openDatabase();
  const transaction = db.transaction("settings", "readonly");
  const row = await requestResult(transaction.objectStore("settings").get(key));
  db.close();
  return row?.value ?? fallback;
}

export async function dumpDatabase() {
  const entries = await Promise.all(STORES.map(async name => [name, await getAll(name)]));
  return Object.fromEntries(entries);
}

export async function restoreDatabase(data, replace = false) {
  if (replace) await clearAll();
  for (const name of STORES) await putMany(name, Array.isArray(data[name]) ? data[name] : []);
}
