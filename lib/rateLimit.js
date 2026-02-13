// lib/rateLimit.js
// In-memory limiter for a single-instance hobby site.
// Resets on server restart. Not shared across multiple instances.

const buckets = new Map();

/**
 * @param {string} key
 * @param {number} limit
 * @param {number} windowMs
 */
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;

  let hits = buckets.get(key);
  if (!hits) hits = [];

  while (hits.length && hits[0] <= cutoff) hits.shift();

  const ok = hits.length < limit;
  if (ok) hits.push(now);

  buckets.set(key, hits);

  const remaining = Math.max(0, limit - hits.length);
  const resetMs = hits.length ? windowMs - (now - hits[0]) : windowMs;

  return { ok, remaining, resetMs };
}
