import type { LocalMapRegionRow } from '../models';
import type { LocalDb } from '../types';

export function createMapRegionRepository(db: LocalDb) {
  return {
    async upsert(region: LocalMapRegionRow): Promise<void> {
      await db.run(
        `INSERT INTO local_map_region (region_id, version, size_bytes, downloaded_at, last_used_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(region_id) DO UPDATE SET
           version = excluded.version,
           size_bytes = excluded.size_bytes,
           downloaded_at = excluded.downloaded_at,
           last_used_at = excluded.last_used_at;`,
        [region.region_id, region.version, region.size_bytes, region.downloaded_at, region.last_used_at],
      );
    },

    async touchUsage(regionId: string, timestamp: number): Promise<void> {
      await db.run('UPDATE local_map_region SET last_used_at = ? WHERE region_id = ?;', [timestamp, regionId]);
    },

    async list(): Promise<LocalMapRegionRow[]> {
      return db.all<LocalMapRegionRow>('SELECT * FROM local_map_region ORDER BY last_used_at DESC;');
    },

    async delete(regionId: string): Promise<void> {
      await db.run('DELETE FROM local_map_region WHERE region_id = ?;', [regionId]);
    },
  };
}

export type MapRegionRepository = ReturnType<typeof createMapRegionRepository>;
