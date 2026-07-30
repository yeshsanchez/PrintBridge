import { Router } from "express";
import { requireApiKey } from "../lib/auth.js";
import { getQueue } from "../lib/cups.js";

const router = Router();

router.get("/", requireApiKey, async (req, res, next) => {
  try {
    const queue = process.env.CUPS_QUEUE_NAME;
    const { printerState, jobs } = await getQueue(queue);
    res.json({ queue, printerState, jobs });
  } catch (err) {
    next(err);
  }
});

export default router;
