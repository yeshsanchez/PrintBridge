import { Router } from 'express';
import { requireApiKey } from '../lib/auth.js';
import { listJobs } from '../lib/cups.js';

const router = Router();

router.get('/', requireApiKey, async (req, res, next) => {
  try {
    const queue = process.env.CUPS_QUEUE_NAME;
    const jobs = await listJobs(queue);
    res.json({ queue, jobs });
  } catch (err) {
    next(err);
  }
});

export default router;
