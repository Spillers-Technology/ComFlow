import { TextToSpeechProvider } from './types.js'

export class FakeTextToSpeechProvider implements TextToSpeechProvider {
  async synthesize(): Promise<{ filePath: string | null }> {
    return { filePath: null }
  }
}
