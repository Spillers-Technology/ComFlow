import { config } from '../config.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'

/**
 * Tracks in-flight calls so a shared trunk isn't oversubscribed and no single
 * tenant starves the rest. Enforces two ceilings: the whole-trunk channel count
 * and each tenant's max_concurrent_calls. In-memory — a single backend process
 * owns the one baresip registration, so this is authoritative for that process.
 */
export class ConcurrencyService {
  private global = 0
  private perTenant = new Map<string, number>()
  private active = new Map<string, string>() // callKey -> tenantId

  /**
   * Reserve a channel for a call. Returns false (without reserving) if the trunk
   * or the tenant is at capacity, so the caller can reject/queue.
   */
  tryBegin(tenantId: string, callKey: string): boolean {
    if (this.active.has(callKey)) return true
    if (this.global >= config.trunkConcurrentCallLimit) return false

    const limit = tenantLimitsRepository.get(tenantId).maxConcurrentCalls
    const current = this.perTenant.get(tenantId) ?? 0
    if (current >= limit) return false

    this.global += 1
    this.perTenant.set(tenantId, current + 1)
    this.active.set(callKey, tenantId)
    return true
  }

  /** Release a previously reserved channel. Idempotent. */
  end(callKey: string): void {
    const tenantId = this.active.get(callKey)
    if (!tenantId) return
    this.active.delete(callKey)
    this.global = Math.max(0, this.global - 1)
    this.perTenant.set(
      tenantId,
      Math.max(0, (this.perTenant.get(tenantId) ?? 0) - 1)
    )
  }

  activeForTenant(tenantId: string): number {
    return this.perTenant.get(tenantId) ?? 0
  }

  activeGlobal(): number {
    return this.global
  }
}
