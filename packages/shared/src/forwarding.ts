// Carrier call-forwarding codes used by the QR "scan to forward" onboarding.
// Each code is a dial string with a {number} placeholder for the tenant's DID.
// Conditional forwarding (busy / no answer / unreachable) leaves the phone
// ringing normally and only hands missed calls to ComFlow; unconditional sends
// every call straight to the DID and is presented with a warning.

export type ForwardingMode = 'conditional' | 'unconditional'

export type ForwardingCode = {
  mode: ForwardingMode
  label: string
  // Dial string with {number}; rendered via renderForwardingCode().
  code: string
}

export type ForwardingCarrier = {
  id: string
  label: string
  // How the DID should be substituted into {number}: full +E.164 (GSM MMI
  // codes accept it) or 10-digit national (Verizon-style star codes).
  numberFormat: 'e164' | 'national'
  notes?: string
  activation: ForwardingCode[]
  deactivation: { label: string; code: string }[]
}

export const FORWARDING_CARRIERS: ForwardingCarrier[] = [
  {
    id: 'gsm',
    label: 'AT&T, T-Mobile & most GSM carriers',
    numberFormat: 'e164',
    notes:
      'Standard GSM forwarding codes. Some handsets refuse to dial these from ' +
      'a link or QR scan — if nothing happens, copy the code into the dialer.',
    activation: [
      {
        mode: 'conditional',
        label: 'Forward missed calls only (busy, no answer, unreachable)',
        code: '**004*{number}#',
      },
      {
        mode: 'unconditional',
        label: 'Forward ALL calls',
        code: '**21*{number}#',
      },
    ],
    deactivation: [
      { label: 'Stop forwarding missed calls', code: '##004#' },
      { label: 'Stop forwarding all calls', code: '##21#' },
    ],
  },
  {
    id: 'verizon',
    label: 'Verizon',
    numberFormat: 'national',
    notes:
      'Verizon star codes use the 10-digit number. Dial and wait for the ' +
      'confirmation tone.',
    activation: [
      {
        mode: 'conditional',
        label: 'Forward missed calls only (busy / no answer)',
        code: '*71{number}',
      },
      {
        mode: 'unconditional',
        label: 'Forward ALL calls',
        code: '*72{number}',
      },
    ],
    deactivation: [{ label: 'Stop all forwarding', code: '*73' }],
  },
]

/** Format a +E.164 DID the way a carrier's dial codes expect it. */
export function formatDidForCarrier(
  didNumber: string,
  format: ForwardingCarrier['numberFormat']
): string {
  const digits = didNumber.replace(/[^0-9+]/g, '')
  if (format === 'e164') {
    return digits.startsWith('+') ? digits : `+${digits}`
  }
  // National: strip +1 / leading 1 down to the 10-digit number.
  const bare = digits.replace(/^\+?1?/, '')
  return bare
}

/** Substitute the DID into a forwarding code's {number} placeholder. */
export function renderForwardingCode(
  code: string,
  didNumber: string,
  format: ForwardingCarrier['numberFormat']
): string {
  return code.replace('{number}', formatDidForCarrier(didNumber, format))
}

/**
 * A tel: URI that dials a forwarding code. `#` must be percent-encoded and `*`
 * is encoded too for maximum scanner compatibility. Many handsets block MMI
 * strings from links as an anti-fraud measure — callers should always offer the
 * plain code as a copyable fallback.
 */
export function forwardingTelUri(dialString: string): string {
  return `tel:${dialString.replace(/\*/g, '%2A').replace(/#/g, '%23')}`
}
