import {
  CallRecord,
  ExtractedCallFields,
} from '../../../../shared/src/index.js'

export interface LanguageModelProvider {
  extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields>
  generateCallbackScript(input: {
    call: CallRecord
    notes: string | null
  }): Promise<{ script: string }>
}
