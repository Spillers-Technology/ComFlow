import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  CallbackAttempt,
  CallbackProviderSnapshot,
  CreateCallbackRequest,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import {
  CallbackAttemptRecord,
  callbackRepository,
} from '../repositories/callbackRepository.js'
import { callRepository } from '../repositories/callRepository.js'
import { TelephonyProvider } from '../providers/telephony/types.js'
import { EngineService } from './engineService.js'

function toApiAttempt(record: CallbackAttemptRecord): CallbackAttempt {
  return {
    id: record.id,
    callId: record.callId,
    callbackNumber: record.callbackNumber,
    notes: record.notes,
    script: record.script,
    status: record.status,
    providerSnapshot: record.providerSnapshot,
    audioMimeType: record.audioMimeType,
    audioUrl: record.audioPath ? `/api/callbacks/${record.id}/audio` : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class CallbackService {
  constructor(
    private readonly engineService: EngineService,
    private readonly telephonyProvider: TelephonyProvider
  ) {}

  listForCall(callId: string) {
    return callbackRepository.listByCallId(callId).map(toApiAttempt)
  }

  getAttemptAudio(id: string) {
    const attempt = callbackRepository.getById(id)
    if (!attempt) {
      throw new HttpError(404, 'Callback attempt not found.')
    }

    if (!attempt.audioPath) {
      throw new HttpError(404, 'Callback audio not found.')
    }

    const absolutePath = path.resolve(config.dataDir, attempt.audioPath)
    if (!absolutePath.startsWith(config.callbackAudioDir)) {
      throw new HttpError(400, 'Invalid callback audio path.')
    }

    return {
      attempt,
      absolutePath,
    }
  }

  async createCallback(callId: string, input: CreateCallbackRequest) {
    const call = callRepository.getById(callId)
    if (!call) {
      throw new HttpError(404, 'Call not found.')
    }

    if (!call.callbackNumber) {
      throw new HttpError(400, 'This call does not have a callback number.')
    }

    const { script } = await this.engineService.generateCallbackScript({
      call,
      notes: input.notes ?? null,
    })

    const audio = await this.engineService.synthesizeCallbackAudio({
      text: script,
    })

    const id = randomUUID()
    const relativePath = path.join('callbacks', `${id}.${audio.extension}`)
    const absolutePath = path.join(config.dataDir, relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, audio.audio)

    const simulated = await this.telephonyProvider.simulateOutboundCallback({
      callbackNumber: call.callbackNumber,
      script,
    })

    const providerSnapshot: CallbackProviderSnapshot = {
      llm: this.engineService.getCurrentSettings().llm,
      tts: this.engineService.getCurrentSettings().tts,
      telephonyProvider: 'fake',
    }

    const now = new Date().toISOString()
    const record = callbackRepository.create({
      id,
      callId: call.id,
      callbackNumber: call.callbackNumber,
      notes: input.notes ?? null,
      script,
      status: simulated.status,
      providerSnapshot,
      providerCallId: simulated.providerCallId,
      audioPath: relativePath,
      audioMimeType: audio.mimeType,
      createdAt: now,
      updatedAt: now,
    })

    return {
      attempt: toApiAttempt(record),
    }
  }
}
