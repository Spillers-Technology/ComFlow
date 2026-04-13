import { createSilentWav } from '../../lib/audio.js'
import { TextToSpeechProvider } from './types.js'

export class FakeTextToSpeechProvider implements TextToSpeechProvider {
  async synthesize(): Promise<{
    audio: Buffer
    mimeType: string
    extension: string
  }> {
    return {
      audio: createSilentWav(1800),
      mimeType: 'audio/wav',
      extension: 'wav',
    }
  }
}
