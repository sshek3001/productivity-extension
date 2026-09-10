import { classifyUrl, isYouTube } from "./rules.js";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_INPUT_COST_PER_TOKEN = 1.0 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 5.0 / 1_000_000;

const DEFAULT_SETTINGS = {
  apiKey: "",
  dailyBudgetMinutes: 60,
  nagIntervalMinutes: 10,
  monthlyCostWarningUSD: 1.0
};

// ---------- small storage helpers ----------

async function getLocal(keys) {
  return chrome.storage.local.get(keys);
}
async function setLocal(obj) {
  return chrome.storage.local.set(obj);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-09-09"
}
function monthKey() {
  return new Date().toISOString().slice(0, 7); // "2026-09"
}

async function getSettings() {
  const { settings } = await getLocal("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getDailyLog(dateKey) {
  const { dailyLog } = await getLocal("dailyLog");
  const log = dailyLog || {};
  return (
    log[dateKey] || { productiveSec: 0, unproductiveSec: 0, neutralSec: 0 }
  );
}

async function addSeconds(classification, seconds) {
  if (seconds <= 0) return;
  const { dailyLog } = await getLocal("dailyLog");
  const log = dailyLog || {};
  const key = todayKey();
  const entry =
    log[key] || { productiveSec: 0, unproductiveSec: 0, neutralSec: 0 };
  if (classification === "productive") entry.productiveSec += seconds;
  else if (classification === "unproductive") entry.unproductiveSec += seconds;
  else entry.neutralSec += seconds;
  log[key] = entry;
  await setLocal({ dailyLog: log });
}

async function addCost(usd) {
  const { costLog } = await getLocal("costLog");
  const log = costLog || {};
  const key = monthKey();
  log[key] = (log[key] || 0) + usd;
  await setLocal({ costLog: log });
}

// ---------- in-memory tracking state ----------
// (persisted to storage too, so a service-worker restart can recover)

let state = {
  activeDomain: null, // hostname or "youtube" or "idle"
  activeVideoId: null,
  classification: "neutral",
  lastTimestamp: Date.now(),
  lastNagTimestamp: 0
};

async function restoreState() {
  const { trackerState } = await getLocal("trackerState");
  if (trackerState) state = { ...state, ...trackerState, lastTimestamp: Date.now() };
}
async function persistState() {
  await setLocal({ trackerState: state });
}

/** Add elapsed time since lastTimestamp to the current classification's bucket. */
async function flush() {
  const now = Date.now();
  const elapsedSec = Math.round((now - state.lastTimestamp) / 1000);
  if (elapsedSec > 0) {
    await addSeconds(state.classification, elapsedSec);
  }
  state.lastTimestamp = now;
  await persistState();
}

async function setClassification(newClassification, domain, videoId = null) {
  await flush();
  state.classification = newClassification;
  state.activeDomain = domain;
  state.activeVideoId = videoId;
  await persistState();
}

// ---------- video classification cache + LLM call ----------

async function getCachedVideo(videoId) {
  const { videoCache } = await getLocal("videoCache");
  return (videoCache || {})[videoId] || null;
}

async function cacheVideo(videoId, classification, meta) {
  const { videoCache } = await getLocal("videoCache");
  const cache = videoCache || {};
  cache[videoId] = { classification, ts: Date.now(), ...meta };
  await setLocal({ videoCache: cache });
}

async function classifyVideoWithLLM({ videoId, title, channel, description }) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    // No key configured — fall back to neutral rather than blocking anything.
    return "neutral";
  }

  const system =
    "You classify a single YouTube video as PRODUCTIVE or UNPRODUCTIVE for " +
    "a viewer who considers the following productive: AI/machine learning, " +
    "computer science, software engineering, programming tutorials, research " +
    "papers/talks, and content directly related to their own projects, job " +
    "search, or research applications. Everything else (entertainment, vlogs, " +
    "gaming, music, general streaming/comedy/lifestyle content, etc.) is " +
    "unproductive. Respond with ONLY a JSON object like " +
    '{"classification":"productive"} or {"classification":"unproductive"}. ' +
    "No other text.";

  const userContent =
    `Title: ${title}\nChannel: ${channel}\n` +
    (description ? `Description: ${description.slice(0, 300)}` : "");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 20,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });

    if (!resp.ok) {
      console.warn("Focus Tracker: classification call failed", resp.status);
      return "neutral";
    }

    const data = await resp.json();

    // Track cost regardless of parse success, since tokens were still billed.
    const usage = data.usage || {};
    const cost =
      (usage.input_tokens || 0) * HAIKU_INPUT_COST_PER_TOKEN +
      (usage.output_tokens || 0) * HAIKU_OUTPUT_COST_PER_TOKEN;
    await addCost(cost);

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = text.match(/"classification"\s*:\s*"(productive|unproductive)"/i);
    if (match) return match[1].toLowerCase();
    return "neutral";
  } catch (err) {
    console.warn("Focus Tracker: classification error", err);
    return "neutral"; // never let an API/network hiccup break tracking
  }
}

// ---------- domain classification cache + LLM call (non-YouTube, non-listed sites) ----------

async function getCachedDomain(host) {
  const { domainCache } = await getLocal("domainCache");
  return (domainCache || {})[host] || null;
}

