import type { HeartbeatThresholds } from '@agent-hq/domain';

export const CONNECTION_STORE = Symbol('CONNECTION_STORE');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const CONNECTION_SETTINGS = Symbol('CONNECTION_SETTINGS');

export type Clock = () => Date;
export type IdGenerator = () => string;

export interface ConnectionSettings {
  tokenTtlMs: number;
  thresholds: HeartbeatThresholds;
  /** How often the background job re-evaluates connection health; 0 disables the job. */
  healthCheckIntervalMs: number;
}

/** Authenticated caller attached to the request by ConnectionTokenGuard. */
export interface ConnectionPrincipal {
  connectionId: string;
  workspaceId: string;
}
