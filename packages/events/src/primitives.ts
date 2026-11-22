import { z } from 'zod';
import { EVENT_LIMITS } from './limits.js';

// Control characters (incl. NUL) are rejected: PostgreSQL TEXT cannot store NUL, and
// identifiers with control characters are never legitimate.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]*$/;
// Summaries may contain line breaks but never NUL.
// eslint-disable-next-line no-control-regex -- matching NUL is the point
const NO_NUL = /^[^\u0000]*$/;

export const idSchema = z
  .string()
  .min(1)
  .max(EVENT_LIMITS.maxIdLength)
  .regex(NO_CONTROL_CHARS, 'Must not contain control characters')
  .refine((value) => value.trim().length > 0, 'Must not be blank');

export const summarySchema = z
  .string()
  .max(EVENT_LIMITS.maxSummaryLength)
  .regex(NO_NUL, 'Must not contain NUL characters');

/** ISO-8601 UTC timestamp with a `Z` suffix (no local offsets). */
export const utcTimestampSchema = z.iso.datetime();
export const nonNegativeIntSchema = z.number().int().nonnegative();
