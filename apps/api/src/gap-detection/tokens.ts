export interface GapSettings {
  /** How often sessions are checked for sequence holes; 0 disables the job. */
  checkIntervalMs: number;
  /** A hole is recorded only once its next event is at least this old (late arrivals). */
  graceMs: number;
}

export const GAP_SETTINGS = Symbol('GAP_SETTINGS');
export const GAP_STORE = Symbol('GAP_STORE');
