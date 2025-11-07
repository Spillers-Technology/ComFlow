import { Voicemail, ConfidenceLevel } from './types'

export const mockVoicemails: Voicemail[] = [
  {
    id: '1',
    from: 'Acme Corp',
    number: '+1 (555) 012-3000',
    time: '2 min ago',
    summary: 'Asking about rescheduling a demo tomorrow.',
    confidence: 'high',
    transcript: [
      { t: '00:00', text: 'Hi, this is Sarah from Acme Corp.', conf: 'high' },
      {
        t: '00:04',
        text: 'We’d like to confirm or reschedule tomorrow’s call.',
        conf: 'high',
      },
      {
        t: '00:10',
        text: 'Please call me back when convenient.',
        conf: 'med',
      },
    ],
  },
  {
    id: '2',
    from: 'Unknown',
    number: '+1 (555) 889-1122',
    time: '18 min ago',
    summary: 'Missed call, partial voicemail about invoice.',
    confidence: 'med',
    transcript: [
      {
        t: '00:00',
        text: 'Hey, just checking on that invoice...',
        conf: 'med',
      },
    ],
  },
  {
    id: '3',
    from: 'Mom',
    number: '+1 (555) 222-7788',
    time: '1 hr ago',
    summary: 'Friendly check-in.',
    confidence: 'high',
    transcript: [
      {
        t: '00:00',
        text: 'Hi honey, just wanted to hear your voice.',
        conf: 'high',
      },
    ],
  },
  {
    id: '4',
    from: 'Spam Likely',
    number: '+1 (555) 999-0000',
    time: '2 hr ago',
    summary: 'Likely robocall detected.',
    confidence: 'low',
    transcript: [
      {
        t: '00:00',
        text: 'Congratulations you have been selected...',
        conf: 'low',
      },
    ],
  },
  {
    id: '5',
    from: 'Client Support Line',
    number: '+1 (555) 400-2121',
    time: 'Yesterday',
    summary: 'User requesting password reset assistance.',
    confidence: 'high',
    transcript: [
      {
        t: '00:00',
        text: 'We’re locked out of the portal, can you help?',
        conf: 'high',
      },
    ],
  },
]

export function confidenceColor(
  level: ConfidenceLevel
): 'success' | 'warning' | 'error' {
  if (level === 'high') return 'success'
  if (level === 'med') return 'warning'
  return 'error'
}
