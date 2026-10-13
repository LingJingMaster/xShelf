function readScreenName() {
  const href = document.querySelector("a[data-testid='AppTabBar_Profile_Link']")?.getAttribute("href") || "";
  const name = href.split("/").filter(Boolean)[0] || "";
  return /^[A-Za-z0-9_]{1,15}$/.test(name) ? name : "";
}

let lastName = "";
function publishScreenName() {
  const name = readScreenName();
  if (!name || name === lastName) return;
  lastName = name;
  chrome.runtime.sendMessage({ type: "x-screen-name", screenName: name });
}

publishScreenName();
const timer = setInterval(publishScreenName, 500);
setTimeout(() => clearInterval(timer), 15000);
