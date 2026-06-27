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
import { mailboxRepository } from '../repositories/mailboxRepository.js'
import { EmailNotificationService } from './emailNotificationService.js'
import { EngineService } from './engineService.js'

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'bin'
}

export class CallIngestionService {
  constructor(
    private readonly engineService: EngineService,
    private readonly emailNotificationService: EmailNotificationService
  ) {}

  async createInboundCall(input: InboundTelephonyWebhookInput) {
    const call = callRepository.createInitial({
      telephonyCallId: input.telephonyCallId,
      source: input.source,
      callbackNumber: input.fromNumber,
      transcript: input.transcript,
      // Single-mailbox model today; every call lands in the default mailbox.
      mailboxId: mailboxRepository.ensureDefault(config.defaultMailbox).id,
    })

    if (input.transcript) {
      const extracted = await this.engineService.extractFromTranscript(
        input.transcript
      )

      const processed = callRepository.applyProcessing(call.id, {
        transcript: input.transcript,
        rawTranscript: JSON.stringify({ source: 'inbound-payload' }),
        extracted,
        recordingStatus: call.recordingStatus,
        recordingPath: call.recordingPath,
        recordingMimeType: call.recordingMimeType,
      })

      void this.notifyProcessedVoicemail(processed)
      return processed
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

    const processed = callRepository.applyProcessing(call.id, {
      transcript: transcription.transcript,
      rawTranscript: transcription.rawTranscript
        ? JSON.stringify(transcription.rawTranscript)
        : null,
      extracted,
      recordingStatus: 'ready',
      recordingPath: relativePath,
      recordingMimeType: input.mimeType,
    })

    void this.notifyProcessedVoicemail(processed)
    return processed
  }

  private async notifyProcessedVoicemail(call: {
    id: string
    recordingPath: string | null
  }) {
    if (callRepository.wasEmailNotified(call.id)) return

    try {
      const fullCall = callRepository.getById(call.id)
      if (!fullCall) return

      const sent =
        await this.emailNotificationService.sendVoicemailProcessed(fullCall)
      if (sent) {
        callRepository.markEmailNotified(call.id)
      }
    } catch (error) {
      console.error(
        `Failed to send voicemail notification for ${call.id}: ${(error as Error).message}`
      )
    }
  }
}
