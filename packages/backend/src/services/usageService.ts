import { UsageSummary, UsageType } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { didRepository } from '../repositories/didRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { usageRepository } from '../repositories/usageRepository.js'

function monthPrefix(date = new Date()): string {
  return date.toISOString().slice(0, 7)
}

/**
 * Meters billable usage per tenant. Each event stores the raw carrier/AI cost
 * and the marked-up amount the tenant is charged (carrier x markup_bps). The
 * summary exposes both, so pricing is transparent, and feeds the Stripe wallet
 * draw-down (M7).
 */
export class UsageService {
  private markup(tenantId: string): number {
    return tenantLimitsRepository.get(tenantId).markupBps / 10000
  }

  /** Record a metered unit; returns the billed (marked-up) cents. */
  record(
    tenantId: string,
    type: UsageType,
    quantity: number,
    unitCostCents: number,
    callId?: string | null
  ): number {
    const billedCents = Math.round(quantity * unitCostCents * this.markup(tenantId))
    usageRepository.record({
      tenantId,
      type,
      quantity,
      unitCostCents,
      billedCents,
      callId,
    })
    return billedCents
  }

  /** Meter the AI cost of processing one inbound voicemail (STT + LLM). */
  recordVoicemailProcessing(tenantId: string, callId: string): void {
    const { sttCents, llmCents } = config.usageCosts
    this.record(tenantId, 'stt', 1, sttCents, callId)
    this.record(tenantId, 'llm', 1, llmCents, callId)
  }

  recordInboundMinutes(tenantId: string, minutes: number, callId?: string): void {
    this.record(
      tenantId,
      'inbound_minute',
      minutes,
      config.usageCosts.inboundPerMinuteCents,
      callId
    )
  }

  recordOutboundMinutes(tenantId: string, minutes: number): void {
    this.record(
      tenantId,
      'outbound_minute',
      minutes,
      config.usageCosts.outboundPerMinuteCents
    )
  }

  recordTts(tenantId: string): void {
    this.record(tenantId, 'tts', 1, config.usageCosts.ttsCents)
  }

  /** Minutes used this month — for the included-minutes limit. */
  minutesThisMonth(tenantId: string): number {
    return usageRepository.minutesForMonth(tenantId, monthPrefix())
  }

  /** All-time billed cents charged to a tenant (wallet draw-down). */
  totalBilledCents(tenantId: string): number {
    return usageRepository.totalBilledCents(tenantId)
  }

  /** Transparent usage breakdown for a tenant this month, incl. DID rental. */
  summary(tenantId: string): UsageSummary {
    const month = monthPrefix()
    const lines = usageRepository.linesForMonth(tenantId, month)
    const limits = tenantLimitsRepository.get(tenantId)

    // DID rental is a recurring monthly charge derived from active DIDs rather
    // than a per-event row, so it always reflects current holdings.
    const activeDids = didRepository
      .listByTenant(tenantId)
      .filter(did => did.status === 'active')
    if (activeDids.length > 0) {
      const carrierCents = activeDids.reduce((sum, d) => sum + d.monthlyCents, 0)
      lines.push({
        type: 'did_rental',
        quantity: activeDids.length,
        carrierCents,
        billedCents: Math.round(carrierCents * (limits.markupBps / 10000)),
      })
    }

    const totalCarrierCents = lines.reduce((s, l) => s + l.carrierCents, 0)
    const totalBilledCents = lines.reduce((s, l) => s + l.billedCents, 0)
    return { month, lines, totalCarrierCents, totalBilledCents, limits }
  }
}
