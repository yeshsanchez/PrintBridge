# PrintBridge — Turn a MacBook into a Wireless Print Server for Canon PIXMA G1010

## 1. Project Summary

**Problem:** The Canon PIXMA G1010 is a USB-only inkjet printer with no built-in wi-fi.

**Solution:** Build a lightweight background service that runs on a MacBook Pro (Intel, i7, 2018, macOS) which is physically connected to the G1010 over USB. The service exposes a simple local-network API/web UI that lets any device on the same wi-fi network (phone, other laptops, etc.) send a print job to the Mac, which forwards it to the printer via macOS's built-in CUPS printing system.

**Core insight:** We do NOT write a printer driver. Canon's official macOS driver + CUPS already know how to talk to the G1010. Our app's only job is to receive a file over HTTP and hand it to the `lp` command-line tool, which routes it through CUPS to the printer.

---

## 2. Goals (MVP)

- [ ] G1010 installed and printing normally from the Mac via Canon's official driver (manual prerequisite, not built by the agent, but the agent should document how to verify it via `lpstat -p`).
- [ ] Background Node.js server running on the Mac that:
  - [ ] Accepts a file upload (PDF, JPG, PNG) via `POST /print`
  - [ ] Sends it to the CUPS print queue using `lp -d <queue_name> <file>`
  - [ ] Returns a job ID / success status
  - [ ] Exposes `GET /status` to check queue and job status via `lpstat`
  - [ ] Exposes `GET /health` for a basic uptime/reachability check
- [ ] A minimal web page (served by the same server) with a file picker + "Print" button, so any device with a browser can use it with zero app install.
- [ ] Server auto-starts on Mac login and auto-restarts on crash via a macOS LaunchAgent.
- [ ] Server is reachable on the local network via a friendly hostname (Bonjour/mDNS, e.g. `printbridge.local`) instead of a hardcoded IP.
- [ ] Basic shared-secret auth (a simple API key/token in a header or query param) so random devices on the wi-fi can't spam the printer.

## 3. Stretch Goals (post-MVP, do not build unless MVP is done and confirmed working)

- [ ] Simple queue view showing recent jobs with status (pending/printing/done/error)
- [ ] Job history persisted to a local SQLite or JSON file
- [ ] Print options in the UI: copies, page range, color/grayscale, paper size
- [ ] Push notification / webhook when a job finishes or fails
- [ ] Companion mobile-friendly PWA with "Share to PrintBridge" support
- [ ] Wake-on-demand research: whether Bonjour sleep-proxy can wake the Mac from sleep for incoming jobs

---

## 4. Architecture

```
[Any device on wi-fi]
   |  HTTP (upload file / view status)
   v
[MacBook Pro — PrintBridge Node.js server]
   |  shells out to CUPS CLI (lp / lpstat)
   v
[macOS CUPS print queue for Canon G1010]
   |  USB
   v
[Canon PIXMA G1010]
```

- The Mac is the single point of failure/host — that's expected and fine for this project's scope (home/small studio use, not enterprise).
- No custom printer protocol work needed. CUPS + Canon's driver handle that layer entirely.
- Auth is intentionally simple (shared token) since this is a trusted local network, not public internet facing.

---

## 5. Tech Stack

- **Runtime:** Node.js (LTS) — matches existing JS/React Native background of the project owner
- **Server framework:** Express
- **File uploads:** `multer`
- **Shelling out to CUPS:** Node's built-in `child_process` (`execFile`, not `exec`, to avoid shell injection issues with filenames)
- **Process management / autostart:** macOS LaunchAgent (`launchd`), not `pm2` or `forever` — this should survive reboots without extra dependencies
- **Local discovery:** `bonjour-service` (npm package) to advertise an mDNS service, OR rely on manual LaunchAgent + router DHCP reservation as a fallback if mDNS proves finicky
- **Frontend:** a single static HTML page (no framework needed for MVP) served by Express — plain HTML/CSS/vanilla JS file picker + fetch() call to `/print`
- **Env/config:** `.env` file for the shared auth token, CUPS queue name, and port

