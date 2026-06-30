import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  AudioPrompt,
  CreateAudioPromptRequest,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import {
  AudioPromptRecord,
  audioPromptRepository,
} from '../repositories/audioPromptRepository.js'

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'wav'
}

function toApi(record: AudioPromptRecord): AudioPrompt {
  const { audioPath: _audioPath, ...api } = record
  void _audioPath
  return api
}

/**
 * Reusable, user-uploaded audio clips. Lets operators bring their own recorded
 * greeting (inbound) or message/question (outbound) instead of TTS.
 */
export class AudioPromptService {
  list(tenantId: string, kind?: 'greeting' | 'outbound'): AudioPrompt[] {
    return audioPromptRepository.list(tenantId, kind).map(toApi)
  }

  async create(
    input: CreateAudioPromptRequest,
    tenantId: string
  ): Promise<AudioPrompt> {
    const id = randomUUID()
    const relativePath = path.join(
      'prompts',
      `${id}.${extensionForMimeType(input.mimeType)}`
    )
    const absolutePath = path.join(config.dataDir, relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, Buffer.from(input.audioBase64, 'base64'))

    const record = audioPromptRepository.create({
      name: input.name,
      kind: input.kind,
      audioPath: relativePath,
      mimeType: input.mimeType,
      tenantId,
    })
    return toApi(record)
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const record = audioPromptRepository.getById(id)
    if (!record || audioPromptRepository.tenantIdOf(id) !== tenantId) {
      throw new HttpError(404, 'Audio prompt not found.')
    }
    await fs
      .rm(path.resolve(config.dataDir, record.audioPath), { force: true })
      .catch(() => undefined)
    audioPromptRepository.delete(id)
  }

  getAudio(id: string, tenantId: string) {
    const record = audioPromptRepository.getById(id)
    if (!record || audioPromptRepository.tenantIdOf(id) !== tenantId) {
      throw new HttpError(404, 'Audio prompt not found.')
    }
    const absolutePath = path.resolve(config.dataDir, record.audioPath)
    if (!absolutePath.startsWith(config.promptsDir)) {
      throw new HttpError(400, 'Invalid audio prompt path.')
    }
    return { absolutePath, mimeType: record.mimeType }
  }

  /** Absolute path to a prompt's audio file, for playback by the SIP edge. */
  resolveAudioPath(id: string): string | null {
    const record = audioPromptRepository.getById(id)
    if (!record) return null
    return path.resolve(config.dataDir, record.audioPath)
  }
}
