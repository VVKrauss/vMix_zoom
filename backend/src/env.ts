import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_ORIGIN: z.string().min(1), // https://redflow.online

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('redflow'),
  // Access token lifetime. Refresh cookie still exists for rotation, but UX must not require re-login every 15 minutes.
  // Default: 90 days.
  ACCESS_TTL_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 90),
  REFRESH_TTL_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  REFRESH_COOKIE_NAME: z.string().min(1).default('rf_refresh'),

  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // New format: separate buckets (matches frontend contract)
  S3_BUCKET_AVATARS: z.string().min(1).optional(),
  S3_BUCKET_MESSENGER_MEDIA: z.string().min(1).optional(),
  // Legacy fallback: single bucket with "{bucket}/{path}" key prefix
  S3_BUCKET: z.string().min(1).optional(),

  // Web Push (optional)
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(), // e.g. "mailto:support@redflow.online" or "https://redflow.online"
})
.superRefine((v, ctx) => {
  const hasSplit = Boolean(v.S3_BUCKET_AVATARS) && Boolean(v.S3_BUCKET_MESSENGER_MEDIA)
  const hasLegacy = Boolean(v.S3_BUCKET)
  if (!hasSplit && !hasLegacy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_BUCKET_AVATARS'],
      message: 'Set S3_BUCKET_AVATARS and S3_BUCKET_MESSENGER_MEDIA (preferred), or legacy S3_BUCKET',
    })
  }
})

export type Env = z.infer<typeof EnvSchema>

export function readEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid env:\n${msg}`)
  }
  return parsed.data
}
