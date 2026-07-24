import { useEffect, useState } from 'react';

import { getLocalPersistence } from '@/data/local';
import { LOCAL_SESSION_ID } from '@/domain/tracking-task';

export type TodayStats = {
  distanceMeters: number;
  newExplorationUnits: number;
  elapsedSeconds: number;
  confirmedXp: number;
  pendingXp: number;
};

// finishSession used to write these numbers once, right before navigating
// to a summary screen; ambient tracking's periodic checkpoint (see
// explorer-context.tsx) now updates the same local_session/xp_projection
// rows continuously instead, so polling here just reflects whatever's
// currently accumulated rather than a one-time final snapshot.
const REFRESH_INTERVAL_MS = 2000;

export function useTodayStats(): TodayStats | null {
  const [data, setData] = useState<TodayStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let persistence: Awaited<ReturnType<typeof getLocalPersistence>> | null = null;

    const refresh = async () => {
      if (!persistence) return;
      const [sessionRow, projection] = await Promise.all([
        persistence.session.getById(LOCAL_SESSION_ID),
        persistence.xpProjection.get(),
      ]);
      if (cancelled) return;
      setData({
        distanceMeters: sessionRow?.distance_m ?? 0,
        newExplorationUnits: sessionRow?.new_cells ?? 0,
        elapsedSeconds: sessionRow?.elapsed_seconds ?? 0,
        confirmedXp: projection.confirmed_xp,
        pendingXp: projection.pending_xp,
      });
    };

    getLocalPersistence()
      .then((loaded) => {
        if (cancelled) return;
        persistence = loaded;
        void refresh();
      })
      .catch(() => undefined);

    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return data;
}
