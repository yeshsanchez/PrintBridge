import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Bonjour } from 'bonjour-service';

import healthRouter from './routes/health.js';
import statusRouter from './routes/status.js';
import printRouter from './routes/print.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env from the project root regardless of the working directory.
dotenv.config({ path: path.join(ROOT, '.env') });

const PORT = parseInt(process.env.PORT || '3000', 10);

// Fail loud if required config is missing.
for (const name of ['API_KEY', 'CUPS_QUEUE_NAME']) {
  if (!process.env[name] || !process.env[name].trim()) {
    console.error(
      `[printbridge] Missing required env var: ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by');

app.use('/health', healthRouter);
app.use('/status', statusRouter);
app.use('/print', printRouter);
app.use(express.static(path.join(__dirname, 'public')));

// JSON error handler (last).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const detail = process.env.NODE_ENV !== 'production' ? err.stderr || err.message : undefined;
  res.status(err.status || 500).json({ error: 'Internal server error', detail });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const host = os.hostname();
  console.log(`[printbridge] listening on http://0.0.0.0:${PORT}`);
  console.log(`[printbridge] reachable on this network at http://${host}:${PORT}`);
});

// Advertise an mDNS/Bonjour HTTP service so it's discoverable on the LAN.
let bonjour;
try {
  bonjour = new Bonjour();
  bonjour.publish({ name: 'PrintBridge', type: 'http', port: PORT });
  console.log('[printbridge] advertising Bonjour service "PrintBridge"');
} catch (e) {
  console.warn('[printbridge] Bonjour advertise failed (non-fatal, discovery only):', e.message);
}

function shutdown() {
  console.log('[printbridge] shutting down…');
  try {
    if (bonjour) bonjour.unpublishAll(() => bonjour.destroy());
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
