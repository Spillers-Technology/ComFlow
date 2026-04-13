import fs from 'node:fs/promises'
import path from 'node:path'
import { SpeechToTextProvider } from './types.js'

export class ElevenLabsSpeechToTextProvider implements SpeechToTextProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async transcribeRecording(input: {
    filePath: string
    mimeType: string
  }): Promise<{ transcript: string; rawTranscript?: unknown }> {
    const audio = await fs.readFile(input.filePath)
    const form = new FormData()
    form.append('model_id', this.model)
    form.append(
      'file',
      new Blob([audio], { type: input.mimeType }),
      path.basename(input.filePath)
    )

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
      },
      body: form,
    })

    if (!response.ok) {
      throw new Error(
        `ElevenLabs STT request failed (${response.status}): ${await response.text()}`
      )
    }

    const json = (await response.json()) as {
      text?: unknown
    }
    if (typeof json.text !== 'string' || json.text.trim().length === 0) {
      throw new Error('ElevenLabs STT did not return transcript text.')
    }

    return {
      transcript: json.text.trim(),
      rawTranscript: json,
    }
  }
}
