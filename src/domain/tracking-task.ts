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

function watchOptionsForProfile(profile: TrackingProfile): Location.LocationOptions {
  const full = optionsForProfile(profile);
  return { accuracy: full.accuracy, timeInterval: full.timeInterval, distanceInterval: full.distanceInterval };
}

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
    // TEMPORARY REGRESSION (2026-07-23) — deliberately NOT requesting a
    // foreground service. expo-location's Android LocationTaskConsumer
    // starts the foreground service from a ServiceConnection.onServiceConnected
    // callback (LocationTaskConsumer.kt ~line 214-222) with zero exception
    // handling around context.startForegroundService()/startForeground() —
    // verified unchanged in both the installed 57.0.5 and latest 57.0.6.
    // Any SecurityException/ForegroundServiceStartNotAllowedException there
    // (a real, well-documented Android 12+/14 restriction on when a
    // foreground service may be started) crashes the whole process, and
    // since it fires from a system callback outside any JS await chain, no
    // amount of try/catch on our side can intercept it — confirmed this was
    // the actual cause of an on-device crash when starting a session, which
    // then reproduced on every subsequent launch (explorer-context.tsx's
    // crash-safe "resume an active session" hydration path replayed the
    // exact same call). Omitting the `foregroundService` key makes
    // expo-location skip that code path entirely (shouldUseForegroundService
    // just checks whether the key exists).
    //
    // Real cost: without a foreground service, Android's background
    // execution limits mean location updates stop reliably once the app is
    // backgrounded/screen-locked — TQ-21's "pokračuje v ukládání aktivní
    // trasy, když je telefon zamčený" acceptance criterion is NOT met while
    // this is disabled. Re-enable once expo-location fixes this upstream, or
    // this is replaced with a hardened custom implementation.
  };
}

let persistencePromise: ReturnType<typeof getLocalPersistence> | null = null;
function persistence() {
  if (!persistencePromise) persistencePromise = getLocalPersistence();
  return persistencePromise;
}

type LocationTaskData = { locations: Location.LocationObject[] };

async function persistIncomingLocations(locations: Location.LocationObject[]): Promise<void> {
  if (!locations.length) return;
  const db = await persistence();
  // The DB is the single source of truth for sequence numbers — a background
  // task invocation can't share in-memory state with whatever React state
  // (if any) is currently mounted, and doesn't need to.
  let sequence = await db.trackPoints.count(LOCAL_SESSION_ID);
  for (const location of locations) {
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
}

// Registered at module scope, per TaskManager's requirement — this file must
// be imported unconditionally very early (see src/app/_layout.tsx), since the
// OS can invoke this task after restarting the app process with no React
// tree mounted at all, e.g. to deliver a batch of background location
// updates while the app was fully backgrounded.
TaskManager.defineTask<LocationTaskData>(LOCATION_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  await persistIncomingLocations(data.locations);
});

// TQ-21/TQ-31 REGRESSION FALLBACK (2026-07-23): expo-location's task-based
// startLocationUpdatesAsync requires ACCESS_BACKGROUND_LOCATION ("Always")
// the moment `foregroundService` isn't requested — LocationModule.kt's
// startLocationUpdatesAsync throws LocationBackgroundUnauthorizedException
// whenever `!shouldUseForegroundService && isMissingBackgroundPermissions()`.
// Since removing `foregroundService` above (crash fix), and since TQ-20's
// onboarding deliberately doesn't request "Always" until AFTER a user's
// first completed session, a first-ever session held only foreground
// permission and could never register the task at all — zero real GPS
// points captured, silently swallowed by this module's .catch(() =>
// undefined), falling back to demo data in the UI.
//
// watchPositionAsync only checks foreground permission (LocationModule.kt's
// watchPositionImplAsync calls isMissingForegroundPermissions(), full stop)
// and delivers via a direct JS callback rather than a PendingIntent/task, so
// it works whenever the task-based API can't yet. It only reports updates
// while the app process is alive in the foreground — same limitation the
// task-based path already has without a foreground service — so once
// background permission is eventually granted we switch back to the
// task-based path, which registers as a pure background *service* (not a
// foreground service) and doesn't hit the crash at all in that branch.
let activeWatchSubscription: Location.LocationSubscription | null = null;

async function hasBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

async function stopWatchFallback(): Promise<void> {
  activeWatchSubscription?.remove();
  activeWatchSubscription = null;
}

async function startWatchFallback(profile: TrackingProfile): Promise<void> {
  await stopWatchFallback();
  activeWatchSubscription = await Location.watchPositionAsync(watchOptionsForProfile(profile), (location) => {
    void persistIncomingLocations([location]);
  });
}

export async function startLocationTracking(profile: TrackingProfile = 'precise'): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;

  if (await hasBackgroundPermission()) {
    await stopWatchFallback();
    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, optionsForProfile(profile)).catch(() => undefined);
    return;
  }

  await startWatchFallback(profile).catch(() => undefined);
}

export async function stopLocationTracking(): Promise<void> {
  await stopWatchFallback();
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => undefined);
}

/** Re-registers the same task with a different profile's options — expo-location updates an already-running task in place rather than erroring, so this is cheap and doesn't drop in-flight updates. */
export async function updateLocationTrackingProfile(profile: TrackingProfile): Promise<void> {
  if (activeWatchSubscription) {
    await startWatchFallback(profile).catch(() => undefined);
    return;
  }
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME).catch(() => false);
  if (!started) return;
  await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, optionsForProfile(profile)).catch(() => undefined);
}
