(() => {
  // An instance orphaned by an extension reload has a runtime with no id; let the new one take over.
  if (window.__gfbRuntime?.id) return;
  window.__gfbRuntime = chrome.runtime;

  function readLogin(doc) {
    for (const name of ["user-login", "octolytics-actor-login"]) {
      const value = doc.querySelector(`meta[name="${name}"]`)?.content?.trim();
      if (value) return value;
    }
    return null;
  }

  // The live page's meta tags can be stale after GitHub's client-side navigation,
  // so fall back to a fresh server-rendered page that carries the session cookies.
  async function getLoggedInUser() {
    const fromPage = readLogin(document);
    if (fromPage) return fromPage;
    try {
      const res = await fetch("/", { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!res.ok) return null;
      return readLogin(new DOMParser().parseFromString(await res.text(), "text/html"));
    } catch {
      return null;
    }
  }

  // All knowledge of GitHub's profile-page markup lives here, so it is the
  // only place to update if GitHub changes how the Unfollow button works.
  function findUnfollowForm(doc, username) {
    const target = username.toLowerCase();
    const matchesTarget = (form) => {
      const action = form.getAttribute("action") || "";
      const params = new URL(action, location.origin).searchParams;
      return (params.get("target") || "").toLowerCase() === target;
    };
    const unfollow = [...doc.querySelectorAll('form[action^="/users/unfollow"]')].find(matchesTarget);
    const follow = [...doc.querySelectorAll('form[action^="/users/follow"]')].find(matchesTarget);
    return { unfollow, follow };
  }

  async function unfollow(username) {
    if (!(await getLoggedInUser())) {
      return { ok: false, error: "Not logged in to GitHub" };
    }

    const profileRes = await fetch(`/${encodeURIComponent(username)}`, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (profileRes.status === 404) {
      return { ok: false, error: "User not found" };
    }
    if (!profileRes.ok) {
      return { ok: false, error: `Profile request failed (${profileRes.status})` };
    }

    const doc = new DOMParser().parseFromString(await profileRes.text(), "text/html");
    const { unfollow: form, follow } = findUnfollowForm(doc, username);
    if (!form) {
      if (follow) return { ok: true, alreadyUnfollowed: true };
      return { ok: false, error: "Unfollow button not found on profile" };
    }

    const body = new URLSearchParams();
    for (const input of form.querySelectorAll("input[name]")) {
      body.append(input.name, input.value);
    }
    if (!body.get("authenticity_token")) {
      return { ok: false, error: "Missing authenticity token" };
    }

    const res = await fetch(new URL(form.getAttribute("action"), location.origin).href, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });

    if (res.url && new URL(res.url).pathname.startsWith("/login")) {
      return { ok: false, error: "GitHub session expired, log in again" };
    }
    if (!res.ok) {
      return { ok: false, error: `Unfollow failed (${res.status})` };
    }
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "gfb:getUser") {
      getLoggedInUser().then((login) => sendResponse({ login, url: location.href }));
      return true;
    }
    if (msg?.type === "gfb:unfollow") {
      unfollow(msg.username)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }
    return false;
  });
})();
