import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireApiKey } from '../lib/auth.js';
import { printFile } from '../lib/cups.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// Allowed mime types mapped to their permitted extensions. Both are validated.
const ALLOWED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const exts = ALLOWED[file.mimetype];
  const ext = path.extname(file.originalname).toLowerCase();
  if (exts && exts.includes(ext)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype} (${ext || 'no extension'})`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const router = Router();

// Auth runs before multer so unauthenticated requests never write a temp file.
router.post('/', requireApiKey, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (form field must be named "file")' });
    }

    const queue = process.env.CUPS_QUEUE_NAME;
    const options = {
      media: req.body.media,
      orientation: req.body.orientation,
      color: req.body.color,
      copies: req.body.copies,
      pages: req.body.pages,
    };
    try {
      const jobId = await printFile(req.file.path, queue, options);
      return res.json({ jobId, status: 'queued' });
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      const detail = process.env.NODE_ENV !== 'production' ? e.stderr || e.message : undefined;
      return res.status(500).json({ error: 'Failed to submit print job', detail });
    } finally {
      // CUPS has spooled its own copy by the time lp returns, so it's safe to delete.
      fs.unlink(req.file.path, () => {});
    }
  });
});

export default router;
