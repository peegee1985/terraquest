import * as Location from 'expo-location';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { demoRoute } from '@/data/demo';
import { getLocalPersistence, type LocalPersistence, type LocalSessionRow } from '@/data/local';
import { isSameLocalDay } from '@/domain/checkpoint';
import { distanceXp, explorationXp } from '@/domain/progression';
import { cellsRevealedByPoint, cellsRevealedByRoute, centerlineCellsForRoute, SATELLITE_SCAN_RING_RADIUS, type LatLng } from '@/domain/fog';
import { filterRoute, routeDistanceMeters } from '@/domain/gps-filter';
import { getStepsBetween } from '@/domain/health-connect';
import { classifyMovement, computeRollingSpeedMps, movementModeBit, MANUAL_REVEAL_MODE_BIT } from '@/domain/movement';
import { ExplorerSnapshot, MovementMode, TrackPoint } from '@/domain/types';
import {
  LOCAL_SESSION_ID,
  startLocationTracking,
  trackingProfileForMode,
  updateLocationTrackingProfile,
  type TrackingProfile,
} from '@/domain/tracking-task';
import { convex } from '@/state/convex-client';
import { useMyProfile } from '@/state/profile-client';
import {
  convexSessionSyncTransport,
  NOT_YET_CONFIGURED_TRANSPORT,
  processDueSyncEvents,
  SESSION_SYNC_EVENT_TYPE,
  sessionSyncEventId,
  type SessionSyncPayload,
} from '@/state/session-sync';

/**
 * TQ-122: reports the live reveal-ring radius (base + permanent level bump
 * + active temporary boost) up to ExplorerProvider via a ref rather than
 * context state, so a boost expiring mid-session doesn't need to re-run
 * the reveal effect below — only ever mounted when `convex` is truthy
 * (useMyProfile's useQuery needs a ConvexProvider ancestor, same
 * precondition as every other useMyProfile call site) since ExplorerProvider
 * itself mounts unconditionally, unlike the screens that already guard this.
 */
function RingRadiusWatcher({ onChange }: { onChange: (ringRadius: number) => void }) {
  const profile = useMyProfile();
  useEffect(() => {
    onChange(profile?.currentRingRadius ?? 1);
  }, [profile, onChange]);
  return null;
}

/**
 * Ambient tracking: no more manual start/pause/finish. `active` reflects
 * whether we currently have foreground location permission and tracking is
 * actually running — it flips true automatically once permission is
 * granted (onboarding, or later via Settings) and runs continuously,
 * foreground and backgrounded/screen-locked alike, until the user actually
 * closes the app (tracking-task.ts's killServiceOnDestroy:true stops the
 * native service on task removal — no JS-side "stop" call needed for that).
 * There is deliberately no "paused" state.
 */
type SessionState = {
  active: boolean;
  mode: MovementMode;
  startedAt: number | null;
  elapsedSeconds: number;
  route: TrackPoint[];
};

type ExplorerContextValue = {
  snapshot: ExplorerSnapshot;
  session: SessionState;
  hasCompletedSession: boolean;
  revealedCells: string[];
  resetLocalHistory: () => Promise<{ ok: boolean; reason?: string }>;
  revealAreaAt: (point: LatLng) => Promise<void>;
};

const MAX_ROUTE_POINTS = 500;
// TQ-21: while tracking is active, re-read the route from the DB at the
// same cadence the background task writes to it — this is what makes the
// map reflect points regardless of whether they came from the foreground or
// while the app was backgrounded. TQ-23's "lokální odhalení do 2 sekund"
// acceptance criterion is what pulls this under 2000ms — it's just a local
// SQLite read, decoupled from the location task's own 5s GPS sampling rate.
const ROUTE_REFRESH_INTERVAL_MS = 1500;
// TQ-24: independent of tracking state — a checkpoint can still be waiting
// on outbox confirmation while the user browses elsewhere in the app, or
// the app could've been relaunched since the last one landed.
const SYNC_POLL_INTERVAL_MS = 30_000;
// How often ambient tracking packages up what's changed and submits it —
// frequent enough that quests/streaks/level-ups (useLevelUpCelebration
// watches live XP the whole time the app is open) feel responsive, without
// spamming the network or the anti-cheat ledger with tiny awards every few
// seconds.
const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;
// TQ-20: background location must not be offered until tracking has
// actually started once — this flag gates that in Settings.
const HAS_COMPLETED_SESSION_PREFERENCE_KEY = 'explorer.hasCompletedSession.v1';

