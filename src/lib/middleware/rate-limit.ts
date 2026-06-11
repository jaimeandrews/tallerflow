interface Entry {
  count: number;
  resetAt: number;
}

interface BlockEntry {
  blockedUntil: number;
  reason: string;
}

const counters = new Map<string, Entry>();
const blocks = new Map<string, BlockEntry>();
const attemptHistory = new Map<string, number[]>(); // key → timestamps of failures

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  reason?: string;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  // Block list takes precedence
  const block = blocks.get(key);
  if (block && now < block.blockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((block.blockedUntil - now) / 1000),
      reason: block.reason,
    };
  }
  if (block) blocks.delete(key);

  const entry = counters.get(key);
  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Records a failed attempt and applies escalating blocks:
 *  - 5 failures in 5 min  → block 15 min
 *  - 10 failures in 1 h    → block 1 h
 * Returns the block applied (if any).
 */
export function recordFailureAndMaybeBlock(key: string): BlockEntry | null {
  const now = Date.now();
  const history = attemptHistory.get(key) ?? [];

  // Prune events older than 1 h
  const oneHourAgo = now - 60 * 60 * 1000;
  const recent = history.filter((t) => t >= oneHourAgo);
  recent.push(now);
  attemptHistory.set(key, recent);

  // 10 failures in last hour → block 1 h
  if (recent.length >= 10) {
    const block: BlockEntry = {
      blockedUntil: now + 60 * 60 * 1000,
      reason: "Bloqueado 1h por 10 intentos fallidos en 1 hora",
    };
    blocks.set(key, block);
    attemptHistory.delete(key);
    return block;
  }

  // 5 failures in last 5 min → block 15 min
  const fiveMinAgo = now - 5 * 60 * 1000;
  const last5min = recent.filter((t) => t >= fiveMinAgo);
  if (last5min.length >= 5) {
    const block: BlockEntry = {
      blockedUntil: now + 15 * 60 * 1000,
      reason: "Bloqueado 15min por 5 intentos fallidos en 5 minutos",
    };
    blocks.set(key, block);
    return block;
  }

  return null;
}

export function clearFailures(key: string) {
  attemptHistory.delete(key);
  blocks.delete(key);
}

// Test helper — only call from tests
export function __resetRateLimit() {
  counters.clear();
  blocks.clear();
  attemptHistory.clear();
}
