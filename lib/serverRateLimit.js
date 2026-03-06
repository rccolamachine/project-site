import { kv } from "@vercel/kv";
import { rateLimit as memoryRateLimit } from "./rateLimit";

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getClientIp(req) {
  const xff = req?.headers?.get?.("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || "").trim();
  return ip || "unknown";
}

export async function limitRequest(req, namespace, limit, windowSec) {
  const ip = getClientIp(req);
  const safeNamespace = String(namespace || "global");
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const safeWindowSec = Math.max(1, Math.floor(Number(windowSec) || 60));

  if (hasKvConfig()) {
    const key = `rl:${safeNamespace}:${ip}`;
    const count = Number(await kv.incr(key));
    if (count === 1) await kv.expire(key, safeWindowSec);
    return {
      ok: count <= safeLimit,
      ip,
      remaining: Math.max(0, safeLimit - count),
      retryAfterSec: safeWindowSec,
    };
  }

  const local = memoryRateLimit(
    `${safeNamespace}:${ip}`,
    safeLimit,
    safeWindowSec * 1000,
  );
  return {
    ok: local.ok,
    ip,
    remaining: local.remaining,
    retryAfterSec: Math.max(1, Math.ceil(local.resetMs / 1000)),
  };
}
