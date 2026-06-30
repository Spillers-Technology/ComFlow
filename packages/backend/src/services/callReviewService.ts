import {
  CallRecord,
  CallStatus,
  CallUpdateInput,
  CreateCallNoteInput,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { callRepository, CallFilters } from '../repositories/callRepository.js'
import { noteRepository } from '../repositories/noteRepository.js'
import { accessService, ALL_MAILBOXES } from './accessService.js'
import { AnchordeskSyncService } from './anchordeskSyncService.js'

/** Human label for attribution; prefers the display name, falls back to email. */
function displayName(user: User): string {
  return user.displayName?.trim() || user.email
}

// A voicemail is "gilded" (worth syncing to AnchorDesk) once an operator has
// reviewed or assigned it. New/resolved/spam are intentionally not synced.
const SYNCABLE_STATUSES: ReadonlySet<CallStatus> = new Set([
  'reviewed',
  'assigned',
])

export class CallReviewService {
  constructor(
    private readonly anchordeskSync: AnchordeskSyncService = new AnchordeskSyncService()
  ) {}

  listCalls(filters: CallFilters, user: User) {
    // Tenant isolation first, then per-mailbox RBAC within the tenant.
    const scope = accessService.accessibleMailboxIds(user)
    const tenantScoped: CallFilters = { ...filters, tenantId: user.tenantId }
    const scoped: CallFilters =
      scope === ALL_MAILBOXES
        ? tenantScoped
        : { ...tenantScoped, mailboxIds: scope }
    return callRepository.list(scoped)
  }

  getCallDetail(id: string, user: User) {
    const call = callRepository.getInTenant(id, user.tenantId)
    // 404 (not 403) for out-of-scope calls so we don't reveal their existence.
    if (!call || !accessService.canAccessMailbox(user, call.mailboxId)) {
      throw new HttpError(404, 'Call not found.')
    }

    return {
      call,
      notes: noteRepository.listByCallId(id),
    }
  }

  async updateCall(
    id: string,
    input: CallUpdateInput,
    user: User
  ): Promise<CallRecord> {
    const existing = callRepository.getInTenant(id, user.tenantId)
    if (!existing || !accessService.canAccessMailbox(user, existing.mailboxId)) {
      throw new HttpError(404, 'Call not found.')
    }

    const call = callRepository.update(id, input, displayName(user))
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    return (await this.maybeSync(call)) ?? call
  }

  /** Push to AnchorDesk when a call becomes gilded and isn't already synced. */
  private async maybeSync(call: CallRecord): Promise<CallRecord | null> {
    if (call.syncedTicketId) return null
    if (!SYNCABLE_STATUSES.has(call.status)) return null
    if (!this.anchordeskSync.isEnabled()) return null

    try {
      await this.anchordeskSync.syncCall(call)
      return callRepository.getById(call.id)
    } catch (error) {
      // The review itself is persisted; don't fail the request because the
      // downstream sync hiccuped.
      console.warn(
        `AnchorDesk sync failed for call ${call.id}: ${(error as Error).message}`
      )
      return null
    }
  }

  addNote(callId: string, input: CreateCallNoteInput, user: User) {
    const call = callRepository.getInTenant(callId, user.tenantId)
    if (!call || !accessService.canAccessMailbox(user, call.mailboxId)) {
      throw new HttpError(404, 'Call not found.')
    }

    // Attribute the note to the signed-in operator unless one was supplied.
    return noteRepository.create(callId, {
      ...input,
      authorName: input.authorName ?? displayName(user),
    })
  }
}
