// ── Gallery: localStorage save slots with thumbnails ─────────────────────────

export interface GalleryEntry {
  id: string;
  name: string;
  code: string;      // share code
  thumb: string;     // small PNG data URL
  ts: number;
}

const KEY = 'ttt.princessCreator.gallery.v1';
const CAP = 24;

export function loadGallery(): GalleryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as GalleryEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.id && e.code) : [];
  } catch {
    return [];
  }
}

function persist(list: GalleryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full — drop oldest and retry once.
    if (list.length > 1) persist(list.slice(0, -1));
  }
}

export function addToGallery(entry: Omit<GalleryEntry, 'id' | 'ts'>): GalleryEntry[] {
  const list = loadGallery();
  const full: GalleryEntry = {
    ...entry,
    id: `pg_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    ts: Date.now(),
  };
  list.unshift(full);
  const capped = list.slice(0, CAP);
  persist(capped);
  return capped;
}

export function removeFromGallery(id: string): GalleryEntry[] {
  const list = loadGallery().filter((e) => e.id !== id);
  persist(list);
  return list;
}
