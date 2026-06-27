import { ExtractedCallFields } from '../../../../shared/src/index.js'

export interface LanguageModelProvider {
  extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields>
}
