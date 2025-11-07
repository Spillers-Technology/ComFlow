export type View =
  | 'auth'
  | 'wizard'
  | 'setup-complete'
  | 'dashboard'
  | 'voicemail-detail'
  | 'settings'

export type WizardStepKey = 'sip' | 'llm' | 'tts' | 'callTest'

export interface WizardStepState {
  done: boolean
  error?: string
}

export type WizardState = Record<WizardStepKey, WizardStepState>

export type ConfidenceLevel = 'high' | 'med' | 'low'

export interface TranscriptLine {
  t: string
  text: string
  conf: ConfidenceLevel
}

export interface Voicemail {
  id: string
  from: string
  number: string
  time: string
  summary: string
  confidence: ConfidenceLevel
  transcript: TranscriptLine[]
}
