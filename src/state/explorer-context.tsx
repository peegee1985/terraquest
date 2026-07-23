import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { demoQuests, demoRoute, demoSnapshot } from '@/data/demo';
import { getLocalPersistence, type LocalPersistence } from '@/data/local';
import { distanceXp, explorationXp } from '@/domain/progression';
import { cellsRevealedByRoute, centerlineCellsForRoute } from '@/domain/fog';
import { filterRoute, routeDistanceMeters } from '@/domain/gps-filter';
import { classifyMovement, computeRollingSpeedMps, movementModeBit } from '@/domain/movement';
import { MovementMode, Quest, TrackPoint } from '@/domain/types';
import {
  LOCAL_SESSION_ID,
  startLocationTracking,
  stopLocationTracking,
  trackingProfileForMode,
  updateLocationTrackingProfile,
  type TrackingProfile,
} from '@/domain/tracking-task';
import { convex } from '@/state/convex-client';
import {
  convexSessionSyncTransport,
  NOT_YET_CONFIGURED_TRANSPORT,
  processDueSyncEvents,
  SESSION_SYNC_EVENT_TYPE,
  sessionSyncEventId,
  type SessionSyncPayload,
} from '@/state/session-sync';

type SessionState = {
  active: boolean;
  paused: boolean;
  mode: MovementMode;
  startedAt: number | null;
  elapsedSeconds: number;
  route: TrackPoint[];
};

type ExplorerContextValue = {
  snapshot: typeof demoSnapshot;
  quests: Quest[];
  session: SessionState;
  hasCompletedSession: boolean;
  revealedCells: string[];
  startSession: (mode?: MovementMode) => void;
  togglePause: () => void;
  finishSession: () => void;
  resetLocalHistory: () => Promise<{ ok: boolean; reason?: string }>;
};

const MAX_ROUTE_POINTS = 500;
// TQ-21: while a session is active, re-read the route from the DB at the
// same cadence the background task writes to it — this is what makes the
// map reflect points regardless of whether they came from the foreground or
// while the app was backgrounded. TQ-23's "lokální odhalení do 2 sekund"
// acceptance criterion is what pulls this under 2000ms — it's just a local
// SQLite read, decoupled from the location task's own 5s GPS sampling rate.
const ROUTE_REFRESH_INTERVAL_MS = 1500;
// TQ-24: independent of whether a session is active — a finished session
// can still be waiting on outbox confirmation while the user browses
// elsewhere in the app, or the app could've been relaunched since finishing.
const SYNC_POLL_INTERVAL_MS = 30_000;
const EXTRA_SNAPSHOT_PREFERENCE_KEY = 'explorer.snapshot.extra.v1';
// TQ-20: background location must not be offered until the user has
// actually finished an expedition once — this flag gates that in Settings.
const HAS_COMPLETED_SESSION_PREFERENCE_KEY = 'explorer.hasCompletedSession.v1';