async function cacheDomain(host, classification, meta) {
  const { domainCache } = await getLocal("domainCache");
  const cache = domainCache || {};
  cache[host] = { classification, ts: Date.now(), ...meta };
  await setLocal({ domainCache: cache });
}

async function classifyDomainWithLLM(host, title) {
  const settings = await getSettings();
  if (!settings.apiKey) return "neutral";

  const system =
    "You classify a WEBSITE as PRODUCTIVE, UNPRODUCTIVE, or NEUTRAL for a " +
    "viewer whose productive activities are: AI/machine learning, computer " +
    "science, software engineering, working on personal coding or " +
    "data-science projects (e.g. GitHub, Kaggle), academic/research reading, " +
    "and job or research applications. Entertainment sites — movie/TV/anime " +
    "streaming (including free 'watch online' sites), social media feeds, " +
    "gaming, and similar leisure browsing — are UNPRODUCTIVE. General-purpose " +
    "tools with no leisure/entertainment signal (search engines, email, " +
    "docs, utilities, news) are NEUTRAL. Respond with ONLY a JSON object " +
    'like {"classification":"productive"}, {"classification":"unproductive"}, ' +
    'or {"classification":"neutral"}. No other text.';

  const userContent = `Domain: ${host}\nPage title: ${title || "(none)"}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 20,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });

    if (!resp.ok) {
      console.warn("Focus Tracker: domain classification failed", resp.status);
      return "neutral";
    }

    const data = await resp.json();
    const usage = data.usage || {};
    const cost =
      (usage.input_tokens || 0) * HAIKU_INPUT_COST_PER_TOKEN +
      (usage.output_tokens || 0) * HAIKU_OUTPUT_COST_PER_TOKEN;
    await addCost(cost);

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = text.match(
      /"classification"\s*:\s*"(productive|unproductive|neutral)"/i
    );
    return match ? match[1].toLowerCase() : "neutral";
  } catch (err) {
    console.warn("Focus Tracker: domain classification error", err);
    return "neutral";
  }
}

async function handleVideoDetected({ videoId, title, channel, description }) {
  const cached = await getCachedVideo(videoId);
  if (cached) {
    await setClassification(cached.classification, "youtube", videoId);
    return;
  }
  // Mark neutral immediately so time isn't mis-tallied while we wait on the API.
  await setClassification("neutral", "youtube", videoId);
  const classification = await classifyVideoWithLLM({
    videoId,
    title,
    channel,
    description
  });
  await cacheVideo(videoId, classification, { title, channel });
  // Only apply retroactively if we're still on the same video.
  if (state.activeVideoId === videoId) {
    await setClassification(classification, "youtube", videoId);
  }
}

// ---------- tab / navigation tracking ----------

async function updateForTab(tab) {
  if (!tab || !tab.url || !tab.url.startsWith("http")) {
    await setClassification("neutral", "idle");
    return;
  }
  if (isYouTube(tab.url)) {
    // Classification will be driven by VIDEO_DETECTED messages from the
    // content script; until one arrives, treat as neutral.
    if (state.activeDomain !== "youtube") {
      await setClassification("neutral", "youtube");
    }
    return;
  }
  const host = new URL(tab.url).hostname.replace(/^www\./, "");
  const staticClassification = classifyUrl(tab.url);
  if (staticClassification !== "neutral") {
    await setClassification(staticClassification, host);
    return;
  }

  // Not on either static list — check the domain cache, else ask the LLM.
  const cachedDomain = await getCachedDomain(host);
  if (cachedDomain) {
    await setClassification(cachedDomain.classification, host);
    return;
  }

  await setClassification("neutral", host); // hold neutral while we wait on the API
  const classification = await classifyDomainWithLLM(host, tab.title || "");
  await cacheDomain(host, classification, { title: tab.title || "" });
  // Only apply retroactively if the user is still on this domain.
  if (state.activeDomain === host) {
    await setClassification(classification, host);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

chrome.tabs.onActivated.addListener(async () => {
  const tab = await getActiveTab();
  await updateForTab(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    await updateForTab(tab);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await setClassification("neutral", "idle");
  } else {
    const tab = await getActiveTab();
    await updateForTab(tab);
  }
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "idle" || newState === "locked") {
    await setClassification("neutral", "idle");
  } else {
    const tab = await getActiveTab();
    await updateForTab(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VIDEO_DETECTED") {
    handleVideoDetected(message.payload).then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

// ---------- heartbeat: flush + budget nag ----------

chrome.alarms.create("heartbeat", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat") return;
  await flush();

  const settings = await getSettings();
  const log = await getDailyLog(todayKey());
  const budgetSec = settings.dailyBudgetMinutes * 60;

  if (log.unproductiveSec > budgetSec && state.classification === "unproductive") {
    const now = Date.now();
    const nagGapMs = settings.nagIntervalMinutes * 60 * 1000;
    if (now - state.lastNagTimestamp >= nagGapMs) {
      state.lastNagTimestamp = now;
      await persistState();
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Over your unproductive budget",
        message: `You've spent ${Math.round(log.unproductiveSec / 60)} min on unproductive stuff today (budget: ${settings.dailyBudgetMinutes} min).`,
        priority: 1
      });
    }
  }
});

// ---------- init ----------

restoreState().then(async () => {
  const tab = await getActiveTab();
  await updateForTab(tab);
});