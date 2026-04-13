export interface SpeechToTextProvider {
  transcribeRecording(input: {
    filePath: string
    mimeType: string
  }): Promise<{ transcript: string; rawTranscript?: unknown }>
}
