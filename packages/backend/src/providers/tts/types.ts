export interface TextToSpeechProvider {
  synthesize(input: { text: string }): Promise<{ filePath: string | null }>
}