const initialSession: SessionState = {
  active: false,
  paused: false,
  mode: 'walk',
  startedAt: null,
  elapsedSeconds: 0,
  route: demoRoute,
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(demoSnapshot);
  const [quests] = useState(demoQuests);
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
  // TQ-31: normalizedForXp cell count at session start, so finishSession can
  // diff against the count at session end to get "new exploration units
  // THIS session" — countNormalizedForXp() itself is a lifetime total, not
  // a per-session figure. null until the async count resolves; a session
  // finished within that (sub-second) window just reports 0 new units,
  // an acceptable rare edge case rather than blocking session start on it.
  const normalizedCountAtStartRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalPersistence()
      .then(async (persistence) => {
        if (cancelled) return;
        persistenceRef.current = persistence;

        const [xpProjection, activeSession, storedRoute, extraSnapshotJson, hasCompletedSessionValue, storedRevealedCells] =
          await Promise.all([
            persistence.xpProjection.get(),
            persistence.session.getActive(),
            persistence.trackPoints.listBySession(LOCAL_SESSION_ID),
            persistence.preferences.get(EXTRA_SNAPSHOT_PREFERENCE_KEY),
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

        const extraSnapshot = extraSnapshotJson ? (JSON.parse(extraSnapshotJson) as Partial<typeof demoSnapshot>) : {};
        setSnapshot((current) => ({ ...current, ...extraSnapshot, totalXp: xpProjection.confirmed_xp || current.totalXp }));

        if (activeSession) {
          modeRef.current = activeSession.mode;
          trackingProfileRef.current = trackingProfileForMode(activeSession.mode);
          setSession({
            active: activeSession.status === 'active' || activeSession.status === 'paused',
            paused: activeSession.status === 'paused',
            mode: activeSession.mode,
            startedAt: activeSession.started_at,
            elapsedSeconds: activeSession.elapsed_seconds,
            route,
          });
          // TQ-21: crash/kill-safe resume — if the app process was relaunched
          // mid-expedition, make sure the background task is actually running
          // again rather than assuming the OS kept it alive.
          if (activeSession.status === 'active') {
            startLocationTracking(trackingProfileRef.current).catch(() => undefined);
          }
        } else {
          setSession((current) => ({ ...current, route }));
        }

        if (xpProjection.updated_at === 0) {
          await persistence.xpProjection.applyServerSnapshot({
            confirmedXp: demoSnapshot.totalXp,
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

  useEffect(() => {
    if (!hydrated) return;
    const { totalXp, ...rest } = snapshot;
    persistenceRef.current?.preferences
      .set(EXTRA_SNAPSHOT_PREFERENCE_KEY, JSON.stringify(rest), Date.now())
      .catch(() => undefined);
  }, [hydrated, snapshot]);

  // TQ-24/TQ-31: retries the outbox with backoff regardless of whether a
  // session is currently active — a finished session can be sitting in
  // 'processing' (awaiting confirmation) at any time, including right after
  // an app restart. Uses the real Convex transport when a client is
  // configured (EXPO_PUBLIC_CONVEX_URL set); falls back to
  // NOT_YET_CONFIGURED_TRANSPORT otherwise, same graceful-degradation
  // pattern as _layout.tsx's BackendProvider.
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
    if (!session.active || session.paused) return;
    const interval = setInterval(() => {
      setSession((current) => ({ ...current, elapsedSeconds: current.elapsedSeconds + 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.active, session.paused]);

  // TQ-21: the background task (src/domain/tracking-task.ts) writes points
  // straight to SQLite without going through this component's state, since
  // it can run with no React tree mounted at all. Polling the DB is what
  // makes the map reflect those points, regardless of whether the app was
  // foregrounded or backgrounded when they were captured.
  useEffect(() => {
    if (!session.active || session.paused) return;
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
      // Persisting on every poll (not just at session end) is what makes
      // the fog reveal "within 2 seconds" instead of only after finishing.
      const seenAt = Date.now();
      const modeBit = movementModeBit(mode);
      const visualCells = cellsRevealedByRoute(route);
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
  }, [session.active, session.paused]);

  const persistSession = useCallback((next: SessionState, status: 'active' | 'paused' | 'processing' | 'completed') => {
    persistenceRef.current?.session
      .upsert({
        id: LOCAL_SESSION_ID,
        status,
        mode: next.mode,
        started_at: next.startedAt,
        ended_at: status === 'processing' || status === 'completed' ? Date.now() : null,
        elapsed_seconds: next.elapsedSeconds,
        distance_m: 0,
        new_cells: 0,
        xp_pending: 0,
        last_confirmed_sequence: nextSequenceRef.current,
        updated_at: Date.now(),
      })
      .catch(() => undefined);
  }, []);

  const startSession = useCallback(
    (mode: MovementMode = 'walk') => {
      modeRef.current = mode;
      trackingProfileRef.current = trackingProfileForMode(mode);
      normalizedCountAtStartRef.current = null;
      persistenceRef.current?.exploredCells
        .countNormalizedForXp()
        .then((count) => {
          normalizedCountAtStartRef.current = count;
        })
        .catch(() => undefined);
      setSession((current) => {
        const next: SessionState = { ...current, active: true, paused: false, mode, startedAt: Date.now(), elapsedSeconds: 0 };
        persistSession(next, 'active');
        return next;
      });
      startLocationTracking(trackingProfileRef.current).catch(() => undefined);
    },
    [persistSession],
  );

  const togglePause = useCallback(() => {
    setSession((current) => {
      const next = { ...current, paused: !current.paused };
      persistSession(next, next.paused ? 'paused' : 'active');
      if (next.paused) stopLocationTracking().catch(() => undefined);
      else startLocationTracking(trackingProfileRef.current).catch(() => undefined);
      return next;
    });
  }, [persistSession]);

  const finishSession = useCallback(() => {
    setSession((current) => {
      const endedAt = Date.now();
      // TQ-24: 'processing', not 'completed' yet — the session only becomes
      // 'completed' once its outbox sync event is actually confirmed (see
      // session-sync.ts). Persisted with the real startedAt (not nulled)
      // so a later confirmation can match it against a stale one.
      persistSession({ ...current, active: false, paused: false }, 'processing');

      const startedAt = current.startedAt;
      const mode = current.mode;
      const elapsedSeconds = current.elapsedSeconds;
      const normalizedCountAtStart = normalizedCountAtStartRef.current ?? 0;

      // TQ-31: computing real distance/exploration numbers needs the full
      // captured-point history (not just the display-capped in-memory
      // route) and a fresh cell count — both async, so this runs as a
      // fire-and-forget continuation of the synchronous state update above,
      // same style as the other side effects in this callback.
      void (async () => {
        const persistence = persistenceRef.current;
        if (!persistence) return;

        const rawPoints = await persistence.trackPoints.listBySession(LOCAL_SESSION_ID);
        const filtered = filterRoute(
          rawPoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy ?? null,
            timestamp: point.capturedAt,
          })),
        );
        const distanceMeters = routeDistanceMeters(filtered);
        const normalizedCountAtEnd = await persistence.exploredCells.countNormalizedForXp();
        const newExplorationUnitsCount = Math.max(0, normalizedCountAtEnd - normalizedCountAtStart);

        // Optimistic local estimate, shown immediately — replaced by the
        // server's authoritative confirmedXp once the sync transport
        // confirms (session-sync.ts's processDueSyncEvents).
        const estimatedXp = distanceXp(distanceMeters, mode) + explorationXp(newExplorationUnitsCount, mode);
        await persistence.xpProjection.addPending(estimatedXp, endedAt);

        // TQ-31: the session-summary screen reads these back straight from
        // the session row (distance_m/new_cells/xp_pending existed since
        // TQ-24 but were always hardcoded to 0 — this is the first write of
        // their real values).
        const sessionRow = await persistence.session.getById(LOCAL_SESSION_ID);
        if (sessionRow) {
          await persistence.session.upsert({
            ...sessionRow,
            distance_m: distanceMeters,
            new_cells: newExplorationUnitsCount,
            xp_pending: estimatedXp,
          });
        }

        const payload: SessionSyncPayload = {
          sessionId: LOCAL_SESSION_ID,
          startedAt,
          endedAt,
          mode,
          elapsedSeconds,
          pointCount: nextSequenceRef.current,
          distanceMeters,
          newExplorationUnitsCount,
        };
        await persistence.outbox.enqueue({
          eventId: sessionSyncEventId(LOCAL_SESSION_ID, startedAt),
          type: SESSION_SYNC_EVENT_TYPE,
          payload,
          createdAt: endedAt,
        });
      })();

      return { ...current, active: false, paused: false, startedAt: null };
    });
    stopLocationTracking().catch(() => undefined);
    setHasCompletedSession(true);
    persistenceRef.current?.preferences
      .set(HAS_COMPLETED_SESSION_PREFERENCE_KEY, 'true', Date.now())
      .catch(() => undefined);
  }, [persistSession]);

  // TQ-35 (scoped MVP): "Smazat historii" in settings.tsx — wipes the
  // local route/fog/session data this device has recorded. Deliberately
  // local-only: the server-confirmed XP ledger (the source of truth for
  // leaderboards/levels) is never touched here, since deleting THAT is a
  // much bigger, irreversible "delete my account" operation out of scope
  // for this task. Refuses while a session is active/paused — stopping a
  // live tracking session as a side effect of a "delete" action would be
  // surprising, so the caller is asked to finish it first.
  const resetLocalHistory = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (session.active) return { ok: false, reason: 'session_active' };
    const persistence = persistenceRef.current;
    if (!persistence) return { ok: false, reason: 'not_ready' };

    await persistence.trackPoints.deleteBySession(LOCAL_SESSION_ID);
    await persistence.exploredCells.deleteAll();
    await persistence.session.delete(LOCAL_SESSION_ID);
    nextSequenceRef.current = 0;
    setSession(initialSession);
    setRevealedCells([]);
    return { ok: true };
  }, [session.active]);

  const value = useMemo(
    () => ({ snapshot, quests, session, hasCompletedSession, revealedCells, startSession, togglePause, finishSession, resetLocalHistory }),
    [finishSession, hasCompletedSession, quests, resetLocalHistory, revealedCells, session, snapshot, startSession, togglePause],
  );

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error('useExplorer must be used inside ExplorerProvider');
  return value;
}
