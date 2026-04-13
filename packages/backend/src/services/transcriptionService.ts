import { SpeechToTextProvider } from '../providers/stt/types.js'

export class TranscriptionService {
  constructor(private readonly provider: SpeechToTextProvider) {}

  transcribeRecording(input: { filePath: string; mimeType: string }) {
    return this.provider.transcribeRecording(input)
  }
}
