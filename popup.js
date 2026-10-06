const $ = (id) => document.getElementById(id);

const els = {
  meta: $("meta"),
  scan: $("scan"),
  banner: $("banner"),
  followers: $("stat-followers"),
  following: $("stat-following"),
  nfb: $("stat-nfb"),
  progress: $("progress"),
  progressLabel: $("progress-label"),
  progressCount: $("progress-count"),
  progressBar: $("progress-bar"),
  search: $("search"),
  toggleKept: $("toggle-kept"),
  unfollowAll: $("unfollow-all"),
  list: $("list"),
  empty: $("empty"),
};

const state = {
  cache: null,
  whitelist: [],
  errors: {},
  job: null,
  search: "",
  showKept: false,
  scanning: false,
};

let confirmTimer = null;

// ---------- helpers ----------

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function avatar(url, size) {
  return `${url}${url.includes("?") ? "&" : "?"}s=${size}`;
}

function showBanner(message, kind = "error") {
  els.banner.textContent = message;
  els.banner.className = `banner${kind === "warn" ? " warn" : ""}`;
  els.banner.hidden = false;
}

function hideBanner() {
  els.banner.hidden = true;
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}

const isKept = (login) => state.whitelist.includes(login.toLowerCase());

function isBusy(login) {
  const job = state.job;
  return !!job?.running && (job.current === login || (job.queued || []).includes(login));
}

function visibleUsers() {
  const users = state.cache?.notFollowingBack || [];
  const q = state.search.trim().toLowerCase();
  return users.filter((u) => isKept(u.login) === state.showKept && (!q || u.login.toLowerCase().includes(q)));
}

// ---------- rendering ----------

function renderRow(user) {
  const li = document.createElement("li");
  li.className = "row";

  const img = document.createElement("img");
  img.className = "avatar";
  img.src = avatar(user.avatar_url, 56);
  img.alt = "";
  img.loading = "lazy";

  const info = document.createElement("div");
  info.className = "row-info";
  const link = document.createElement("a");
  link.href = user.html_url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = user.login;
  info.append(link);
  if (state.errors[user.login]) {
    const err = document.createElement("div");
    err.className = "row-error";
    err.textContent = state.errors[user.login];
    info.append(err);
  }

  const actions = document.createElement("div");
  actions.className = "row-actions";

  if (state.showKept) {
    const unkeep = document.createElement("button");
    unkeep.className = "btn btn-small";
    unkeep.textContent = "Un-keep";
    unkeep.addEventListener("click", () => setKept(user.login, false));
    actions.append(unkeep);
  } else {
    const busy = isBusy(user.login);
    const keep = document.createElement("button");
    keep.className = "btn btn-small";
    keep.textContent = "Keep";
    keep.title = "Keep following and hide from this list";
    keep.disabled = busy;
    keep.addEventListener("click", () => setKept(user.login, true));

    const unfollow = document.createElement("button");
    unfollow.className = "btn btn-small btn-danger";
    unfollow.textContent = busy ? (state.job.current === user.login ? "Unfollowing..." : "Queued") : "Unfollow";
    unfollow.disabled = busy;
    unfollow.addEventListener("click", () => unfollowUsers([user.login]));
    actions.append(keep, unfollow);
  }

  li.append(img, info, actions);
  return li;
}

