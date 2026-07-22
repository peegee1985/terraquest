import * as Crypto from 'expo-crypto';

import { openExpoLocalDb } from './db';
import { runMigrations } from './migrations';
import { createExploredCellRepository } from './repositories/explored-cells';
import { createMapRegionRepository } from './repositories/map-regions';
import { createOutboxRepository } from './repositories/outbox';
import { createPreferencesRepository } from './repositories/preferences';
import { createSessionRepository } from './repositories/session';
import { createTrackPointRepository } from './repositories/track-points';
import { createXpProjectionRepository } from './repositories/xp-projection';
import { createExpoSecureKeyStore } from './secure-key.expo';

const DATABASE_NAME = 'terraquest.local.db';

export type LocalPersistence = {
  session: ReturnType<typeof createSessionRepository>;
  trackPoints: ReturnType<typeof createTrackPointRepository>;
  exploredCells: ReturnType<typeof createExploredCellRepository>;
  outbox: ReturnType<typeof createOutboxRepository>;
  xpProjection: ReturnType<typeof createXpProjectionRepository>;
  mapRegions: ReturnType<typeof createMapRegionRepository>;
  preferences: ReturnType<typeof createPreferencesRepository>;
};

let persistencePromise: Promise<LocalPersistence> | null = null;

async function initLocalPersistence(): Promise<LocalPersistence> {
  const db = await openExpoLocalDb(DATABASE_NAME);
  await runMigrations(db);

  const secureKeyStore = createExpoSecureKeyStore();
  const masterKeyBase64 = await secureKeyStore.getOrCreateMasterKey();
  const randomBytes = (length: number) => Crypto.getRandomBytes(length);

  return {
    session: createSessionRepository(db),
    trackPoints: createTrackPointRepository(db, masterKeyBase64, randomBytes),
    exploredCells: createExploredCellRepository(db),
    outbox: createOutboxRepository(db),
    xpProjection: createXpProjectionRepository(db),
    mapRegions: createMapRegionRepository(db),
    preferences: createPreferencesRepository(db),
  };
}

/** Lazily opens the DB, runs migrations, and derives the master key exactly once per process. */
export function getLocalPersistence(): Promise<LocalPersistence> {
  if (!persistencePromise) {
    persistencePromise = initLocalPersistence();
  }
  return persistencePromise;
}
