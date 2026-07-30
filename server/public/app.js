const $ = (id) => document.getElementById(id);
const tokenInput = $("token");
const fileInput = $("file");
const result = $("result");
const jobs = $("jobs");

// Persist the token locally so the user only types it once per device.
tokenInput.value = localStorage.getItem("printbridge_token") || "";
tokenInput.addEventListener("change", () =>
  localStorage.setItem("printbridge_token", tokenInput.value.trim()),
);

function show(msg, kind) {
  result.hidden = false;
  result.textContent = msg;
  result.className = `result ${kind || ""}`;
}

$("printBtn").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const file = fileInput.files[0];
  if (!token) return show("Enter your API key first.", "error");
  if (!file) return show("Choose a file to print.", "error");

  const body = new FormData();
  body.append("file", file);
  show("Submitting…");
  try {
    const res = await fetch("/print", {
      method: "POST",
      headers: { "x-api-key": token },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
    show(`Queued ✓  job ${data.jobId}`, "ok");
    refreshQueue();
  } catch (e) {
    show(`Failed: ${e.message}`, "error");
  }
});

$("refreshBtn").addEventListener("click", refreshQueue);

async function refreshQueue() {
  const token = tokenInput.value.trim();
  if (!token) {
    jobs.innerHTML = '<li class="muted">Enter API key to view the queue.</li>';
    return;
  }
  try {
    const res = await fetch("/status", { headers: { "x-api-key": token } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (!data.jobs.length) {
      jobs.innerHTML = '<li class="muted">No jobs in queue.</li>';
      return;
    }
    jobs.innerHTML = data.jobs
      .map(
        (j) =>
          `<li><strong>${j.jobId}</strong> <span class="muted">${j.user || ""} · ${j.submittedAt || ""}</span></li>`,
      )
      .join("");
  } catch (e) {
    jobs.innerHTML = `<li class="error">${e.message}</li>`;
  }
}

refreshQueue();
