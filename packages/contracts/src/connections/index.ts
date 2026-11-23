import { CONNECTION_STATUSES } from '@agent-hq/domain';
import { z } from 'zod';

const shortText = z.string().trim().min(1).max(100);

/** POST /connections — register a source with a one-time registration code (HQ-103). */
export const registerConnectionRequestSchema = z.strictObject({
  registrationCode: z.string().min(1).max(200),
  adapterId: shortText,
  runtime: shortText,
  displayName: shortText.optional(),
});
export type RegisterConnectionRequest = z.infer<typeof registerConnectionRequestSchema>;

export const registerConnectionResponseSchema = z.object({
  connectionId: z.string(),
  workspaceId: z.string(),
  /** Shown exactly once. Send it as `Authorization: Bearer <token>`; HQ stores only a hash. */
  token: z.string(),
  tokenExpiresAt: z.iso.datetime(),
});
export type RegisterConnectionResponse = z.infer<typeof registerConnectionResponseSchema>;

/** POST /connections/:id/heartbeat — authenticated with the connection token. */
export const heartbeatResponseSchema = z.object({
  connectionId: z.string(),
  status: z.enum(CONNECTION_STATUSES),
  lastHeartbeatAt: z.iso.datetime(),
});
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
