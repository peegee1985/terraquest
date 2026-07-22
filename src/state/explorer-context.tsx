import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { demoQuests, demoRoute, demoSnapshot } from '@/data/demo';
import { getLocalPersistence, type LocalPersistence } from '@/data/local';
import { filterRoute } from '@/domain/gps-filter';
import { classifyMovement, computeRollingSpeedMps } from '@/domain/movement';
import { MovementMode, Quest, TrackPoint } from '@/domain/types';
import { LOCAL_SESSION_ID, startLocationTracking, stopLocationTracking } from '@/domain/tracking-task';

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
  startSession: (mode?: MovementMode) => void;
  togglePause: () => void;
  finishSession: () => void;
};

const MAX_ROUTE_POINTS = 500;
// TQ-21: while a session is active, re-read the route from the DB at the
// same cadence the background task writes to it — this is what makes the
// map reflect points regardless of whether they came from the foreground or
// while the app was backgrounded.
const ROUTE_REFRESH_INTERVAL_MS = 5000;
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
  const [hydrated, setHydrated] = useState(false);
  const persistenceRef = useRef<LocalPersistence | null>(null);
  const nextSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    getLocalPersistence()
      .then(async (persistence) => {
        if (cancelled) return;
        persistenceRef.current = persistence;

        const [xpProjection, activeSession, storedRoute, extraSnapshotJson, hasCompletedSessionValue] = await Promise.all([
          persistence.xpProjection.get(),
          persistence.session.getActive(),
          persistence.trackPoints.listBySession(LOCAL_SESSION_ID),
          persistence.preferences.get(EXTRA_SNAPSHOT_PREFERENCE_KEY),
          persistence.preferences.get(HAS_COMPLETED_SESSION_PREFERENCE_KEY),
        ]);
        if (cancelled) return;
        setHasCompletedSession(hasCompletedSessionValue === 'true');

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
            startLocationTracking().catch(() => undefined);
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
      const rows = await persistenceRef.current?.trackPoints.listBySession(LOCAL_SESSION_ID);
      if (cancelled || !rows || rows.length === 0) return;
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
      setSession((current) => ({ ...current, route, mode: classifyMovement(speedMps, current.mode) }));
    };
    const interval = setInterval(() => void refresh(), ROUTE_REFRESH_INTERVAL_MS);
    void refresh();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session.active, session.paused]);

  const persistSession = useCallback((next: SessionState, status: 'active' | 'paused' | 'completed') => {
    persistenceRef.current?.session
      .upsert({
        id: LOCAL_SESSION_ID,
        status,
        mode: next.mode,
        started_at: next.startedAt,
        ended_at: status === 'completed' ? Date.now() : null,
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
      setSession((current) => {
        const next: SessionState = { ...current, active: true, paused: false, mode, startedAt: Date.now(), elapsedSeconds: 0 };
        persistSession(next, 'active');
        return next;
      });
      startLocationTracking().catch(() => undefined);
    },
    [persistSession],
  );

  const togglePause = useCallback(() => {
    setSession((current) => {
      const next = { ...current, paused: !current.paused };
      persistSession(next, next.paused ? 'paused' : 'active');
      if (next.paused) stopLocationTracking().catch(() => undefined);
      else startLocationTracking().catch(() => undefined);
      return next;
    });
  }, [persistSession]);

  const finishSession = useCallback(() => {
    setSession((current) => {
      const next = { ...current, active: false, paused: false, startedAt: null };
      persistSession(next, 'completed');
      return next;
    });
    stopLocationTracking().catch(() => undefined);
    setHasCompletedSession(true);
    persistenceRef.current?.preferences
      .set(HAS_COMPLETED_SESSION_PREFERENCE_KEY, 'true', Date.now())
      .catch(() => undefined);
  }, [persistSession]);

  const value = useMemo(
    () => ({ snapshot, quests, session, hasCompletedSession, startSession, togglePause, finishSession }),
    [finishSession, hasCompletedSession, quests, session, snapshot, startSession, togglePause],
  );

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error('useExplorer must be used inside ExplorerProvider');
  return value;
}
