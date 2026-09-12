const DEFAULT_SETTINGS = {
  apiKey: "",
  dailyBudgetMinutes: 60,
  nagIntervalMinutes: 10,
  monthlyCostWarningUSD: 1.0
};

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function render() {
  const { dailyLog, settings, costLog, breakdownLog } = await chrome.storage.local.get([
    "dailyLog",
    "settings",
    "costLog",
    "breakdownLog"
  ]);
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const entry = (dailyLog || {})[todayKey()] || {
    productiveSec: 0,
    unproductiveSec: 0,
    neutralSec: 0
  };

  const mins = (s) => Math.round(s / 60);

  document.getElementById("productiveVal").textContent = `${mins(entry.productiveSec)}m`;
  document.getElementById("unproductiveVal").textContent = `${mins(entry.unproductiveSec)}m`;
  document.getElementById("neutralVal").textContent = `${mins(entry.neutralSec)}m`;

  const budgetMin = merged.dailyBudgetMinutes;
  const usedMin = mins(entry.unproductiveSec);
  const pct = Math.min(100, Math.round((usedMin / Math.max(1, budgetMin)) * 100));
  document.getElementById("budgetFill").style.width = `${pct}%`;
  document.getElementById("budgetCaption").textContent =
    `${usedMin} / ${budgetMin} min unproductive today`;

  const monthCost = (costLog || {})[monthKey()] || 0;
  document.getElementById("costVal").textContent = `$${monthCost.toFixed(4)}`;

  document.getElementById("dailyBudgetMinutes").value = merged.dailyBudgetMinutes;
  document.getElementById("nagIntervalMinutes").value = merged.nagIntervalMinutes;

  const todayBreakdown = ((breakdownLog || {})[todayKey()] || {}).unproductive || {};
  const top = Object.entries(todayBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const list = document.getElementById("topUnproductive");
  const emptyMsg = document.getElementById("topUnproductiveEmpty");
  list.innerHTML = "";
  if (top.length === 0) {
    emptyMsg.classList.add("show");
  } else {
    emptyMsg.classList.remove("show");
    for (const [label, seconds] of top) {
      const li = document.createElement("li");
      const labelSpan = document.createElement("span");
      labelSpan.className = "item-label";
      labelSpan.textContent = label;
      labelSpan.title = label; // full text on hover, since it's truncated visually
      const timeSpan = document.createElement("span");
      timeSpan.className = "item-time";
      timeSpan.textContent = `${mins(seconds)}m`;
      li.appendChild(labelSpan);
      li.appendChild(timeSpan);
      list.appendChild(li);
    }
  }
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const { settings: existing } = await chrome.storage.local.get("settings");
  const settings = {
    apiKey: (existing || {}).apiKey || "",
    dailyBudgetMinutes: Number(document.getElementById("dailyBudgetMinutes").value) || 60,
    nagIntervalMinutes: Number(document.getElementById("nagIntervalMinutes").value) || 10,
    monthlyCostWarningUSD: DEFAULT_SETTINGS.monthlyCostWarningUSD
  };
  await chrome.storage.local.set({ settings });
  const msg = document.getElementById("savedMsg");
  msg.classList.add("show");
  setTimeout(() => msg.classList.remove("show"), 1500);
  render();
});

render();
// Refresh live while the popup is open.
setInterval(render, 5000);