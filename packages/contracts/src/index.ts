export { API_ERROR_CODES, errorBody, errorEnvelopeSchema } from './errors.js';
export type { ApiErrorCode, ErrorEnvelope } from './errors.js';
export {
  heartbeatResponseSchema,
  registerConnectionRequestSchema,
  registerConnectionResponseSchema,
} from './connections/index.js';
export type {
  HeartbeatResponse,
  RegisterConnectionRequest,
  RegisterConnectionResponse,
} from './connections/index.js';
