import {
  CallRecord,
  CallStatus,
  CallUpdateInput,
  CreateCallNoteInput,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { callRepository, CallFilters } from '../repositories/callRepository.js'
import { noteRepository } from '../repositories/noteRepository.js'
import { AnchordeskSyncService } from './anchordeskSyncService.js'

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

  listCalls(filters: CallFilters) {
    return callRepository.list(filters)
  }

  getCallDetail(id: string) {
    const call = callRepository.getById(id)
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    return {
      call,
      notes: noteRepository.listByCallId(id),
    }
  }

  async updateCall(id: string, input: CallUpdateInput): Promise<CallRecord> {
    const call = callRepository.update(id, input)
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

  addNote(callId: string, input: CreateCallNoteInput) {
    const call = callRepository.getById(callId)
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    return noteRepository.create(callId, input)
  }
}
