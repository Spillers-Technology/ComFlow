import { Buffer } from 'node:buffer'
import { TextToSpeechProvider } from './types.js'

export class OpenAiTextToSpeechProvider implements TextToSpeechProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voice: string
  ) {}

  async synthesize(input: { text: string }): Promise<{
    audio: Buffer
    mimeType: string
    extension: string
  }> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        voice: this.voice,
        input: input.text,
        format: 'mp3',
      }),
    })

    if (!response.ok) {
      throw new Error(
        `OpenAI TTS request failed (${response.status}): ${await response.text()}`
      )
    }

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    }
  }
}
