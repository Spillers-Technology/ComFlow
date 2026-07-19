// Carrier call-forwarding instructions used by the "scan to forward"
// onboarding. Dial-code support is carrier-specific: do not infer it from the
// handset alone, and always keep manual/copy instructions beside any QR code.

export type ForwardingMode = 'conditional' | 'unconditional'
export type ForwardingNumberFormat = 'nanp10' | 'nanp11'

export type ForwardingCode = {
  mode: ForwardingMode
  label: string
  description: string
  // Dial string with {number}; rendered via renderForwardingCode().
  code: string
}

export type ForwardingDeactivationCode = {
  mode: ForwardingMode | 'all'
  label: string
  code: string
}

export type ForwardingCarrier = {
  id: string
  label: string
  setup: 'dial-codes' | 'device-settings'
  numberFormat: ForwardingNumberFormat | null
  notes: string
  helpUrl?: string
  activation: ForwardingCode[]
  deactivation: ForwardingDeactivationCode[]
}

/**
 * Codes below intentionally follow current carrier-published instructions.
 * AT&T publishes device-specific settings guidance rather than a universal MMI
 * sequence, so it is represented as a manual path instead of being folded into
 * an over-broad "GSM" option.
 */
export const FORWARDING_CARRIERS: ForwardingCarrier[] = [
  {
    id: 't-mobile',
    label: 'T-Mobile',
    setup: 'dial-codes',
    numberFormat: 'nanp11',
    notes:
      'T-Mobile uses 1 plus the 10-digit destination. Conditional setup requires ' +
      'three codes so busy, unanswered, and unreachable calls are all covered.',
    helpUrl: 'https://www.t-mobile.com/support/plans-features/self-service-short-codes',
    activation: [
      {
        mode: 'conditional',
        label: 'No answer',
        description: 'Forward calls you do not answer.',
        code: '**61*{number}#',
      },
      {
        mode: 'conditional',
        label: 'Not reachable',
        description: 'Forward calls when the phone is off or out of coverage.',
        code: '**62*{number}#',
      },
      {
        mode: 'conditional',
        label: 'Busy',
        description: 'Forward calls when your line is busy.',
        code: '**67*{number}#',
      },
      {
        mode: 'unconditional',
        label: 'All calls',
        description: 'Send every incoming call directly to ComFlow.',
        code: '**21*{number}#',
      },
    ],
    deactivation: [
      { mode: 'conditional', label: 'Stop no-answer forwarding', code: '##61#' },
      { mode: 'conditional', label: 'Stop unreachable forwarding', code: '##62#' },
      { mode: 'conditional', label: 'Stop busy forwarding', code: '##67#' },
      { mode: 'unconditional', label: 'Stop all-call forwarding', code: '##21#' },
      {
        mode: 'all',
        label: 'Restore T-Mobile forwarding defaults',
        code: '##004#',
      },
    ],
  },
  {
    id: 'verizon',
    label: 'Verizon',
    setup: 'dial-codes',
    numberFormat: 'nanp10',
    notes:
      'Verizon uses the 10-digit destination. Dial the code and wait for the ' +
      'confirmation tone or message before ending the call.',
    helpUrl: 'https://www.verizon.com/support/pound-star-codes/',
    activation: [
      {
        mode: 'conditional',
        label: 'Unanswered or busy calls',
        description: 'Your phone rings first; missed calls continue to ComFlow.',
        code: '*71{number}',
      },
      {
        mode: 'unconditional',
        label: 'All calls',
        description: 'Send every incoming call directly to ComFlow.',
        code: '*72{number}',
      },
    ],
    deactivation: [{ mode: 'all', label: 'Stop Verizon call forwarding', code: '*73' }],
  },
  {
    id: 'att',
    label: 'AT&T',
    setup: 'device-settings',
    numberFormat: null,
    notes:
      'AT&T forwarding controls vary by phone. Use the Phone or Call settings on ' +
      'the AT&T device and enter the ComFlow number shown below.',
    helpUrl: 'https://www.att.com/support/article/wireless/KM1011513/',
    activation: [],
    deactivation: [],
  },
  {
    id: 'other',
    label: 'Another carrier',
    setup: 'device-settings',
    numberFormat: null,
    notes:
      'Open your phone or carrier account settings and look for Call Forwarding. ' +
      'Confirm conditional-forwarding support with your carrier before changing it.',
    activation: [],
    deactivation: [],
  },
]

/** Normalize a US/Canada DID for a carrier-published NANP dial code. */
export function formatDidForCarrier(
  didNumber: string,
  format: ForwardingNumberFormat
): string {
  const value = didNumber.trim()
  if (!/^\+?[0-9().\s-]+$/.test(value)) {
    throw new Error('The forwarding number is not a valid US or Canadian DID.')
  }

  const digits = value.replace(/\D/g, '')
  let national: string
  if (value.startsWith('+')) {
    if (digits.length !== 11 || !digits.startsWith('1')) {
      throw new Error('Forwarding codes currently support US and Canadian DIDs only.')
    }
    national = digits.slice(1)
  } else if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1)
  } else {
    national = digits
  }

  if (national.length !== 10 || national.startsWith('0') || national.startsWith('1')) {
    throw new Error('The forwarding number must be a valid 10-digit US or Canadian DID.')
  }

  return format === 'nanp11' ? `1${national}` : national
}

/** Substitute the DID into a forwarding code's {number} placeholder. */
export function renderForwardingCode(
  code: string,
  didNumber: string,
  format: ForwardingNumberFormat
): string {
  return code.replace('{number}', formatDidForCarrier(didNumber, format))
}

/**
 * Best-effort tel URI for Android and compatible dialers. Apple documents that
 * iOS will not dial tel links containing * or #, even when escaped, so every
 * caller must also receive a visible copy-to-dial path.
 */
export function forwardingTelUri(dialString: string): string {
  return `tel:${dialString.replace(/\*/g, '%2A').replace(/#/g, '%23')}`
}
