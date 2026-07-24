import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PermissionsAndroid, Platform } from 'react-native';

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
    // RESTORED (2026-07-23): requesting a foreground service is what keeps
    // location updates flowing reliably once the app is backgrounded/screen-
    // locked (TQ-21's "pokračuje v ukládání aktivní trasy, když je telefon
    // zamčený" acceptance criterion) — and also happens to skip the
    // ACCESS_BACKGROUND_LOCATION requirement entirely (LocationModule.kt's
    // startLocationUpdatesAsync only demands it when foregroundService is
    // absent), so a first-ever session (foreground permission only, per
    // TQ-20's deferred "Always" request) can still register.
    //
    // This was previously removed because expo-location's
    // LocationTaskConsumer.kt started the foreground service from a
    // ServiceConnection.onServiceConnected callback with zero exception
    // handling — any SecurityException/ForegroundServiceStartNotAllowedException
    // there (a real, documented Android 12+/14 restriction) crashed the
    // whole process uncatchably from JS. That's now patched at the source
    // (see patches/expo-location+57.0.5.patch — applied automatically via
    // the postinstall script) to catch and log instead of crash, falling
    // back to plain (non-foreground) location delivery when the OS refuses
    // to grant foreground elevation. startLocationTracking below still keeps
    // a watchPositionAsync fallback as defense in depth in case task
    // registration itself is rejected (e.g. ForegroundServiceStartNotAllowedException
    // thrown at registration time, not just inside the service callback).
    //
    // killServiceOnDestroy: true (2026-07-24) — ambient tracking's explicit
    // design: keeps running through screen-lock/backgrounding exactly as
    // above, but stops the moment the user swipes the app away from
    // Recents. Confirmed from expo-location's own native source
    // (LocationTaskService.kt's onTaskRemoved) that this distinction is
    // real: onTaskRemoved only fires on task removal, never on a plain
    // background/screen-lock, and only calls stop() when this flag is
    // true. No JS-side "stop tracking" call is needed for the app-closed
    // case at all — the OS does it.
    foregroundService: {
      notificationTitle: 'TerraQuest',
      notificationBody: 'Zaznamenává se tvůj průzkum',
      killServiceOnDestroy: true,
    },
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

// DEFENSE IN DEPTH (2026-07-23): the task-based path above is now the
// primary mechanism again (foregroundService restored), but registration
// can still legitimately fail — e.g. ForegroundServiceStartNotAllowedException
// thrown synchronously at registration time if AppForegroundedSingleton
// isn't yet marked foregrounded (a real race on cold-start resume, see
// explorer-context.tsx's crash-safe session hydration). Rather than
// silently swallowing that and capturing zero GPS data for the whole
// session (the bug this file was previously changed to fix), fall back to
// watchPositionAsync — a direct JS callback that only needs foreground
// permission and doesn't touch TaskManager/PendingIntent at all. It only
// reports updates while the app process is alive in the foreground, so the
// next startLocationTracking call (e.g. after a mode change re-registers,
// or the next app launch) gets another chance at the full task-based path.
let activeWatchSubscription: Location.LocationSubscription | null = null;

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

// Android 13+ (API 33+) gates ALL notifications behind a separate runtime
// permission from location — without it, the OS silently drops the
// foreground service's persistent notification without throwing anything:
// the service keeps running and location keeps flowing (confirmed by
// on-device testing — points and XP kept accumulating through a screen
// lock), but the user never sees the notification that's supposed to make
// that background activity visible. `killServiceOnDestroy: false` and the
// notification config above are otherwise inert without this.
async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
}

export async function startLocationTracking(profile: TrackingProfile = 'precise'): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;

  await ensureNotificationPermission();

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, optionsForProfile(profile));
    await stopWatchFallback();
    return;
  } catch {
    // Registration itself was rejected — fall back below rather than
    // capturing zero location data for this session.
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
