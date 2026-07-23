import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { trackingProfileForMode, type TrackingProfile } from './tracking-profile';

import { getLocalPersistence } from '@/data/local';

export const LOCATION_TRACKING_TASK_NAME = 'terraquest-location-tracking';

// Single reusable session id for this prototype phase; multi-session history
// arrives with real per-expedition history (Fáze 4). Shared between this
// background task and explorer-context.tsx so both write the same session.
export const LOCAL_SESSION_ID = 'primary';

export { trackingProfileForMode };
export type { TrackingProfile };

function optionsForProfile(profile: TrackingProfile): Location.LocationTaskOptions {
  const precise = profile === 'precise';
  return {
    accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
    distanceInterval: precise ? 8 : 30,
    timeInterval: precise ? 5000 : 15000,
    // Lets Android batch fixes and wake the CPU/radio less often instead of
    // delivering every sample immediately — the fog-reveal-within-2s
    // acceptance criterion (TQ-23) is measured from when a point is
    // *captured* (written to SQLite), not from when the GPS fix occurred.
    deferredUpdatesInterval: precise ? 8000 : 20000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'TerraQuest',
      notificationBody: 'Zaznamenává se tvůj průzkum',
      killServiceOnDestroy: false,
    },
  };
}

let persistencePromise: ReturnType<typeof getLocalPersistence> | null = null;
function persistence() {
  if (!persistencePromise) persistencePromise = getLocalPersistence();
  return persistencePromise;
}

type LocationTaskData = { locations: Location.LocationObject[] };

// Registered at module scope, per TaskManager's requirement — this file must
// be imported unconditionally very early (see src/app/_layout.tsx), since the
// OS can invoke this task after restarting the app process with no React
// tree mounted at all, e.g. to deliver a batch of background location
// updates while the app was fully backgrounded.
TaskManager.defineTask<LocationTaskData>(LOCATION_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const db = await persistence();
  // The DB is the single source of truth for sequence numbers — a background
  // task invocation can't share in-memory state with whatever React state
  // (if any) is currently mounted, and doesn't need to.
  let sequence = await db.trackPoints.count(LOCAL_SESSION_ID);
  for (const location of data.locations) {
    await db.trackPoints.insert({
      sessionId: LOCAL_SESSION_ID,
      sequence,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      capturedAt: location.timestamp,
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      bearing: location.coords.heading ?? null,
      mockFlag: location.mocked ?? false,
    });
    sequence += 1;
  }
  await db.trackPoints.pruneToLast(LOCAL_SESSION_ID, 2000).catch(() => undefined);
});

export async function startLocationTracking(profile: TrackingProfile = 'precise'): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;
  await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, optionsForProfile(profile)).catch(() => undefined);
}

export async function stopLocationTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => undefined);
}

/** Re-registers the same task with a different profile's options — expo-location updates an already-running task in place rather than erroring, so this is cheap and doesn't drop in-flight updates. */
export async function updateLocationTrackingProfile(profile: TrackingProfile): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => false);
  if (!started) return;
  await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, optionsForProfile(profile)).catch(() => undefined);
}
