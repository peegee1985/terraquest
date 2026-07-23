import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

// TQ-46: Android-only wrapper around react-native-health-connect. Every
// function here degrades gracefully (returns false/0, never throws) —
// callers (the daily-steps hook, the per-session step query in
// explorer-context.tsx) treat "Health Connect isn't available", "permission
// wasn't granted", and "the query itself failed" identically: no steps to
// show/count, not a crash. iOS has no equivalent wired here — this app has
// no iOS build pipeline (see the rest of this project's Android-only EAS
// setup), so there's nothing to bridge to yet.

const STEPS_READ_PERMISSION = { accessType: 'read' as const, recordType: 'Steps' as const };

let initialized = false;

export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus().catch(() => SdkAvailabilityStatus.SDK_UNAVAILABLE);
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

async function ensureInitialized(): Promise<boolean> {
  if (!(await isHealthConnectAvailable())) return false;
  if (!initialized) {
    initialized = await initialize().catch(() => false);
  }
  return initialized;
}

export async function isStepsPermissionGranted(): Promise<boolean> {
  if (!(await ensureInitialized())) return false;
  const granted = await getGrantedPermissions().catch(() => []);
  return granted.some((permission) => permission.recordType === 'Steps' && permission.accessType === 'read');
}

export async function requestStepsPermission(): Promise<boolean> {
  if (!(await ensureInitialized())) return false;
  const granted = await requestPermission([STEPS_READ_PERMISSION]).catch(() => []);
  return granted.some((permission) => permission.recordType === 'Steps' && permission.accessType === 'read');
}

/** Total steps in [start, end]. Returns 0 (never throws) if Health Connect is unavailable, the read permission isn't granted, or the query fails for any other reason. */
export async function getStepsBetween(start: Date, end: Date): Promise<number> {
  if (start > end) return 0;
  if (!(await isStepsPermissionGranted())) return 0;
  const result = await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  }).catch(() => null);
  return result?.COUNT_TOTAL ?? 0;
}
