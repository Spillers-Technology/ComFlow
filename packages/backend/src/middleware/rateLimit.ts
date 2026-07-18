import { NextFunction, Request, Response } from 'express'

/**
 * Small in-memory per-IP rate limiter for abuse-prone open endpoints
 * (registration, login). Sliding window; state resets on process restart,
 * which is acceptable for slowing signup abuse — the wallet, caps, and freeze
 * controls are the real fraud boundary.
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>()

  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now()
    const key = request.ip ?? 'unknown'
    const windowStart = now - options.windowMs

    const recent = (hits.get(key) ?? []).filter(at => at > windowStart)
    if (recent.length >= options.max) {
      response
        .status(429)
        .json({ error: 'Too many attempts. Try again later.' })
      return
    }

    recent.push(now)
    hits.set(key, recent)

    // Opportunistic prune so the map can't grow without bound.
    if (hits.size > 10_000) {
      for (const [mapKey, times] of hits) {
        if (times.every(at => at <= windowStart)) hits.delete(mapKey)
      }
    }

    next()
  }
}
