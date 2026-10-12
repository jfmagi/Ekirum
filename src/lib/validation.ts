/**
 * Centralized maximum length constraints and string clamping utilities
 * to prevent unbounded input memory bloat, UI layout breakage, and parsing latency.
 */

export const MAX_LENGTHS = {
  TASK_TITLE: 500,
  TASK_NOTES: 10000,
  SUBTASK_TITLE: 300,
  LABEL: 50,
  PROJECT_NAME: 100,
  PROJECT_DESCRIPTION: 1000,
  SKILL_NAME: 100,
  HABIT_TITLE: 150,
  HABIT_DESCRIPTION: 1000,
  LIBRARY_TITLE: 300,
  LIBRARY_CREATOR: 150,
  LIBRARY_NOTES: 10000,
  USER_NAME: 100,
} as const;

export function clampString(val: unknown, max: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.slice(0, max);
}

export function clampOptionalString(val: unknown, max: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}
