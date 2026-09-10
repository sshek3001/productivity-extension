# Focus Tracker

A personal Chrome extension that tracks how you spend time in the browser and
nags you (no hard blocking) when you go over your daily "unproductive" budget.

- **YouTube videos** are classified productive/unproductive by Claude Haiku,
  based on title + channel (+ description), and cached locally so the same
  video is never re-classified.
- **Other sites** are classified by a static domain list (`rules.js`) —
  GitHub/Kaggle/arXiv/etc. = productive, Instagram/Netflix/etc. = unproductive,
  everything else = neutral (tracked, not counted either way).
- All data stays in `chrome.storage.local` on your machine — nothing is
  synced anywhere except the video title/channel sent to the Anthropic API
  for classification.

## Install (load unpacked)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension directly from these files).
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked** and select this folder.
5. Click the extension's icon in the toolbar, open **Settings**, and paste in
   your Anthropic API key (`console.anthropic.com` → Settings → API Keys →
   Create Key). Set your daily unproductive budget and nag interval, then
   **Save**.

## Customizing what counts as productive

Edit `rules.js`:
- `PRODUCTIVE_DOMAINS` / `UNPRODUCTIVE_DOMAINS` — plain domain matches
- `PRODUCTIVE_URL_PATTERNS` — substring matches for cases like
  `linkedin.com/jobs` where only part of a domain should count

For YouTube, the classification prompt lives in `background.js` inside
`classifyVideoWithLLM` — edit the `system` string there if you want to
tighten or loosen what counts as "productive" (e.g. add specific channels,
be stricter about tutorials vs. talks, etc.).

After editing either file, go to `chrome://extensions` and click the reload
icon on the extension card to pick up the change.

## Known limitations / things worth knowing

- **Video reclassification**: once a video is classified, it's cached
  forever by video ID. If you want to force a re-check (e.g. you tightened
  the prompt), clear the `videoCache` key via the extensions page's
  "Inspect views: service worker" console:
  `chrome.storage.local.remove('videoCache')`.
- **Idle detection** treats you as idle after 60 seconds of no input; that
  time isn't counted toward either bucket.
- **Multiple windows**: only the currently focused tab in the currently
  focused window is tracked — background tabs/windows don't accumulate time.
- **Spend safety net**: this only estimates cost locally for your own
  visibility. Set the *real* hard limit in the Anthropic Console
  (Settings → Billing → Spend limits) — that's the actual backstop if
  something misbehaves.
- This is a personal tool with no build step — it's plain JS/HTML/CSS, so
  feel free to open any file and tweak it directly.
