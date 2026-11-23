import { z } from 'zod';

/**
 * Error codes of the HTTP API. Names follow the adapter-spec §11 candidates where they apply.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTHENTICATION_FAILED',
  'REGISTRATION_CODE_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  /** Any other client error; retrying the same request will not help. */
  'REQUEST_REJECTED',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every non-2xx response body: `{ "error": { code, message, issues? } }`. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function errorBody(
  code: ApiErrorCode,
  message: string,
  issues?: { path: string; message: string }[],
): ErrorEnvelope {
  return { error: { code, message, ...(issues === undefined ? {} : { issues }) } };
}
