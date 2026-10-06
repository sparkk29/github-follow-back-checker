<p align="center">
  <img src="icons/logo.svg" width="128" height="128" alt="GitHub Follow-Back Checker logo: two arrows circling a person">
</p>

<h1 align="center">GitHub Follow-Back Checker</h1>

<p align="center">
  <strong>See who doesn't follow you back on GitHub, and unfollow them in one click.</strong><br>
  A free, open-source Chrome extension for people who do follow-for-follow (F4F) on GitHub.
</p>

<p align="center">
  <img alt="Chrome extension" src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-2ea043">
  <img alt="No token required" src="https://img.shields.io/badge/GitHub%20token-not%20required-8b949e">
  <img alt="No tracking" src="https://img.shields.io/badge/tracking-none-8b949e">
</p>

---

## Why this exists

If you grow your GitHub network through **follow for follow** (also called **F4F**, **follow back**, or **#followback**), you have probably followed hundreds of developers who promised to follow back. Some never do. GitHub doesn't show you who they are, and checking profiles one by one doesn't scale.

**GitHub Follow-Back Checker** compares your followers and following lists in seconds, shows exactly **who isn't following you back**, and lets you **unfollow non-followers** right from your browser toolbar. You don't need a personal access token, a script, or a third-party website.

## Features

- **Find non-followers instantly:** one click scans your GitHub followers and following and lists everyone who doesn't follow you back.
- **One-click unfollow:** unfollow a single user, or use **Unfollow all** for the whole list.
- **Keep list:** mark friends, mentors, or favorite open-source maintainers as **Keep** so they never get unfollowed by accident.
- **Search:** filter the list by username before you act.
- **Live counts:** see followers, following, and not-following-back at a glance.
- **Safe, throttled bulk unfollow:** unfollows go one at a time with a short pause between them, keeping your activity human-paced.
- **Runs in the background:** close the popup and the unfollow queue keeps going. Reopen it to see progress.
- **No token, no login form:** it uses the GitHub session you're already logged in with.
- **Private by design:** your data stays in your browser. Nothing is sent anywhere except GitHub.

## Who it's for

- Developers doing **GitHub follow for follow** to grow their profile
- Members of **F4F communities** on Discord, Telegram, X (Twitter), LinkedIn, and Reddit
- Anyone tidying up their **GitHub following list** after a follow-back campaign
- Students and new developers building a GitHub presence

## Install

The extension isn't on the Chrome Web Store yet. Install it from source, which takes about a minute:

1. Download or clone this repository:

   ```bash
   git clone https://github.com/sparkk29/github-follow-back-checker.git
   ```

2. Open `chrome://extensions` in Chrome (also works in Edge, Brave, Arc, and other Chromium browsers).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose this project folder.
5. Pin **GitHub Follow-Back Checker** from the puzzle-piece menu so it stays in your toolbar.

## How to use

1. Log in to [github.com](https://github.com) and keep a GitHub tab open.
2. Click the extension icon, then **Scan**.
3. Review the list of people who don't follow you back:
   - **Unfollow** removes one person.
   - **Keep** hides someone from the list and protects them from bulk unfollow. Find them again under **Kept**.
   - **Unfollow all shown** unfollows everyone currently in the list (use the search box to narrow it). Click twice to confirm.
4. Click **Rescan** any time to refresh your follow-back status.

## FAQ

### How do I see who doesn't follow me back on GitHub?

GitHub has no built-in "not following back" view. Install this extension, open it while logged in to GitHub, and click **Scan**. It compares your followers and following and lists everyone who doesn't follow you back.

### How do I unfollow people who don't follow me back on GitHub?

After a scan, click **Unfollow** next to a user, or **Unfollow all shown** to remove every non-follower in the list. Anyone you've marked **Keep** is skipped.

### Do I need a GitHub personal access token?

No. The follower and following lists come from GitHub's public API, and unfollowing uses the GitHub session already open in your browser, the same way clicking GitHub's own Unfollow button does.

### Is it safe? Can my GitHub account get flagged?

Bulk unfollows run one at a time, 1.5 to 2 seconds apart, so your activity stays human-paced rather than bursty. That said, GitHub's [Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) prohibit inauthentic activity and spam, and mass follow/unfollow churn can draw attention. Use the extension to tidy your network, not to cycle through thousands of accounts.

### Is follow for follow allowed on GitHub?

Following people is a normal part of GitHub. Automated or mass following to inflate numbers is what GitHub's policies target. This extension only helps you review and unfollow. It never follows anyone automatically.

### How many followers can it handle?

Without a token, GitHub allows 60 public API requests per hour. That covers about 3,000 followers and following combined per scan. If you hit the limit, the popup tells you when you can scan again.

### Does it collect my data?

No. Scan results and your Keep list are stored locally in `chrome.storage.local`. The extension only talks to `github.com` and `api.github.com`.

### Does it work on Firefox or Safari?

Not yet. It's built for Chrome and Chromium-based browsers (Edge, Brave, Arc, Opera, Vivaldi).

## How it works

1. **Detects your username** from the GitHub tab you're logged in to.
2. **Fetches your followers and following** from the public GitHub REST API (`/users/{you}/followers` and `/users/{you}/following`, 100 per page).
3. **Compares the lists** to find accounts you follow that don't follow you back.
4. **Unfollows through your session:** it opens the user's profile in the background, reads GitHub's Unfollow form and its security token, and submits it, exactly like clicking the button yourself.

## Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension manifest (Manifest V3) |
| `background.js` | Service worker: scanning, caching, unfollow queue |
| `content.js` | Runs on github.com: detects your login and performs unfollows |
| `popup.html`, `popup.css`, `popup.js` | Toolbar popup UI |
| `icons/` | Extension icons and logo (`logo.svg`) |

## Troubleshooting

- **"Couldn't detect your GitHub login"**: log in at github.com, keep a GitHub tab focused, then scan again. The message shows which page was checked.
- **A row says "Unfollow button not found on profile"**: GitHub probably changed its profile page markup. Update `findUnfollowForm` in `content.js`, the only code that depends on that markup.
- **After editing the code**: click the reload icon on the extension's card in `chrome://extensions`, then refresh your GitHub tab.

## Contributing

Issues and pull requests are welcome, especially Firefox support, a Chrome Web Store release, and export of your non-followers list to CSV.

If this extension helped you clean up your GitHub following list, consider giving the repo a star so other follow-for-follow developers can find it.

---

<sub>Keywords: GitHub follow back checker, who doesn't follow me back on GitHub, GitHub unfollow non-followers, GitHub follow for follow, F4F GitHub, GitHub followers tracker, GitHub unfollow tool, GitHub followers vs following, Chrome extension for GitHub followers.</sub>
