const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const token = () => (localStorage.getItem("pb_token") || "").trim();

const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const dzEmpty = $("#dzEmpty");
const dzList = $("#dzList");
const fileListEl = $("#fileList");
const listCount = $("#listCount");
const printBtn = $("#printBtn");
const jobsEl = $("#jobs");
const toast = $("#toast");
const tokenInput = $("#tokenInput");
const settings = $("#settings");
const statusDot = $("#statusDot");

let files = []; // selected File objects

/* ---------- Greeting ---------- */
(function greet() {
  const h = new Date().getHours();
  $("#greet").textContent =
    h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
})();

/* ---------- Settings sheet ---------- */
tokenInput.value = token();
$("#settingsBtn").addEventListener("click", () => settings.classList.add("open"));
$("#closeSettings").addEventListener("click", () => settings.classList.remove("open"));
settings.addEventListener("click", (e) => {
  if (e.target === settings) settings.classList.remove("open");
});
$("#saveToken").addEventListener("click", () => {
  localStorage.setItem("pb_token", tokenInput.value.trim());
  settings.classList.remove("open");
  showToast("Saved", "ok");
  checkHealth();
  refreshQueue();
  startPolling();
});

/* ---------- File picking (multi) ---------- */
function openPicker(kind) {
  if (kind === "camera") {
    fileInput.setAttribute("accept", "image/*");
    fileInput.setAttribute("capture", "environment");
    fileInput.removeAttribute("multiple");
  } else {
    fileInput.setAttribute(
      "accept",
      kind === "photos" ? "image/*" : "application/pdf,image/jpeg,image/png",
    );
    fileInput.removeAttribute("capture");
    fileInput.setAttribute("multiple", "");
  }
  fileInput.click();
}
$$("[data-pick]").forEach((b) =>
  b.addEventListener("click", () => openPicker(b.dataset.pick)),
);
dzEmpty.addEventListener("click", () => openPicker("files"));
$("#addMore").addEventListener("click", () => openPicker("files"));
$("#clearAll").addEventListener("click", () => {
  files = [];
  fileInput.value = "";
  renderFiles();
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

// Drag & drop (desktop)
["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  }),
);
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

const ALLOWED_EXT = /\.(pdf|jpe?g|png)$/i;
const MAX = 25 * 1024 * 1024;

function addFiles(list) {
  for (const f of list) {
    if (!ALLOWED_EXT.test(f.name)) {
      showToast(`Skipped ${f.name} — only PDF/JPG/PNG`, "error");
      continue;
    }
    if (f.size > MAX) {
      showToast(`Skipped ${f.name} — over 25 MB`, "error");
      continue;
    }
    if (files.some((x) => x.name === f.name && x.size === f.size)) continue; // dedupe
    files.push(f);
  }
  renderFiles();
}

function removeFile(i) {
  files.splice(i, 1);
  renderFiles();
}

function humanSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

const docIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const xIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

function renderFiles() {
  if (!files.length) {
    dzEmpty.hidden = false;
    dzList.hidden = true;
    printBtn.disabled = true;
    printBtn.textContent = "Print";
    return;
  }
  dzEmpty.hidden = true;
  dzList.hidden = false;
  listCount.textContent = files.length === 1 ? "1 file" : `${files.length} files`;
  fileListEl.innerHTML = files
    .map(
      (f, i) => `<li class="file-row">
        <span class="file-ic">${docIcon}</span>
        <span class="file-text"><span class="file-name">${esc(f.name)}</span><span class="file-size">${humanSize(f.size)}</span></span>
        <button class="file-clear" data-i="${i}" aria-label="Remove">${xIcon}</button>
      </li>`,
    )
    .join("");
  fileListEl.querySelectorAll(".file-clear").forEach((b) =>
    b.addEventListener("click", () => removeFile(Number(b.dataset.i))),
  );
  printBtn.disabled = false;
  printBtn.textContent = files.length === 1 ? "Print" : `Print ${files.length} files`;
}

/* ---------- Print all ---------- */
printBtn.addEventListener("click", async () => {
  if (!token()) {
    showToast("Add your API key in settings", "error");
    settings.classList.add("open");
    return;
  }
  if (!files.length) return;

  printBtn.disabled = true;
  const total = files.length;
  let ok = 0;
  const errors = [];
  for (let i = 0; i < total; i++) {
    printBtn.textContent = total === 1 ? "Sending…" : `Printing ${i + 1}/${total}…`;
    const body = new FormData();
    body.append("file", files[i]);
    try {
      const res = await fetch("/print", {
        method: "POST",
        headers: { "x-api-key": token() },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
      ok++;
    } catch (e) {
      errors.push(`${files[i].name}: ${e.message}`);
    }
    refreshQueue();
  }
  if (errors.length) showToast(`${ok}/${total} sent · ${errors.length} failed`, "error");
  else showToast(total === 1 ? "Queued ✓" : `Queued ${total} files ✓`, "ok");
  files = [];
  renderFiles();
  refreshQueue();
});

/* ---------- Queue (live) ---------- */
$("#refreshBtn").addEventListener("click", refreshQueue);
let fetching = false;

async function refreshQueue() {
  if (!token()) {
    jobsEl.innerHTML = emptyRow("Add your API key to see the queue");
    return;
  }
  if (fetching) return;
  fetching = true;
  try {
    const res = await fetch("/status", { headers: { "x-api-key": token() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (!data.jobs.length) {
      jobsEl.innerHTML = emptyRow("No jobs in the queue");
      return;
    }
    jobsEl.innerHTML = data.jobs.map(jobRow).join("");
  } catch (e) {
    jobsEl.innerHTML = emptyRow(e.message, true);
  } finally {
    fetching = false;
  }
}

function jobRow(j) {
  const printing = j.state === "printing";
  const size = sizeMaybe(j.size);
  const sub = [j.user, size].filter(Boolean).join(" · ") || "queued";
  return `<li class="job">
    <span class="job-pos ${printing ? "live" : ""}">${printing ? "▶" : j.position}</span>
    <span class="job-main"><span class="job-id">${esc(j.jobId || "job")}</span><span class="job-sub">${esc(sub)}</span></span>
    <span class="job-status ${printing ? "printing" : "pending"}">${printing ? '<span class="live-dot"></span>Printing' : "Pending"}</span>
  </li>`;
}

function sizeMaybe(s) {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : humanSize(n);
}

function emptyRow(msg, err) {
  return `<li class="job empty ${err ? "err" : ""}">${esc(msg)}</li>`;
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/* ---------- Live polling (only while the tab is visible) ---------- */
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") refreshQueue();
  }, 3000);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshQueue();
    startPolling();
  } else {
    stopPolling();
  }
});

/* ---------- Health ---------- */
async function checkHealth() {
  try {
    const res = await fetch("/health");
    const d = await res.json();
    statusDot.className = "dot " + (d.printerReachable ? "ok" : "warn");
    statusDot.title = d.printerReachable
      ? "Printer ready"
      : "Server up · printer not detected";
  } catch {
    statusDot.className = "dot off";
    statusDot.title = "Server unreachable";
  }
}

/* ---------- Toast ---------- */
let toastT;
function showToast(msg, kind) {
  toast.textContent = msg;
  toast.className = "toast show " + (kind || "");
  clearTimeout(toastT);
  toastT = setTimeout(() => (toast.className = "toast"), 3200);
}

/* ---------- Init ---------- */
renderFiles();
checkHealth();
refreshQueue();
startPolling();

// Service worker only registers in a secure context (HTTPS / localhost).
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
