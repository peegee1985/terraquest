import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { demoQuests, demoRoute, demoSnapshot } from '@/data/demo';
import { getLocalPersistence, type LocalPersistence } from '@/data/local';
import { MovementMode, Quest, TrackPoint } from '@/domain/types';

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
  startSession: (mode?: MovementMode) => void;
  togglePause: () => void;
  finishSession: () => void;
  addTrackPoint: (point: TrackPoint) => void;
};

// Single reusable session id for this prototype phase; multi-session history
// arrives with real background tracking (Fáze 3, TQ-21).
const LOCAL_SESSION_ID = 'primary';
const MAX_ROUTE_POINTS = 500;
const EXTRA_SNAPSHOT_PREFERENCE_KEY = 'explorer.snapshot.extra.v1';

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
  const [hydrated, setHydrated] = useState(false);
  const persistenceRef = useRef<LocalPersistence | null>(null);
  const nextSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    getLocalPersistence()
      .then(async (persistence) => {
        if (cancelled) return;
        persistenceRef.current = persistence;

        const [xpProjection, activeSession, storedRoute, extraSnapshotJson] = await Promise.all([
          persistence.xpProjection.get(),
          persistence.session.getActive(),
          persistence.trackPoints.listBySession(LOCAL_SESSION_ID),
          persistence.preferences.get(EXTRA_SNAPSHOT_PREFERENCE_KEY),
        ]);
        if (cancelled) return;

        const route: TrackPoint[] = storedRoute.length
          ? storedRoute.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
              accuracy: point.accuracy ?? null,
              timestamp: point.capturedAt,
            }))
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
    },
    [persistSession],
  );

  const togglePause = useCallback(() => {
    setSession((current) => {
      const next = { ...current, paused: !current.paused };
      persistSession(next, next.paused ? 'paused' : 'active');
      return next;
    });
  }, [persistSession]);

  const finishSession = useCallback(() => {
    setSession((current) => {
      const next = { ...current, active: false, paused: false, startedAt: null };
      persistSession(next, 'completed');
      return next;
    });
  }, [persistSession]);

  const addTrackPoint = useCallback((point: TrackPoint) => {
    setSession((current) => {
      const previous = current.route.at(-1);
      if (previous && Math.abs(previous.latitude - point.latitude) < 0.00001 && Math.abs(previous.longitude - point.longitude) < 0.00001) {
        return current;
      }

      const sequence = nextSequenceRef.current;
      nextSequenceRef.current += 1;
      persistenceRef.current?.trackPoints
        .insert({
          sessionId: LOCAL_SESSION_ID,
          sequence,
          latitude: point.latitude,
          longitude: point.longitude,
          capturedAt: point.timestamp,
          accuracy: point.accuracy ?? null,
        })
        .then(() => persistenceRef.current?.trackPoints.pruneToLast(LOCAL_SESSION_ID, MAX_ROUTE_POINTS))
        .catch(() => undefined);

      return { ...current, route: [...current.route.slice(-(MAX_ROUTE_POINTS - 1)), point] };
    });
  }, []);

  const value = useMemo(
    () => ({ snapshot, quests, session, startSession, togglePause, finishSession, addTrackPoint }),
    [addTrackPoint, finishSession, quests, session, snapshot, startSession, togglePause],
  );

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error('useExplorer must be used inside ExplorerProvider');
  return value;
}