const initialSession: SessionState = {
  active: false,
  mode: 'walk',
  startedAt: null,
  elapsedSeconds: 0,
  route: demoRoute,
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ExplorerSnapshot>({ totalXp: 0 });
  const [session, setSession] = useState<SessionState>(initialSession);
  const [hasCompletedSession, setHasCompletedSession] = useState(false);
  // TQ-23: cells ever revealed, loaded straight from local_explored_cell —
  // this is what makes the fog persistent across sessions and app restarts,
  // instead of resetting to only the current in-memory route each time.
  const [revealedCells, setRevealedCells] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const persistenceRef = useRef<LocalPersistence | null>(null);
  const nextSequenceRef = useRef(0);
  const modeRef = useRef<MovementMode>('walk');
  // TQ-25: tracks which tracking profile is currently applied so the
  // refresh poll only calls updateLocationTrackingProfile on an actual
  // change, not every 1.5s tick.
  const trackingProfileRef = useRef<TrackingProfile>('precise');
  // TQ-122: read fresh on every 1.5s reveal poll (not just captured once
  // when the reveal effect starts) so a radius boost activating or
  // expiring mid-session takes effect immediately.
  const ringRadiusRef = useRef(1);
  const handleRingRadiusChange = useCallback((ringRadius: number) => {
    ringRadiusRef.current = ringRadius;
  }, []);
  // Whatever local_session row existed at hydration time (any status,
  // including a legacy 'paused' one), or null on a brand-new install. The
  // ensureTracking effect below MUST preserve this row's accumulated
  // distance_m/new_cells/xp_pending/normalized_count_at_checkpoint on every
  // app relaunch rather than re-zeroing them — those fields are the
  // not-yet-confirmed-checkpoint cursor, and wiping them on every restart
  // would make the next checkpoint re-award exploration units that were
  // already counted before the restart.
  const existingSessionRowRef = useRef<LocalSessionRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalPersistence()
      .then(async (persistence) => {
        if (cancelled) return;
        persistenceRef.current = persistence;

        const [xpProjection, activeSession, storedRoute, hasCompletedSessionValue, storedRevealedCells] =
          await Promise.all([
            persistence.xpProjection.get(),
            persistence.session.getActive(),
            persistence.trackPoints.listBySession(LOCAL_SESSION_ID),
            persistence.preferences.get(HAS_COMPLETED_SESSION_PREFERENCE_KEY),
            persistence.exploredCells.listAllCellIds(),
          ]);
        if (cancelled) return;
        setHasCompletedSession(hasCompletedSessionValue === 'true');
        setRevealedCells(storedRevealedCells);

        // TQ-22: filter on read too — points written before this filter
        // existed (or a background-task edge case) could still carry a jump.
        const route: TrackPoint[] = storedRoute.length
          ? filterRoute(
              storedRoute.map((point) => ({
                latitude: point.latitude,
                longitude: point.longitude,
                accuracy: point.accuracy ?? null,
                timestamp: point.capturedAt,
              })),
            )
          : demoRoute;
        nextSequenceRef.current = storedRoute.length;

        setSnapshot((current) => ({ ...current, totalXp: xpProjection.confirmed_xp || current.totalXp }));

        if (activeSession) {
          existingSessionRowRef.current = activeSession;
          modeRef.current = activeSession.mode;
          trackingProfileRef.current = trackingProfileForMode(activeSession.mode);
          setSession((current) => ({
            ...current,
            mode: activeSession.mode,
            startedAt: activeSession.started_at,
            elapsedSeconds: activeSession.elapsed_seconds,
            route,
          }));
        } else {
          setSession((current) => ({ ...current, route }));
        }

        // A brand-new local install (never synced) starts at 0 XP, not a
        // placeholder value — a fresh player hasn't earned anything yet.
        if (xpProjection.updated_at === 0) {
          await persistence.xpProjection.applyServerSnapshot({
            confirmedXp: 0,
            serverSnapshotAt: Date.now(),
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Ambient lifecycle: as soon as (and for as long as) we have foreground
  // location permission, tracking runs — no button. Re-checked whenever the
  // app returns to the foreground so a permission change made in system
  // Settings is picked up without needing to relaunch.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const ensureTracking = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== Location.PermissionStatus.GRANTED) {
        setSession((current) => (current.active ? { ...current, active: false } : current));
        return;
      }

      await startLocationTracking(trackingProfileRef.current);
      if (cancelled) return;
      setSession((current) => {
        if (current.active) return current;

        // Preserve an existing row's accumulated checkpoint cursor across
        // an app relaunch (see existingSessionRowRef's comment) — only a
        // genuinely brand-new install gets a freshly-zeroed row. updated_at
        // is always reset to now, though: it anchors the NEXT checkpoint's
        // elapsed-time/step window, and an existing row's updated_at could
        // be from days ago (e.g. tracking stopped when the app was closed,
        // per this app's own "closing the app stops it" design) — carrying
        // that forward would make the first checkpoint after relaunch
        // claim a multi-day elapsed window instead of the few real minutes
        // since tracking actually resumed.
        const existing = existingSessionRowRef.current;
        const now = Date.now();
        const startedAt = existing?.started_at ?? current.startedAt ?? now;
        const next: SessionState = { ...current, active: true, startedAt, mode: existing?.mode ?? current.mode };
        persistenceRef.current?.session
          .upsert({
            id: LOCAL_SESSION_ID,
            status: 'active',
            mode: next.mode,
            started_at: startedAt,
            ended_at: null,
            elapsed_seconds: existing?.elapsed_seconds ?? 0,
            distance_m: existing?.distance_m ?? 0,
            new_cells: existing?.new_cells ?? 0,
            xp_pending: existing?.xp_pending ?? 0,
            last_confirmed_sequence: existing?.last_confirmed_sequence ?? nextSequenceRef.current,
            normalized_count_at_checkpoint: existing?.normalized_count_at_checkpoint ?? 0,
            updated_at: now,
          })
          .catch(() => undefined);
        existingSessionRowRef.current = null;

        setHasCompletedSession(true);
        persistenceRef.current?.preferences
          .set(HAS_COMPLETED_SESSION_PREFERENCE_KEY, 'true', Date.now())
          .catch(() => undefined);
        return next;
      });
    };

    void ensureTracking();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ensureTracking();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [hydrated]);

  // TQ-24: retries the outbox with backoff regardless of tracking state — a
  // checkpoint can be sitting in 'pending' (awaiting confirmation) at any
  // time, including right after an app restart. Uses the real Convex
  // transport when a client is configured (EXPO_PUBLIC_CONVEX_URL set);
  // falls back to NOT_YET_CONFIGURED_TRANSPORT otherwise, same
  // graceful-degradation pattern as _layout.tsx's BackendProvider.
  const syncTransport = useMemo(
    () => (convex ? convexSessionSyncTransport(convex) : NOT_YET_CONFIGURED_TRANSPORT),
    [],
  );
  useEffect(() => {
    if (!hydrated) return;
    const run = () => {
      const persistence = persistenceRef.current;
      if (!persistence) return;
      processDueSyncEvents(
        {
          outbox: persistence.outbox,
          trackPoints: persistence.trackPoints,
          session: persistence.session,
          xpProjection: persistence.xpProjection,
          transport: syncTransport,
        },
        Date.now(),
      ).catch(() => undefined);
    };
    const interval = setInterval(run, SYNC_POLL_INTERVAL_MS);
    run();
    return () => clearInterval(interval);
  }, [hydrated, syncTransport]);

  useEffect(() => {
    if (!session.active) return;
    const interval = setInterval(() => {
      setSession((current) => ({ ...current, elapsedSeconds: current.elapsedSeconds + 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.active]);

  // TQ-21: the background task (src/domain/tracking-task.ts) writes points
  // straight to SQLite without going through this component's state, since
  // it can run with no React tree mounted at all. Polling the DB is what
  // makes the map reflect those points, regardless of whether the app was
  // foregrounded or backgrounded when they were captured.
  useEffect(() => {
    if (!session.active) return;
    let cancelled = false;
    const refresh = async () => {
      const persistence = persistenceRef.current;
      const rows = await persistence?.trackPoints.listBySession(LOCAL_SESSION_ID);
      if (cancelled || !persistence || !rows || rows.length === 0) return;
      nextSequenceRef.current = rows.length;
      // TQ-22: a single bad GPS sample (jump/teleport) must not damage the
      // displayed route or feed a bogus speed into movement classification.
      const route = filterRoute(
        rows.slice(-MAX_ROUTE_POINTS).map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy ?? null,
          timestamp: point.capturedAt,
        })),
      );
      const speedMps = computeRollingSpeedMps(route);
      const mode = classifyMovement(speedMps, modeRef.current);
      modeRef.current = mode;
      setSession((current) => ({ ...current, route, mode }));

      // TQ-25: only switch the GPS profile on an actual mode change, not
      // every poll — bike/auto earn 0.35x/0x XP anyway (progression.ts), so
      // trading precision for battery life there costs nothing competitive.
      const profile = trackingProfileForMode(mode);
      if (profile !== trackingProfileRef.current) {
        trackingProfileRef.current = profile;
        updateLocationTrackingProfile(profile).catch(() => undefined);
      }

      // TQ-23: two independent cell sets from the same filtered route — a
      // wide visual reveal ring (cellsRevealedByRoute) and a narrow
      // centerline set that only counts for XP, and only while the detected
      // mode is walk/run (docs 03: kolo/vozidlo mají 0 pěších jednotek).
      // Persisting on every poll (not just at a checkpoint) is what makes
      // the fog reveal "within 2 seconds" instead of only after syncing.
      const seenAt = Date.now();
      const modeBit = movementModeBit(mode);
      const visualCells = cellsRevealedByRoute(route, undefined, ringRadiusRef.current);
      const normalizedCells = mode === 'walk' || mode === 'run' ? centerlineCellsForRoute(route) : new Set<string>();
      await Promise.all(
        Array.from(visualCells).map((h3Index) =>
          persistence.exploredCells.upsertSeen({
            h3Index,
            seenAt,
            modeBit,
            sourceSessionId: LOCAL_SESSION_ID,
            normalizedForXp: normalizedCells.has(h3Index),
          }),
        ),
      );
      if (cancelled) return;
      setRevealedCells(await persistence.exploredCells.listAllCellIds());
    };
    const interval = setInterval(() => void refresh(), ROUTE_REFRESH_INTERVAL_MS);
    void refresh();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session.active]);

  // Ambient tracking's periodic XP checkpoint — replaces the old
  // "submit once at Finish" model. Every CHECKPOINT_INTERVAL_MS, package up
  // whatever changed since the last checkpoint and submit it through the
  // exact same anti-cheat mutation finishSession used to call once, just on
  // a timer instead of a tap. Reads the session row fresh from the DB each
  // tick (not React state) so it always operates on the latest persisted
  // cursor, including across app restarts.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const runCheckpoint = async () => {
      const persistence = persistenceRef.current;
      if (!persistence || cancelled) return;

      const sessionRow = await persistence.session.getById(LOCAL_SESSION_ID);
      if (!sessionRow || sessionRow.status !== 'active' || sessionRow.started_at === null) return;

      const now = Date.now();
      const rawPoints = await persistence.trackPoints.listBySession(LOCAL_SESSION_ID);
      // Raw points are pruned up to the last CONFIRMED checkpoint's endedAt
      // (session-sync.ts's deleteCapturedUpTo runs only once the server
      // actually confirms) — so whatever remains in the DB right now already
      // IS the not-yet-submitted delta, with no separate distance cursor
      // needed the way normalized-cell counts below require one.
      const filtered = filterRoute(
        rawPoints.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy ?? null,
          timestamp: point.capturedAt,
        })),
      );
      const distanceMeters = routeDistanceMeters(filtered);

      const normalizedCountNow = await persistence.exploredCells.countNormalizedForXp();
      const newExplorationUnitsCount = Math.max(0, normalizedCountNow - sessionRow.normalized_count_at_checkpoint);
      const elapsedSeconds = Math.max(0, Math.round((now - sessionRow.updated_at) / 1000));
      const stepsCount = await getStepsBetween(new Date(sessionRow.updated_at), new Date(now)).catch(() => 0);

      if (distanceMeters <= 0 && newExplorationUnitsCount <= 0 && stepsCount <= 0) return;

      // Day-scoped cumulative totals for the streak-qualification check
      // only (see convex/sessions.ts's comment) — reset whenever the
      // checkpoint crosses into a new local calendar day, so a new day
      // genuinely starts at zero instead of trivially "qualifying"
      // forever off yesterday's total.
      const sameDay = isSameLocalDay(sessionRow.updated_at, now);
      const cumulativeDistanceMetersToday = (sameDay ? sessionRow.distance_m : 0) + distanceMeters;
      const cumulativeElapsedSecondsToday = (sameDay ? sessionRow.elapsed_seconds : 0) + elapsedSeconds;

      const estimatedXp = distanceXp(distanceMeters, modeRef.current) + explorationXp(newExplorationUnitsCount, modeRef.current);
      await persistence.xpProjection.addPending(estimatedXp, now);

      await persistence.session.upsert({
        ...sessionRow,
        distance_m: cumulativeDistanceMetersToday,
        elapsed_seconds: cumulativeElapsedSecondsToday,
        new_cells: sameDay ? sessionRow.new_cells + newExplorationUnitsCount : newExplorationUnitsCount,
        xp_pending: sessionRow.xp_pending + estimatedXp,
        normalized_count_at_checkpoint: normalizedCountNow,
        updated_at: now,
      });

      const payload: SessionSyncPayload = {
        sessionId: LOCAL_SESSION_ID,
        startedAt: sessionRow.started_at,
        endedAt: now,
        mode: modeRef.current,
        elapsedSeconds,
        pointCount: filtered.length,
        distanceMeters,
        newExplorationUnitsCount,
        stepsCount,
        cumulativeElapsedSecondsToday,
        cumulativeDistanceMetersToday,
      };
      await persistence.outbox.enqueue({
        eventId: sessionSyncEventId(LOCAL_SESSION_ID, sessionRow.started_at, now),
        type: SESSION_SYNC_EVENT_TYPE,
        payload,
        createdAt: now,
      });
    };

    const interval = setInterval(() => void runCheckpoint(), CHECKPOINT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hydrated]);

  // TQ-35 (scoped MVP): "Smazat historii" in settings.tsx — wipes the
  // local route/fog/session data this device has recorded. Deliberately
  // local-only: the server-confirmed XP ledger (the source of truth for
  // leaderboards/levels) is never touched here, since deleting THAT is a
  // much bigger, irreversible "delete my account" operation out of scope
  // for this task. Safe to run at any time now that tracking is ambient
  // (there's no "mid-expedition" moment to protect against overwriting —
  // ambient tracking simply keeps going against a freshly-empty local DB).
  const resetLocalHistory = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    const persistence = persistenceRef.current;
    if (!persistence) return { ok: false, reason: 'not_ready' };

    await persistence.trackPoints.deleteBySession(LOCAL_SESSION_ID);
    await persistence.exploredCells.deleteAll();
    await persistence.session.delete(LOCAL_SESSION_ID);
    nextSequenceRef.current = 0;
    setSession(initialSession);
    setRevealedCells([]);
    return { ok: true };
  }, []);

  // Satellite Scan (convex/items.ts's SATELLITE_SCAN_ITEM_ID): a one-shot
  // fog reveal at a player-chosen point. Callers (map.tsx) are expected to
  // have already confirmed the server-side useItem consumption succeeded
  // before calling this — this function itself only touches the local fog
  // store, same as the ambient reveal poll above, just with a fixed larger
  // ring and normalizedForXp always false so it can never be mistaken for
  // ground the player actually walked (see MANUAL_REVEAL_MODE_BIT's doc).
  const revealAreaAt = useCallback(async (point: LatLng) => {
    const persistence = persistenceRef.current;
    if (!persistence) return;
    const seenAt = Date.now();
    const cells = cellsRevealedByPoint({ ...point, timestamp: seenAt }, undefined, SATELLITE_SCAN_RING_RADIUS);
    await Promise.all(
      cells.map((h3Index) =>
        persistence.exploredCells.upsertSeen({
          h3Index,
          seenAt,
          modeBit: MANUAL_REVEAL_MODE_BIT,
          sourceSessionId: null,
          normalizedForXp: false,
        }),
      ),
    );
    setRevealedCells(await persistence.exploredCells.listAllCellIds());
  }, []);

  const value = useMemo(
    () => ({ snapshot, session, hasCompletedSession, revealedCells, resetLocalHistory, revealAreaAt }),
    [hasCompletedSession, resetLocalHistory, revealAreaAt, revealedCells, session, snapshot],
  );

  return (
    <ExplorerContext.Provider value={value}>
      {convex ? <RingRadiusWatcher onChange={handleRingRadiusChange} /> : null}
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error('useExplorer must be used inside ExplorerProvider');
  return value;
}
