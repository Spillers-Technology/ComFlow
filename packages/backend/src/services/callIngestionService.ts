import fs from 'node:fs/promises'
import path from 'node:path'
import {
  InboundTelephonyWebhookInput,
  RecordingCompleteWebhookInput,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { createSilentWav } from '../lib/audio.js'
import { HttpError } from '../lib/errors.js'
import { callRepository } from '../repositories/callRepository.js'
import { EngineService } from './engineService.js'

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'bin'
}

export class CallIngestionService {
  constructor(
    private readonly engineService: EngineService
  ) {}

  async createInboundCall(input: InboundTelephonyWebhookInput) {
    const call = callRepository.createInitial({
      telephonyCallId: input.telephonyCallId,
      source: input.source,
      callbackNumber: input.fromNumber,
      transcript: input.transcript,
    })

    if (input.transcript) {
      const extracted = await this.engineService.extractFromTranscript(
        input.transcript
      )

      return callRepository.applyProcessing(call.id, {
        transcript: input.transcript,
        rawTranscript: JSON.stringify({ source: 'inbound-payload' }),
        extracted,
        recordingStatus: call.recordingStatus,
        recordingPath: call.recordingPath,
        recordingMimeType: call.recordingMimeType,
      })
    }

    return call
  }

  async processRecordingComplete(input: RecordingCompleteWebhookInput) {
    const call = callRepository.getByTelephonyCallId(input.telephonyCallId)
    if (!call) {
      throw new HttpError(404, 'Call not found for telephony call id.')
    }

    const relativePath = path.join(
      'recordings',
      `${call.id}.${extensionForMimeType(input.mimeType)}`
    )
    const absolutePath = path.join(config.dataDir, relativePath)

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })

    if (input.recordingBase64) {
      await fs.writeFile(
        absolutePath,
        Buffer.from(input.recordingBase64, 'base64')
      )
    } else {
      await fs.writeFile(absolutePath, createSilentWav())
    }

    if (input.transcript) {
      await fs.writeFile(`${absolutePath}.txt`, input.transcript, 'utf8')
    }

    const transcription = input.transcript
      ? {
          transcript: input.transcript,
          rawTranscript: { source: 'recording-webhook-payload' },
        }
      : await this.engineService.transcribeRecording({
          filePath: absolutePath,
          mimeType: input.mimeType,
        })

    const extracted = await this.engineService.extractFromTranscript(
      transcription.transcript
    )

    return callRepository.applyProcessing(call.id, {
      transcript: transcription.transcript,
      rawTranscript: transcription.rawTranscript
        ? JSON.stringify(transcription.rawTranscript)
        : null,
      extracted,
      recordingStatus: 'ready',
      recordingPath: relativePath,
      recordingMimeType: input.mimeType,
    })
  }
}
