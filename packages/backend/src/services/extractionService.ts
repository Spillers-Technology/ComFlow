import { ExtractedCallFieldsSchema } from '../../../shared/src/index.js'
import { TranscriptExtractionProvider } from '../providers/extractor/types.js'

export class ExtractionService {
  constructor(private readonly provider: TranscriptExtractionProvider) {}

  async extractFromTranscript(transcript: string) {
    const result = await this.provider.extractCallMetadata({ transcript })
    return ExtractedCallFieldsSchema.parse(result)
  }
}
