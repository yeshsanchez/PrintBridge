# PrintBridge

Turn a USB-connected MacBook into a wireless print server for the **Canon PIXMA G1010**.

PrintBridge is a small Node.js service that runs on the Mac physically connected to the
G1010 over USB. It exposes a local-network HTTP API + web page so any device on the same
wi-fi (phone, laptop, tablet) can upload a file and print it. PrintBridge does **not** talk
to the printer directly — it hands files to macOS **CUPS** (`lp` / `lpstat`), which Canon's
official driver already knows how to drive.

```
[phone / laptop] --HTTP--> [Mac: PrintBridge] --lp/lpstat--> [CUPS queue] --USB--> [Canon G1010]
```

---

## Prerequisites

- macOS with Node.js ≥ 18 (developed on Node 24).
- The Canon PIXMA G1010 connected to the Mac over USB.

### 1. Install Canon's macOS driver and confirm the printer works

1. Download and install the official **Canon PIXMA G1010 macOS driver** from Canon's support
   site, then add the printer in **System Settings → Printers & Scanners**.
2. Print a test page from any Mac app (e.g. Preview) to confirm the printer works normally.
   PrintBridge only forwards to CUPS — if the Mac can't print, PrintBridge can't either.

### 2. Find the CUPS queue name

The queue name Canon registers is **not** necessarily `G1010`. List your queues:

```bash
lpstat -p
```

You'll see something like `printer Canon_G1010_series is idle.` — the token after
`printer` (e.g. `Canon_G1010_series`) is your **queue name**. Put it in `.env` below.

> If this prints `No destinations added`, the driver/printer isn't set up yet — go back to step 1.

---

## Install & configure

```bash
cd "PrintBridge"
npm install
cp .env.example .env
```

Edit `.env`:

```ini
PORT=3000
CUPS_QUEUE_NAME=Canon_G1010_series      # from `lpstat -p`
API_KEY=paste-a-long-random-token       # see below
NODE_ENV=production
```

Generate a strong shared token:

```bash
openssl rand -hex 24
```

Run it:

```bash
npm start
```

Open `http://localhost:3000`, paste the API key, pick a file, and print.

---

## API

| Endpoint      | Auth              | Description                                            |
| ------------- | ----------------- | ----------------------------------------------------- |
| `POST /print` | `x-api-key` header | `multipart/form-data`, field `file` (PDF/JPG/PNG). Returns `{ jobId, status }`. |
| `GET /status` | `x-api-key` header | Current queue jobs: `{ queue, jobs: [...] }`.         |
| `GET /health` | none              | `{ status, printer, queue, printerReachable, uptime }`. |
| `GET /`       | none              | The upload web page.                                  |

The token may also be passed as `?token=...` for convenience in a browser.

Quick check from the terminal:

```bash
curl http://localhost:3000/health
curl -H "x-api-key: YOUR_TOKEN" http://localhost:3000/status
curl -H "x-api-key: YOUR_TOKEN" -F "file=@/path/to/doc.pdf" http://localhost:3000/print
```

---

## Run automatically at login (LaunchAgent)

`launchd/com.yeshua.printbridge.plist` starts PrintBridge at login and restarts it if it
crashes. The paths inside it assume this project lives at
`/Users/yesh/programming stuffs/PrintBridge` and node is at `/usr/local/bin/node`
(check with `which node`) — adjust if yours differ.

```bash
# Copy (or symlink) the plist into your LaunchAgents folder:
cp "launchd/com.yeshua.printbridge.plist" ~/Library/LaunchAgents/

# Load it:
launchctl load ~/Library/LaunchAgents/com.yeshua.printbridge.plist
```

Logs are written to `~/Library/Logs/printbridge.out.log` and `printbridge.err.log`.

To stop / reload after editing:

```bash
launchctl unload ~/Library/LaunchAgents/com.yeshua.printbridge.plist
launchctl load   ~/Library/LaunchAgents/com.yeshua.printbridge.plist
```

### Keep the Mac awake so it can receive jobs

A sleeping Mac can't accept print jobs. In **System Settings → Displays → Advanced** (or
**Battery → Options**), enable **"Prevent automatic sleeping on power adapter when the
display is off."** Keep the lid open or use clamshell mode with external power. Otherwise
devices will get connection-refused errors whenever the Mac has slept.

---

## Reaching it from other devices

- The Mac is reachable on the LAN at **`http://<computer-name>.local:3000`**. Find the name
  with `scutil --get LocalHostName` (this machine: `Yeshuas-MacBook-Pro` → `Yeshuas-MacBook-Pro.local`).
- PrintBridge also advertises a **Bonjour** HTTP service named *PrintBridge*, so it shows up
  in Bonjour-aware browsers/apps.
- Want a nicer name like `printbridge.local`? Either rename the Mac's local hostname in
  **System Settings → General → Sharing → Local hostname**, or reserve a fixed IP for the Mac
  in your router's DHCP settings and bookmark `http://<that-ip>:3000`.

### End-to-end test from a second device

1. Connect the second device (phone/laptop) to the **same wi-fi**.
2. Open `http://<computer-name>.local:3000` (or the Mac's IP).
3. Enter the API key, choose a PDF/JPG/PNG, tap **Print**.
4. Watch the **Queue** section update, and confirm the page prints on the G1010.

---

## Troubleshooting

- **`Missing required env var` on startup** — fill in `CUPS_QUEUE_NAME` and `API_KEY` in `.env`.
- **`500 Failed to submit print job`** — the queue name is wrong or the printer is offline.
  Re-run `lpstat -p`, check the Mac can print, and verify `CUPS_QUEUE_NAME` matches exactly.
- **`401 Invalid or missing API key`** — the `x-api-key` header doesn't match `API_KEY` in `.env`.
- **Can't reach it from another device** — confirm same wi-fi, the Mac isn't asleep, and try the
  raw IP. Some networks isolate clients ("AP/client isolation"); disable it on the router.
- **Wrong file prints as garbage** — make sure you're sending PDF/JPG/PNG. Convert exotic
  formats to PDF first; don't send raw printer languages.

---

## Scope

**In scope (MVP):** upload → print via CUPS, queue/status, health check, token auth, Bonjour
discovery, autostart. **Out of scope:** internet-facing/remote printing, user accounts, raw
printer protocols, printers other than the G1010, and a native mobile app.
