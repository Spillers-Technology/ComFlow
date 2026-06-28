import { z } from 'zod'
import { EngineSecretStatusSchema } from './engine.js'

const nullableTrimmedString = (max = 512) =>
  z.preprocess(
    value => {
      if (typeof value !== 'string') return value ?? null
      const trimmed = value.trim()
      return trimmed ? trimmed : null
    },
    z.string().min(1).max(max).nullable()
  )

const OptionalSipUriSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  },
  z
    .string()
    .max(300)
    .regex(/^sips?:[^@\s;<>]+@[^;\s<>]+$/i, {
      message: 'SIP account URI must look like sip:user@domain.',
    })
    .nullable()
)

const OptionalOutboundProxySchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  },
  z
    .string()
    .max(300)
    .regex(/^sips?:[^\s;<>]+$/i, {
      message: 'Outbound proxy must look like sip:proxy.example.com.',
    })
    .nullable()
)

const OptionalDialingDomainSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  },
  z
    .string()
    .max(255)
    .regex(/^[^\s;<>]+$/, {
      message: 'Outbound dialing domain cannot contain whitespace or SIP separators.',
    })
    .nullable()
)

const RegistrationIntervalSchema = z.preprocess(
  value => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(60).max(86_400).default(600)
)

const CodecSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_.+-]+\/[0-9]+\/[0-9]+$/, {
    message: 'Codecs must look like PCMU/8000/1.',
  })

const PreferredCodecsSchema = z.preprocess(
  value => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    }
    return value ?? []
  },
  z.array(CodecSchema).max(20).default([])
)

export const SipSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    accountLabel: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_.-]+$/, {
        message:
          'Account label may only contain letters, numbers, dots, underscores, and dashes.',
      })
      .default('main'),
    accountUri: OptionalSipUriSchema,
    authUsername: nullableTrimmedString(200),
    outboundProxy: OptionalOutboundProxySchema,
    outboundDialingDomain: OptionalDialingDomainSchema,
    registrationInterval: RegistrationIntervalSchema,
    preferredCodecs: PreferredCodecsSchema,
  })
  .superRefine((settings, context) => {
    if (settings.enabled && !settings.accountUri) {
      context.addIssue({
        code: 'custom',
        path: ['accountUri'],
        message: 'SIP account URI is required when SIP is enabled.',
      })
    }
  })

const WriteOnlySipSecretSchema = z.string().trim().min(1)

export const UpdateSipSecretsInputSchema = z.object({
  authPassword: WriteOnlySipSecretSchema.nullable().optional(),
})

export const UpdateSipSettingsRequestSchema = z.preprocess(
  input => {
    if (
      input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      'settings' in input
    ) {
      return input
    }

    return { settings: input }
  },
  z.object({
    settings: SipSettingsSchema,
    secrets: UpdateSipSecretsInputSchema.optional(),
  })
)

export const SipSecretStatusMapSchema = z.object({
  authPassword: EngineSecretStatusSchema,
})

export const SipRuntimeStatusSchema = z.object({
  telephonyMode: z.enum(['fake', 'baresip']),
  controlHost: z.string(),
  controlPort: z.number(),
  controlConnected: z.boolean(),
  accountsPath: z.string(),
  accountsLastWrittenAt: z.string().nullable(),
  restartSupported: z.boolean(),
  restartMechanism: z.enum(['supervisor', 'unavailable']),
})

export const GetSipSettingsResponseSchema = z.object({
  settings: SipSettingsSchema,
  secrets: SipSecretStatusMapSchema,
  status: SipRuntimeStatusSchema,
})

export const UpdateSipSettingsResponseSchema = GetSipSettingsResponseSchema

export const GetSipStatusResponseSchema = z.object({
  status: SipRuntimeStatusSchema,
})

export const RestartSipResponseSchema = z.object({
  ok: z.boolean(),
  supported: z.boolean(),
  message: z.string(),
  status: SipRuntimeStatusSchema,
})

export type SipSettings = z.infer<typeof SipSettingsSchema>
export type UpdateSipSecretsInput = z.infer<typeof UpdateSipSecretsInputSchema>
export type UpdateSipSettingsRequest = z.infer<
  typeof UpdateSipSettingsRequestSchema
>
export type SipSecretStatusMap = z.infer<typeof SipSecretStatusMapSchema>
export type SipRuntimeStatus = z.infer<typeof SipRuntimeStatusSchema>
export type GetSipSettingsResponse = z.infer<
  typeof GetSipSettingsResponseSchema
>
export type UpdateSipSettingsResponse = z.infer<
  typeof UpdateSipSettingsResponseSchema
>
export type GetSipStatusResponse = z.infer<typeof GetSipStatusResponseSchema>
export type RestartSipResponse = z.infer<typeof RestartSipResponseSchema>
