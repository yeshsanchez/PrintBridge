import crypto from 'node:crypto';

/**
 * Express middleware requiring a shared secret, supplied either in the
 * `x-api-key` header or a `?token=` query param (browser convenience).
 * Compared in constant time against process.env.API_KEY.
 */
export function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY || '';
  const provided = req.get('x-api-key') || req.query.token || '';
  if (safeEqual(provided, expected)) return next();
  return res.status(401).json({ error: 'Invalid or missing API key' });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Length check leaks length only; guards timingSafeEqual's equal-length requirement.
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
