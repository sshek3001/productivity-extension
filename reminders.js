let reminders = [];

async function loadReminders() {
  const { reminders: list } = await chrome.storage.local.get("reminders");
  reminders = list || [];
}

async function saveReminders() {
  await chrome.storage.local.set({ reminders });
}

function flashSaved() {
  const msg = document.getElementById("savedMsg");
  msg.classList.add("show");
  setTimeout(() => msg.classList.remove("show"), 1200);
}

function formatDue(dueStr) {
  if (!dueStr) return "—";
  const d = new Date(dueStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dueStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function render() {
  const body = document.getElementById("remindersBody");
  const emptyMsg = document.getElementById("emptyMsg");
  body.innerHTML = "";

  if (reminders.length === 0) {
    emptyMsg.classList.remove("hide");
    return;
  }
  emptyMsg.classList.add("hide");

  const sorted = [...reminders].sort((a, b) => (a.due || "").localeCompare(b.due || ""));

  for (const r of sorted) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    if (r.submitted) tr.classList.add("done");

    const subjectTd = document.createElement("td");
    subjectTd.textContent = r.subject;

    const dueTd = document.createElement("td");
    dueTd.textContent = formatDue(r.due);

    const submittedTd = document.createElement("td");
    submittedTd.className = "col-submitted";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!r.submitted;
    checkbox.addEventListener("change", () => toggleSubmitted(r.id, checkbox.checked));
    submittedTd.appendChild(checkbox);

    const actionsTd = document.createElement("td");
    actionsTd.className = "col-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteReminder(r.id));
    actionsTd.appendChild(delBtn);

    tr.append(subjectTd, dueTd, submittedTd, actionsTd);
    body.appendChild(tr);
  }
}

async function addReminder() {
  const subjectInput = document.getElementById("entrySubject");
  const dueInput = document.getElementById("entryDue");
  const subject = subjectInput.value.trim();
  const due = dueInput.value;

  if (!subject) return;

  reminders.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject,
    due,
    submitted: false,
  });

  await saveReminders();
  render();
  flashSaved();

  subjectInput.value = "";
  dueInput.value = "";
  subjectInput.focus();
}

async function toggleSubmitted(id, submitted) {
  const r = reminders.find((x) => x.id === id);
  if (!r) return;
  r.submitted = submitted;
  await saveReminders();
  render();
}

async function deleteReminder(id) {
  reminders = reminders.filter((x) => x.id !== id);
  await saveReminders();
  render();
}

document.getElementById("addBtn").addEventListener("click", addReminder);
document.getElementById("entrySubject").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addReminder();
});
document.getElementById("entryDue").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addReminder();
});

(async function init() {
  await loadReminders();
  render();
})();
