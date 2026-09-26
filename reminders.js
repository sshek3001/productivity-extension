let reminders = [];
let editingId = null;

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

    const isEditing = editingId === r.id;

    const subjectTd = document.createElement("td");
    const dueTd = document.createElement("td");

    if (isEditing) {
      const subjectInput = document.createElement("input");
      subjectInput.type = "text";
      subjectInput.className = "edit-input";
      subjectInput.value = r.subject;
      subjectTd.appendChild(subjectInput);

      const dueInput = document.createElement("input");
      dueInput.type = "date";
      dueInput.className = "edit-input";
      dueInput.value = r.due || "";
      dueTd.appendChild(dueInput);

      subjectTd._input = subjectInput;
      dueTd._input = dueInput;
    } else {
      subjectTd.textContent = r.subject;
      dueTd.textContent = formatDue(r.due);
    }

    const submittedTd = document.createElement("td");
    submittedTd.className = "col-submitted";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!r.submitted;
    checkbox.disabled = isEditing;
    checkbox.addEventListener("change", () => toggleSubmitted(r.id, checkbox.checked));
    submittedTd.appendChild(checkbox);

    const actionsTd = document.createElement("td");
    actionsTd.className = "col-actions";

    if (isEditing) {
      const saveBtn = document.createElement("button");
      saveBtn.className = "edit-btn";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () =>
        commitEdit(r.id, subjectTd._input.value, dueTd._input.value)
      );

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "delete-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingId = null;
        render();
      });

      actionsTd.append(saveBtn, cancelBtn);
    } else {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editingId = r.id;
        render();
      });

      const delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteReminder(r.id));

      actionsTd.append(editBtn, delBtn);
    }

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

async function commitEdit(id, subject, due) {
  const trimmed = subject.trim();
  if (!trimmed) return;
  const r = reminders.find((x) => x.id === id);
  if (!r) return;
  r.subject = trimmed;
  r.due = due;
  editingId = null;
  await saveReminders();
  render();
  flashSaved();
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