---

## 6. API Spec (MVP)

### `POST /print`
- **Auth:** header `x-api-key: <token>` required
- **Body:** `multipart/form-data`, field name `file`
- **Accepted types:** `application/pdf`, `image/jpeg`, `image/png`
- **Behavior:** save to a temp dir, run `lp -d <queue_name> <tempfile>`, parse the CUPS job ID from output
- **Response:** `{ "jobId": "G1010-123", "status": "queued" }`
- **Errors:** 400 for bad/missing file, 401 for bad/missing token, 500 for CUPS/lp failure (include stderr in dev mode only)

### `GET /status`
- **Auth:** same header
- **Behavior:** run `lpstat -o <queue_name>` and parse into structured JSON
- **Response:** `{ "queue": "G1010", "jobs": [ { "jobId": "...", "user": "...", "size": "...", "submittedAt": "..." } ] }`

### `GET /health`
- **Auth:** none (used for quick reachability checks)
- **Response:** `{ "status": "ok", "printer": "Canon PIXMA G1010", "uptime": <seconds> }`

### `GET /` 
- Serves the static print-upload web page

---

## 7. Project Structure (suggested)

```
printbridge/
  server/
    index.js              # Express app entrypoint
    routes/
      print.js
      status.js
      health.js
    lib/
      cups.js              # wraps `lp` / `lpstat` calls via execFile
      auth.js               # simple middleware checking x-api-key
    public/
      index.html            # upload UI
      style.css
      app.js
    .env.example
    package.json
  launchd/
    com.yeshua.printbridge.plist   # LaunchAgent definition
  README.md                # setup + troubleshooting doc (see section 9)
```

---

## 8. Implementation Notes / Constraints

- **Never use `exec()` with unsanitized filenames** — always `execFile()` with an args array to avoid shell injection, since uploaded filenames are user-controlled.
- **Validate file MIME type and extension** before ever touching the filesystem or CUPS.
- **Clean up temp files** after the job is submitted (or after a short delay) — don't let uploads pile up.
- **CUPS queue name is not necessarily "G1010"** — the agent must instruct the user to run `lpstat -p` first to find the actual queue name registered by Canon's driver, and put it in `.env` as `CUPS_QUEUE_NAME`.
- **Do not attempt to write a raw printer protocol.** If `lp` and CUPS aren't working for a file type, the fix is format conversion (e.g. convert to PDF first) — not talking to the printer directly.
- **Keep dependencies minimal.** This runs as a background utility on a personal laptop — avoid heavy frameworks.

---

## 9. Deliverables

1. Working Node.js server matching the API spec above.
2. `README.md` covering:
   - How to install Canon's PIXMA G1010 driver on macOS
   - How to find the CUPS queue name (`lpstat -p`)
   - How to configure `.env`
   - How to install the LaunchAgent (`launchctl load ~/Library/LaunchAgents/com.yeshua.printbridge.plist`)
   - How to enable "Prevent automatic sleeping on power adapter when display is off" in macOS Settings, and why it matters
   - How to test end-to-end from a second device on the same wi-fi
3. The LaunchAgent `.plist` file, pre-filled with correct paths, set to `KeepAlive: true` and `RunAtLoad: true`, logging stdout/stderr to a log file for debugging.
4. A minimal but clean single-page upload UI (doesn't need to be fancy — function over form for MVP).

---

## 10. Explicitly Out of Scope (for now)

- Remote (outside-LAN) printing / internet-facing exposure
- User accounts / multi-user permission tiers
- Printing directly to raw printer language (ESC/POS, PCL, etc.) — CUPS handles this
- Supporting printers other than the G1010
- Native mobile app — a browser-based page is sufficient for MVP
