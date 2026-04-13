import { Buffer } from 'node:buffer'
import { TextToSpeechProvider } from './types.js'

export class ElevenLabsTextToSpeechProvider implements TextToSpeechProvider {
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
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: this.model,
          text: input.text,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(
        `ElevenLabs TTS request failed (${response.status}): ${await response.text()}`
      )
    }

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    }
  }
}
