import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Absolute paths so the service works under launchd regardless of PATH.
const LP = '/usr/bin/lp';
const LPSTAT = '/usr/bin/lpstat';

const isDev = () => process.env.NODE_ENV !== 'production';

// UI paper value -> driver PageSize name. Most are identity, but the G1010's
// Gutenprint driver (Canon G1000 series) names 4x6" photo paper "w288h432"
// (288x432pt = 4x6in) rather than "4x6". Verified via `lpoptions -p G1010 -l`.
const MEDIA_MAP = {
  A4: 'A4',
  Letter: 'Letter',
  Legal: 'Legal',
  A5: 'A5',
  '4x6': 'w288h432',
};

/**
 * Validate a user page-range string like "1,3-5,8". Returns a cleaned string,
 * or null when empty (= all pages). Throws a 400-tagged error on malformed
 * input so a bad range never silently prints every page.
 */
function normalizePageRanges(pages) {
  if (pages == null) return null;
  const clean = String(pages).replace(/\s+/g, '');
  if (clean === '') return null;
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(clean)) {
    const err = new Error('Invalid page range — use pages like 1-3, 5');
    err.status = 400;
    throw err;
  }
  return clean;
}

/**
 * Translate the UI's print options into `lp` CLI flags. Every value is whitelisted,
 * so only known-good options reach lp; anything unrecognized is dropped and the
 * printer default is used.
 */
function buildLpOptions({ media, orientation, color, copies, pages } = {}) {
  const args = [];
  const n = parseInt(copies, 10);
  if (Number.isInteger(n) && n > 1 && n <= 99) args.push('-n', String(n));
  if (MEDIA_MAP[media]) args.push('-o', `media=${MEDIA_MAP[media]}`);
  if (orientation === 'landscape') args.push('-o', 'orientation-requested=4');
  if (color === 'grayscale') args.push('-o', 'print-color-mode=monochrome');
  const ranges = normalizePageRanges(pages);
  if (ranges) args.push('-o', `page-ranges=${ranges}`);
  return args;
}

/**
 * Submit a file to a CUPS queue via `lp -d <queue> [options] <file>`.
 * `execFile` (never `exec`) is used with an args array so user-controlled
 * filenames and options can never be interpreted by a shell.
 * Returns the parsed CUPS job id, e.g. "G1010-123".
 */
export async function printFile(filePath, queue, options = {}) {
  const args = ['-d', queue, ...buildLpOptions(options), filePath];
  const { stdout } = await execFileAsync(LP, args);
  // Typical output: "request id is G1010-123 (1 file(s))"
  const match = stdout.match(/request id is (\S+)/);
  if (!match) {
    const err = new Error('Could not parse job id from lp output');
    err.stdout = stdout;
    throw err;
  }
  return match[1];
}

/**
 * List pending/active jobs for a queue via `lpstat -o <queue>`.
 * Returns [] when the queue is empty or unknown.
 */
export async function listJobs(queue) {
  try {
    const { stdout } = await execFileAsync(LPSTAT, ['-o', queue]);
    return parseJobs(stdout);
  } catch (err) {
    // lpstat exits non-zero with empty stdout for an idle/unknown queue.
    if (typeof err.stdout === 'string' && err.stdout.trim() === '') return [];
    throw err;
  }
}

function parseJobs(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "G1010-123   yesh   12345   Wed 30 Jul 2026 10:11:12 AM"
      const [jobId, user, size, ...rest] = line.split(/\s+/);
      return { jobId, user, size, submittedAt: rest.join(' ') || null };
    });
}

/**
 * Look up printer state via `lpstat -p <queue>`. Never throws — returns a status
 * object so GET /health can report reachability even when the queue is missing.
 */
export async function printerInfo(queue) {
  if (!queue) return { queue: null, reachable: false, detail: 'CUPS_QUEUE_NAME not set' };
  try {
    const { stdout } = await execFileAsync(LPSTAT, ['-p', queue]);
    return { queue, reachable: true, detail: stdout.trim() };
  } catch (err) {
    return {
      queue,
      reachable: false,
      detail: isDev() ? err.stderr || err.message : 'printer not available',
    };
  }
}

/**
 * Full queue snapshot for the live view: the printer's state plus the job list,
 * where the job currently being printed is flagged so the UI can show its status.
 * Returns { printerState, jobs: [{ jobId, user, size, submittedAt, position, state }] }.
 */
export async function getQueue(queue) {
  const jobs = await listJobs(queue);
  let printerState = 'unknown';
  let activeJobId = null;
  try {
    const { stdout } = await execFileAsync(LPSTAT, ['-p', queue]);
    // e.g. "printer G1010 now printing G1010-7.  enabled since ..."
    const m = stdout.match(/now printing (\S+)/);
    if (m) {
      activeJobId = m[1].replace(/\.$/, '');
      printerState = 'printing';
    } else if (/is idle/.test(stdout)) {
      printerState = 'idle';
    } else if (/disabled/.test(stdout)) {
      printerState = 'disabled';
    }
  } catch {
    /* leave printerState 'unknown' */
  }
  return {
    printerState,
    jobs: jobs.map((j, i) => ({
      ...j,
      position: i + 1,
      state: j.jobId === activeJobId ? 'printing' : 'pending',
    })),
  };
}
