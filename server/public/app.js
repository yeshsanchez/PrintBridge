const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const token = () => (localStorage.getItem("pb_token") || "").trim();

const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const fileMeta = $("#fileMeta");
const printBtn = $("#printBtn");
const jobsEl = $("#jobs");
const toast = $("#toast");
const tokenInput = $("#tokenInput");
const settings = $("#settings");
const statusDot = $("#statusDot");

let selectedFile = null;

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
});

/* ---------- File picking ---------- */
$$("[data-pick]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const kind = btn.dataset.pick;
    if (kind === "camera") {
      fileInput.setAttribute("accept", "image/*");
      fileInput.setAttribute("capture", "environment");
    } else if (kind === "photos") {
      fileInput.setAttribute("accept", "image/*");
      fileInput.removeAttribute("capture");
    } else {
      fileInput.setAttribute("accept", "application/pdf,image/jpeg,image/png");
      fileInput.removeAttribute("capture");
    }
    fileInput.click();
  }),
);

dropzone.addEventListener("click", (e) => {
  if (e.target.closest("#fileMeta")) return; // don't reopen when interacting with the chip
  fileInput.setAttribute("accept", "application/pdf,image/jpeg,image/png");
  fileInput.removeAttribute("capture");
  fileInput.click();
});

fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

$("#clearFile").addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.value = "";
  setFile(null);
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
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});

function humanSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function setFile(file) {
  selectedFile = file || null;
  const empty = dropzone.querySelector(".dz-empty");
  if (!selectedFile) {
    fileMeta.hidden = true;
    empty.hidden = false;
    dropzone.classList.remove("has-file");
    printBtn.disabled = true;
    return;
  }
  $("#fileName").textContent = selectedFile.name;
  $("#fileSize").textContent = humanSize(selectedFile.size);
  fileMeta.hidden = false;
  empty.hidden = true;
  dropzone.classList.add("has-file");
  printBtn.disabled = false;
}

/* ---------- Print ---------- */
printBtn.addEventListener("click", async () => {
  if (!token()) {
    showToast("Add your API key in settings", "error");
    settings.classList.add("open");
    return;
  }
  if (!selectedFile) return showToast("Choose a file first", "error");

  const body = new FormData();
  body.append("file", selectedFile);
  printBtn.disabled = true;
  printBtn.textContent = "Sending…";
  try {
    const res = await fetch("/print", {
      method: "POST",
      headers: { "x-api-key": token() },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
    showToast(`Queued · job ${data.jobId}`, "ok");
    fileInput.value = "";
    setFile(null);
    refreshQueue();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    printBtn.textContent = "Print";
    printBtn.disabled = !selectedFile;
  }
});

/* ---------- Queue ---------- */
$("#refreshBtn").addEventListener("click", refreshQueue);

async function refreshQueue() {
  if (!token()) {
    jobsEl.innerHTML = emptyRow("Add your API key to see the queue");
    return;
  }
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
  }
}

function jobRow(j) {
  const sub = [j.user, j.submittedAt].filter(Boolean).join(" · ") || "queued";
  return `<li class="job">
    <span class="job-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg></span>
    <span class="job-main"><span class="job-id">${esc(j.jobId || "job")}</span><span class="job-sub">${esc(sub)}</span></span>
    <span class="job-status">Printing</span>
  </li>`;
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

/* ---------- Init ---------- */
setFile(null);
checkHealth();
refreshQueue();

// Service worker only registers in a secure context (HTTPS / localhost);
// harmless no-op over a plain-http LAN address.
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
