import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { demoQuests, demoRoute, demoSnapshot } from '@/data/demo';
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

const STORAGE_KEY = 'terraquest.explorer.v1';

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as { snapshot?: typeof demoSnapshot; session?: SessionState };
        if (saved.snapshot) setSnapshot(saved.snapshot);
        if (saved.session?.active) setSession(saved.session);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshot, session })).catch(() => undefined);
  }, [hydrated, session, snapshot]);

  useEffect(() => {
    if (!session.active || session.paused) return;
    const interval = setInterval(() => {
      setSession((current) => ({ ...current, elapsedSeconds: current.elapsedSeconds + 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.active, session.paused]);

  const startSession = useCallback((mode: MovementMode = 'walk') => {
    setSession((current) => ({
      ...current,
      active: true,
      paused: false,
      mode,
      startedAt: Date.now(),
      elapsedSeconds: 0,
    }));
  }, []);

  const togglePause = useCallback(() => {
    setSession((current) => ({ ...current, paused: !current.paused }));
  }, []);

  const finishSession = useCallback(() => {
    setSession((current) => ({ ...current, active: false, paused: false, startedAt: null }));
  }, []);

  const addTrackPoint = useCallback((point: TrackPoint) => {
    setSession((current) => {
      const previous = current.route.at(-1);
      if (previous && Math.abs(previous.latitude - point.latitude) < 0.00001 && Math.abs(previous.longitude - point.longitude) < 0.00001) {
        return current;
      }
      return { ...current, route: [...current.route.slice(-499), point] };
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
