export interface TextToSpeechProvider {
  synthesize(input: {
    text: string
  }): Promise<{ audio: Buffer; mimeType: string; extension: string }>
}
