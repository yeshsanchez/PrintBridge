import { Router } from 'express';
import { printerInfo } from '../lib/cups.js';

const router = Router();

// No auth — used for quick reachability checks from any device.
router.get('/', async (req, res) => {
  const info = await printerInfo(process.env.CUPS_QUEUE_NAME);
  res.json({
    status: 'ok',
    printer: 'Canon PIXMA G1010',
    queue: info.queue,
    printerReachable: info.reachable,
    uptime: Math.round(process.uptime()),
  });
});

export default router;
