import {
  CallUpdateInput,
  CreateCallNoteInput,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { callRepository, CallFilters } from '../repositories/callRepository.js'
import { noteRepository } from '../repositories/noteRepository.js'

export class CallReviewService {
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

  updateCall(id: string, input: CallUpdateInput) {
    const call = callRepository.update(id, input)
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    return call
  }

  addNote(callId: string, input: CreateCallNoteInput) {
    const call = callRepository.getById(callId)
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    return noteRepository.create(callId, input)
  }
}
