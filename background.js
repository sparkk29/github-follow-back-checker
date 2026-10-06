const API = "https://api.github.com";
const PER_PAGE = 100;
const UNFOLLOW_DELAY_MIN_MS = 1500;
const UNFOLLOW_DELAY_MAX_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimitError extends Error {
  constructor(resetAt) {
    const time = new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    super(`GitHub API rate limit reached. Try again after ${time}.`);
    this.resetAt = resetAt;
  }
}

// ---------- github.com tab ----------

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for github.com to load"));
    }, 30000);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") listener(tabId, { status: "complete" });
    }, reject);
  });
}

async function ensureGithubTab() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: "https://github.com/*" });
  const tabs = await chrome.tabs.query({ url: "https://github.com/*" });
  const tab =
    active ||
    tabs.find((t) => t.active && !t.discarded) ||
    tabs.find((t) => t.status === "complete" && !t.discarded) ||
    tabs.find((t) => !t.discarded);
  if (tab) {
    await waitForTabComplete(tab.id);
    return tab.id;
  }
  const created = await chrome.tabs.create({ url: "https://github.com/", active: false });
  await waitForTabComplete(created.id);
  return created.id;
}

async function sendToGithubTab(message) {
  const tabId = await ensureGithubTab();
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Tabs opened before the extension was installed/reloaded have no content script yet.
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function getLoggedInUser() {
  const res = await sendToGithubTab({ type: "gfb:getUser" });
  if (!res?.login) {
    const where = res?.url ? ` (checked ${res.url})` : "";
    throw new Error(`Couldn't detect your GitHub login${where}. Make sure you're logged in, then scan again.`);
  }
  return res.login;
}

// ---------- GitHub API ----------

async function fetchAllPages(path) {
  const users = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${API}${path}?per_page=${PER_PAGE}&page=${page}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if ((res.status === 403 || res.status === 429) && res.headers.get("X-RateLimit-Remaining") === "0") {
      throw new RateLimitError(Number(res.headers.get("X-RateLimit-Reset")) * 1000);
    }
    if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`);
    const batch = await res.json();
    for (const u of batch) {
      users.push({ login: u.login, avatar_url: u.avatar_url, html_url: u.html_url });
    }
    if (batch.length < PER_PAGE) return users;
  }
}

async function scan() {
  const login = await getLoggedInUser();
  const [followers, following] = await Promise.all([
    fetchAllPages(`/users/${encodeURIComponent(login)}/followers`),
    fetchAllPages(`/users/${encodeURIComponent(login)}/following`),
  ]);
  const followerSet = new Set(followers.map((u) => u.login.toLowerCase()));
  const notFollowingBack = following.filter((u) => !followerSet.has(u.login.toLowerCase()));

  const cache = {
    login,
    followersCount: followers.length,
    followingCount: following.length,
    notFollowingBack,
    scannedAt: Date.now(),
  };
  await chrome.storage.local.set({ cache, errors: {} });
  return cache;
}

// ---------- unfollow queue ----------

// The queue lives in memory; chrome.storage only mirrors `job` so the popup can show progress.
let queue = [];
let job = { running: false, total: 0, done: 0, failed: 0, current: null };

const saveJob = () => chrome.storage.local.set({ job: { ...job, queued: [...queue] } });

// Runs on every service worker start: any previously stored "running" job died with the old worker.
saveJob();

async function removeFromCache(login) {
  const { cache } = await chrome.storage.local.get("cache");
  if (!cache) return;
  const key = login.toLowerCase();
  const before = cache.notFollowingBack.length;
  cache.notFollowingBack = cache.notFollowingBack.filter((u) => u.login.toLowerCase() !== key);
  if (cache.notFollowingBack.length !== before) cache.followingCount -= 1;
  await chrome.storage.local.set({ cache });
}

async function setError(login, message) {
  const { errors = {} } = await chrome.storage.local.get("errors");
  if (message) errors[login] = message;
  else delete errors[login];
  await chrome.storage.local.set({ errors });
}

async function enqueueUnfollow(logins) {
  const fresh = [...new Set(logins)].filter((l) => !queue.includes(l) && l !== job.current);
  if (!fresh.length) return { ...job };
  queue.push(...fresh);

  if (job.running) {
    job.total += fresh.length;
    await saveJob();
  } else {
    job = { running: true, total: fresh.length, done: 0, failed: 0, current: null };
    await saveJob();
    processQueue();
  }
  return { ...job };
}

async function processQueue() {
  try {
    while (queue.length) {
      const login = queue.shift();
      job.current = login;
      await saveJob();

      let result;
      try {
        result = await sendToGithubTab({ type: "gfb:unfollow", username: login });
      } catch (err) {
        result = { ok: false, error: String(err?.message || err) };
      }

      if (result?.ok) {
        await setError(login, null);
        await removeFromCache(login);
        job.done += 1;
      } else {
        await setError(login, result?.error || "Unknown error");
        job.failed += 1;
      }
      job.current = null;
      await saveJob();

      if (queue.length) {
        await sleep(UNFOLLOW_DELAY_MIN_MS + Math.random() * (UNFOLLOW_DELAY_MAX_MS - UNFOLLOW_DELAY_MIN_MS));
      }
    }
  } finally {
    job.running = false;
    job.current = null;
    await saveJob();
  }
}

// ---------- messaging ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;

  const handlers = {
    "gfb:scan": () => scan(),
    "gfb:unfollow": () => enqueueUnfollow(msg.logins || []),
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;

  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});