function render() {
  const { cache, job } = state;

  els.scan.disabled = state.scanning;
  els.scan.textContent = state.scanning ? "Scanning..." : cache ? "Rescan" : "Scan";
  els.meta.textContent = cache ? `@${cache.login} · scanned ${timeAgo(cache.scannedAt)}` : "Not scanned yet";

  const keptCount = cache ? cache.notFollowingBack.filter((u) => isKept(u.login)).length : 0;
  els.followers.textContent = cache ? cache.followersCount : "-";
  els.following.textContent = cache ? cache.followingCount : "-";
  els.nfb.textContent = cache ? cache.notFollowingBack.length - keptCount : "-";

  els.toggleKept.textContent = `Kept (${keptCount})`;
  els.toggleKept.classList.toggle("active", state.showKept);

  if (job && job.total > 0 && (job.running || job.done + job.failed > 0)) {
    const processed = job.done + job.failed;
    els.progress.hidden = false;
    els.progressLabel.textContent = job.running
      ? `Unfollowing${job.current ? ` @${job.current}` : ""}...`
      : `Finished: ${job.done} unfollowed${job.failed ? `, ${job.failed} failed` : ""}`;
    els.progressCount.textContent = `${processed} / ${job.total}`;
    els.progressBar.style.width = `${(processed / job.total) * 100}%`;
  } else {
    els.progress.hidden = true;
  }

  const users = visibleUsers();
  const actionable = users.filter((u) => !isBusy(u.login));
  els.unfollowAll.hidden = state.showKept;
  els.unfollowAll.disabled = !actionable.length;
  if (!els.unfollowAll.classList.contains("confirming")) {
    els.unfollowAll.textContent = actionable.length ? `Unfollow all shown (${actionable.length})` : "Unfollow all shown";
  }

  els.list.replaceChildren(...users.map(renderRow));

  if (!cache) {
    els.empty.textContent = "Click Scan to check who doesn't follow you back.";
  } else if (users.length) {
    els.empty.textContent = "";
  } else if (state.search) {
    els.empty.textContent = "No users match your search.";
  } else if (state.showKept) {
    els.empty.textContent = "You haven't kept anyone yet.";
  } else {
    els.empty.textContent = "Everyone you follow follows you back.";
  }
  els.empty.hidden = !els.empty.textContent;
}

// ---------- actions ----------

async function scan() {
  hideBanner();
  state.scanning = true;
  render();
  try {
    const res = await send({ type: "gfb:scan" });
    if (!res?.ok) showBanner(res?.error || "Scan failed");
  } catch (err) {
    showBanner(String(err?.message || err));
  } finally {
    state.scanning = false;
    render();
  }
}

async function unfollowUsers(logins) {
  hideBanner();
  try {
    const res = await send({ type: "gfb:unfollow", logins });
    if (!res?.ok) showBanner(res?.error || "Could not start unfollowing");
  } catch (err) {
    showBanner(String(err?.message || err));
  }
}

async function setKept(login, kept) {
  const key = login.toLowerCase();
  const whitelist = state.whitelist.filter((l) => l !== key);
  if (kept) whitelist.push(key);
  await chrome.storage.local.set({ whitelist });
}

function resetConfirm() {
  clearTimeout(confirmTimer);
  els.unfollowAll.classList.remove("confirming");
}

function onUnfollowAll() {
  const logins = visibleUsers()
    .filter((u) => !isBusy(u.login))
    .map((u) => u.login);
  if (!logins.length) return;

  if (!els.unfollowAll.classList.contains("confirming")) {
    els.unfollowAll.classList.add("confirming");
    els.unfollowAll.textContent = `Click again to unfollow ${logins.length} users`;
    confirmTimer = setTimeout(() => {
      resetConfirm();
      render();
    }, 4000);
    return;
  }

  resetConfirm();
  unfollowUsers(logins);
  render();
}

// ---------- wiring ----------

els.scan.addEventListener("click", scan);
els.unfollowAll.addEventListener("click", onUnfollowAll);
els.search.addEventListener("input", () => {
  state.search = els.search.value;
  resetConfirm();
  render();
});
els.toggleKept.addEventListener("click", () => {
  state.showKept = !state.showKept;
  resetConfirm();
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.cache) state.cache = changes.cache.newValue || null;
  if (changes.whitelist) state.whitelist = changes.whitelist.newValue || [];
  if (changes.errors) state.errors = changes.errors.newValue || {};
  if (changes.job) state.job = changes.job.newValue || null;
  render();
});

chrome.storage.local.get(["cache", "whitelist", "errors", "job"]).then((data) => {
  state.cache = data.cache || null;
  state.whitelist = data.whitelist || [];
  state.errors = data.errors || {};
  state.job = data.job || null;
  render();
});
