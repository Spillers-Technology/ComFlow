import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CreateScheduledCallRequest,
  ScheduledCall,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import {
  ScheduledCallRecord,
  scheduledCallRepository,
} from '../repositories/scheduledCallRepository.js'
import { AudioPromptService } from './audioPromptService.js'
import { EngineService } from './engineService.js'
import { TelephonyGatewayService } from './telephonyGatewayService.js'

function toApi(record: ScheduledCallRecord): ScheduledCall {
  // The repository's API shape already matches ScheduledCall; strip the
  // internal-only fields.
  const {
    answerRecordingPath: _a,
    providerCallId: _p,
    messagePromptId: _m,
    questionPromptId: _q,
    ...api
  } = record
  void _a
  void _p
  void _m
  void _q
  return api
}

/**
 * The tightly-scoped outbound feature: schedule a call, play a pre-generated
 * message, ask one question, and best-effort capture the spoken answer. There
 * is no conversation and no answering-machine detection.
 */
export class ScheduledCallService {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly engineService: EngineService,
    private readonly telephonyGateway: TelephonyGatewayService,
    private readonly audioPromptService: AudioPromptService
  ) {}

  list(tenantId: string): ScheduledCall[] {
    return scheduledCallRepository.list(tenantId).map(toApi)
  }

  create(input: CreateScheduledCallRequest, tenantId: string): ScheduledCall {
    const record = scheduledCallRepository.create({
      toNumber: input.toNumber,
      scheduledAt: input.scheduledAt,
      messageText: input.messageText ?? '',
      questionText: input.questionText ?? '',
      messagePromptId: input.messageAudioPromptId ?? null,
      questionPromptId: input.questionAudioPromptId ?? null,
      tenantId,
    })
    return toApi(record)
  }

  cancel(id: string, tenantId: string): ScheduledCall {
    const existing = scheduledCallRepository.getById(id)
    if (!existing || scheduledCallRepository.tenantIdOf(id) !== tenantId) {
      throw new HttpError(404, 'Scheduled call not found.')
    }
    if (existing.status !== 'scheduled') {
      throw new HttpError(400, 'Only scheduled calls can be canceled.')
    }
    const updated = scheduledCallRepository.update(id, { status: 'canceled' })
    return toApi(updated!)
  }

  getAnswerAudio(id: string, tenantId: string) {
    const record = scheduledCallRepository.getById(id)
    if (
      !record ||
      scheduledCallRepository.tenantIdOf(id) !== tenantId ||
      !record.answerRecordingPath
    ) {
      throw new HttpError(404, 'Answer audio not found.')
    }
    const absolutePath = path.resolve(config.dataDir, record.answerRecordingPath)
    if (!absolutePath.startsWith(config.outboundAudioDir)) {
      throw new HttpError(400, 'Invalid answer audio path.')
    }
    return { absolutePath }
  }

  /** Start the polling loop that runs due outbound calls. */
  startScheduler() {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, config.telephony.schedulerIntervalSec * 1000)
  }

  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick() {
    // One outbound call at a time — a single SIP UA can't fan out, and serial
    // processing keeps recording correlation unambiguous.
    if (this.running) return
    if (!this.telephonyGateway.isConnected()) return

    this.running = true
    try {
      const due = scheduledCallRepository.listDue(new Date().toISOString())
      for (const record of due) {
        await this.runOne(record)
      }
    } finally {
      this.running = false
    }
  }

  private async runOne(record: ScheduledCallRecord) {
    scheduledCallRepository.update(record.id, {
      status: 'in_progress',
      attempts: record.attempts + 1,
    })

    try {
      const messageAudioPath = await this.resolveSegmentAudio(
        record.id,
        'message',
        record.messageText,
        record.messagePromptId
      )
      const questionAudioPath = await this.resolveSegmentAudio(
        record.id,
        'question',
        record.questionText,
        record.questionPromptId
      )

      const result = await this.telephonyGateway.placeOutboundCall({
        toNumber: record.toNumber,
        messageAudioPath,
        questionAudioPath,
        recordWindowMs: config.telephony.outboundCaptureWindowSec * 1000,
      })

      if (result.status === 'no_answer') {
        scheduledCallRepository.update(record.id, {
          status: 'no_answer',
          providerCallId: result.providerCallId,
        })
        return
      }

      if (result.status === 'failed') {
        scheduledCallRepository.update(record.id, {
          status: 'failed',
          providerCallId: result.providerCallId,
          lastError: 'Outbound call could not be placed.',
        })
        return
      }

      // completed — best-effort capture of the answer.
      let answerTranscript: string | null = null
      let answerRelativePath: string | null = null

      if (result.recordingPath) {
        answerRelativePath = path.join('outbound', `${record.id}-answer.wav`)
        const answerAbsolute = path.join(config.dataDir, answerRelativePath)
        await fs.copyFile(result.recordingPath, answerAbsolute)

        try {
          const transcription = await this.engineService.transcribeRecording({
            filePath: answerAbsolute,
            mimeType: 'audio/wav',
          })
          answerTranscript = transcription.transcript
        } catch {
          // Best-effort: keep the recording even if transcription fails.
        }
      }

      scheduledCallRepository.update(record.id, {
        status: 'completed',
        providerCallId: result.providerCallId,
        answerRecordingPath: answerRelativePath,
        answerTranscript,
      })
    } catch (error) {
      scheduledCallRepository.update(record.id, {
        status: 'failed',
        lastError: (error as Error).message,
      })
    }
  }

  /**
   * Resolve the audio to play for a segment: a user-uploaded prompt when one is
   * referenced, otherwise synthesize the text via TTS. Returns null only if no
   * source is available (validation normally prevents this).
   */
  private async resolveSegmentAudio(
    id: string,
    kind: 'message' | 'question',
    text: string,
    promptId: string | null
  ): Promise<string | null> {
    if (promptId) {
      const promptPath = this.audioPromptService.resolveAudioPath(promptId)
      if (promptPath) return promptPath
      // Prompt was deleted — fall back to text if we have any.
    }
    if (!text) return null
    return this.synthesizeToFile(id, kind, text)
  }

  private async synthesizeToFile(
    id: string,
    kind: 'message' | 'question',
    text: string
  ): Promise<string> {
    const audio = await this.engineService.synthesizeSpeech({ text })
    const relativePath = path.join('outbound', `${id}-${kind}.${audio.extension}`)
    const absolutePath = path.join(config.dataDir, relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, audio.audio)
    return absolutePath
  }
}
