import fs from 'node:fs/promises'
import path from 'node:path'
import { SpeechToTextProvider } from './types.js'

export class OpenAiSpeechToTextProvider implements SpeechToTextProvider {
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
    form.append('model', this.model)
    form.append(
      'file',
      new Blob([audio], { type: input.mimeType }),
      path.basename(input.filePath)
    )

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      }
    )

    if (!response.ok) {
      throw new Error(
        `OpenAI STT request failed (${response.status}): ${await response.text()}`
      )
    }

    const json = (await response.json()) as {
      text?: unknown
    }
    if (typeof json.text !== 'string' || json.text.trim().length === 0) {
      throw new Error('OpenAI STT did not return transcript text.')
    }

    return {
      transcript: json.text.trim(),
      rawTranscript: json,
    }
  }
}
