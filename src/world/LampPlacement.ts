/**
 * LampPlacement.ts — pure helper selecting which settlement road tiles get a
 * lamp post prop, given the full rasterized road-tile list for a settlement.
 *
 * Road tiles are already a curated, connected path graph (not random terrain
 * scatter), so a simple positional stride is sufficient and gives a natural
 * "lamp-post interval" look without needing Poisson-disk sampling.
 */
import type { RoadSegment } from './SettlementGenerator';

export function selectLampRoadTiles(roads: RoadSegment[], stride: number): RoadSegment[] {
  if (stride <= 0) throw new Error('selectLampRoadTiles: stride must be a positive integer');
  const out: RoadSegment[] = [];
  for (let i = 0; i < roads.length; i += stride) {
    out.push(roads[i]!);
  }
  return out;
}
