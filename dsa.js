const ACCENT = "#34d399";
const GRID = "#26333f";
const MUTED = "#7d8b98";
const TEXT = "#e6edf3";

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayKey() {
  return dateKey(new Date());
}
function startOfDay(d) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeek(d) {
  const n = startOfDay(d);
  const dow = (n.getDay() + 6) % 7; // Monday = 0
  return addDays(n, -dow);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d) {
  return new Date(d.getFullYear(), 11, 31);
}
function WEEKDAY_LABELS() {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

let dsaLog = {};
let currentRange = "week";

async function loadLog() {
  const { dsaLog: log } = await chrome.storage.local.get("dsaLog");
  dsaLog = log || {};
}
async function saveLog() {
  await chrome.storage.local.set({ dsaLog });
}

function countFor(key) {
  return dsaLog[key] || 0;
}

function sumRange(dates) {
  return dates.reduce((acc, d) => acc + countFor(dateKey(d)), 0);
}

function buildSeries(range) {
  const today = startOfDay(new Date());
  let start, end;
  if (range === "week") {
    end = today;
    start = addDays(today, -6);
  } else if (range === "month") {
    end = today;
    start = addDays(today, -29);
  } else {
    end = today;
    start = addDays(today, -364);
  }

  const points = [];
  let cursor = start;
  while (cursor <= end) {
    const key = dateKey(cursor);
    points.push({
      date: new Date(cursor),
      key,
      value: countFor(key)
    });
    cursor = addDays(cursor, 1);
  }
  return points;
}

function niceStep(roughStep) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1))));
  const norm = roughStep / mag;
  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function labelForPoint(p, range, idx, points) {
  if (range === "week") {
    const dow = (p.date.getDay() + 6) % 7; // Monday = 0
    return WEEKDAY_LABELS()[dow];
  }
  if (range === "month") {
    const day = p.date.getDate();
    const isLast = idx === points.length - 1;
    if (day === 1 || day % 5 === 0 || isLast) return String(day);
    return "";
  }
  // year: label at the first day of each month
  if (p.date.getDate() === 1) return MONTH_LABELS[p.date.getMonth()];
  return "";
}

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
let layout = null; // computed on draw, used for hover hit-testing

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawChart(range) {
  const { width, height } = resizeCanvas();
  ctx.clearRect(0, 0, width, height);

  const points = buildSeries(range);
  const padLeft = 38;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = points.map((p) => p.value).filter((v) => v !== null);
  const maxVal = values.length ? Math.max(...values) : 0;
  const step = niceStep(Math.max(maxVal, 4) / 4);
  const yMax = Math.max(step * 4, step);
  const tickCount = Math.round(yMax / step);

  // gridlines + y labels
  ctx.strokeStyle = GRID;
  ctx.fillStyle = MUTED;
  ctx.font = "11px 'SF Mono', Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  for (let i = 0; i <= tickCount; i++) {
    const val = step * i;
    const y = padTop + plotH - (val / yMax) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
    ctx.fillText(String(val), padLeft - 8, y);
  }

  // x labels
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const n = points.length;
  const xFor = (i) => padLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  points.forEach((p, i) => {
    const label = labelForPoint(p, range, i, points);
    if (label) {
      ctx.fillText(label, xFor(i), padTop + plotH + 8);
    }
  });

  // line
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let drawing = false;
  points.forEach((p, i) => {
    const x = xFor(i);
    if (p.value === null) {
      drawing = false;
      return;
    }
    const y = padTop + plotH - (p.value / yMax) * plotH;
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  layout = { points, xFor, padTop, plotH, yMax, width, height };
}

function handleMove(evt) {
  if (!layout) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = evt.clientX - rect.left;
  const { points, xFor, padTop, plotH, yMax } = layout;

  let nearest = 0;
  let nearestDist = Infinity;
  points.forEach((p, i) => {
    const x = xFor(i);
    const d = Math.abs(x - mouseX);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = i;
    }
  });

  const p = points[nearest];
  if (!p || p.value === null) {
    tooltip.classList.remove("show");
    return;
  }
  const x = xFor(nearest);
  const y = padTop + plotH - (p.value / yMax) * plotH;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.innerHTML = `<span class="t-date">${p.key}</span><strong>${p.value}</strong>`;
  tooltip.classList.add("show");

  redrawWithMarker(x, y);
}

function redrawWithMarker(x, y) {
  drawChart(currentRange);
  ctx.beginPath();
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.moveTo(x, layout.padTop);
  ctx.lineTo(x, layout.padTop + layout.plotH);
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = ACCENT;
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0f1720";
  ctx.lineWidth = 2;
  ctx.stroke();
}

canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("mouseleave", () => {
  tooltip.classList.remove("show");
  drawChart(currentRange);
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    drawChart(currentRange);
  });
});

window.addEventListener("resize", () => drawChart(currentRange));

function renderStats() {
  const today = startOfDay(new Date());
  document.getElementById("statToday").textContent = String(countFor(todayKey()));

  const weekDates = [];
  let cursor = startOfWeek(today);
  for (let i = 0; i < 7; i++) {
    weekDates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  document.getElementById("statWeek").textContent = String(sumRange(weekDates));

  const monthDates = [];
  cursor = startOfMonth(today);
  const mEnd = endOfMonth(today);
  while (cursor <= mEnd) {
    monthDates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  document.getElementById("statMonth").textContent = String(sumRange(monthDates));

  const yearDates = [];
  cursor = startOfYear(today);
  const yEnd = endOfYear(today);
  while (cursor <= yEnd) {
    yearDates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  document.getElementById("statYear").textContent = String(sumRange(yearDates));
}

function loadEntryForDate(key) {
  document.getElementById("entryCount").value = countFor(key);
}

async function init() {
  await loadLog();

  const dateInput = document.getElementById("entryDate");
  dateInput.value = todayKey();
  loadEntryForDate(todayKey());

  dateInput.addEventListener("change", () => {
    loadEntryForDate(dateInput.value || todayKey());
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    const key = dateInput.value || todayKey();
    const count = Math.max(0, Number(document.getElementById("entryCount").value) || 0);
    dsaLog[key] = count;
    await saveLog();

    const msg = document.getElementById("savedMsg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 1500);

    renderStats();
    drawChart(currentRange);
  });

  renderStats();
  drawChart(currentRange);
}

init();
