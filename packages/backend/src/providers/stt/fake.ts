import fs from 'node:fs/promises'
import path from 'node:path'
import { SpeechToTextProvider } from './types.js'

export class FakeSpeechToTextProvider implements SpeechToTextProvider {
  async transcribeRecording(input: {
    filePath: string
    mimeType: string
  }): Promise<{ transcript: string; rawTranscript?: unknown }> {
    const transcriptPath = `${input.filePath}.txt`
    const transcript = await fs
      .readFile(transcriptPath, 'utf8')
      .catch(() => 'Caller requested a callback about a support issue.')

    return {
      transcript,
      rawTranscript: {
        provider: 'fake-stt',
        mimeType: input.mimeType,
        sourceFile: path.basename(input.filePath),
      },
    }
  }
}
