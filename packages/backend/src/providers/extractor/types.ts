import { ExtractedCallFields } from '../../../../shared/src/index.js'

export interface TranscriptExtractionProvider {
  extractCallMetadata(input: { transcript: string }): Promise<ExtractedCallFields>
}
