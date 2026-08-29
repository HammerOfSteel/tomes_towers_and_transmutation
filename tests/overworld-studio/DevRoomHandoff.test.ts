import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDevRoomLaunchUrl,
  buildSettlementLabLaunchUrl,
  readPendingDevRoom,
  readPendingSettlementLabParams,
  clearPendingDevRoom,
  DEV_ROOM_LAUNCH_PARAM,
} from '@/overworld-studio/DevRoomHandoff';

function setLocation(pathAndSearch: string): void {
  const url = new URL(pathAndSearch, 'http://localhost/');
  window.history.replaceState(null, '', url.pathname + url.search);
}

afterEach(() => {
  localStorage.clear();
  setLocation('/index.html');
});

describe('DevRoomHandoff — plain water-lab/settlement-lab launch (existing behaviour)', () => {
  it('buildDevRoomLaunchUrl sets the devroom query param', () => {
    const url = buildDevRoomLaunchUrl('/index.html', 'water-lab');
    expect(url).toContain(`${DEV_ROOM_LAUNCH_PARAM}=water-lab`);
  });

  it('readPendingDevRoom reads back the query param', () => {
    setLocation(buildDevRoomLaunchUrl('/index.html', 'settlement-lab'));
    expect(readPendingDevRoom()).toBe('settlement-lab');
  });

  it('readPendingSettlementLabParams returns null when no sl_* params are present', () => {
    setLocation(buildDevRoomLaunchUrl('/index.html', 'settlement-lab'));
    expect(readPendingSettlementLabParams()).toBeNull();
  });
});

describe('DevRoomHandoff — "Play in 3D" settlement-lab launch with carried-over params', () => {
  it('buildSettlementLabLaunchUrl encodes devroom=settlement-lab plus seed/type/faction/layout', () => {
    const url = buildSettlementLabLaunchUrl('/index.html', {
      seed: 12345, type: 'city', faction: 'dwarven', layout: 'terraced',
    });
    expect(url).toContain(`${DEV_ROOM_LAUNCH_PARAM}=settlement-lab`);
    expect(url).toContain('sl_seed=12345');
    expect(url).toContain('sl_type=city');
    expect(url).toContain('sl_faction=dwarven');
    expect(url).toContain('sl_layout=terraced');
  });

  it('readPendingSettlementLabParams round-trips the exact params through the URL', () => {
    const url = buildSettlementLabLaunchUrl('/index.html', {
      seed: 999, type: 'town', faction: 'orcish', layout: 'organic',
    });
    setLocation(url);

    expect(readPendingDevRoom()).toBe('settlement-lab');
    expect(readPendingSettlementLabParams()).toEqual({
      seed: 999, type: 'town', faction: 'orcish', layout: 'organic',
    });
  });

  it('clearPendingDevRoom removes the sl_* params along with devroom', () => {
    const url = buildSettlementLabLaunchUrl('/index.html', {
      seed: 1, type: 'village', faction: 'human', layout: 'auto',
    });
    setLocation(url);

    clearPendingDevRoom();

    expect(readPendingDevRoom()).toBeNull();
    expect(readPendingSettlementLabParams()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('readPendingSettlementLabParams returns null if seed is missing/non-numeric', () => {
    setLocation('/index.html?devroom=settlement-lab&sl_type=city&sl_faction=human&sl_layout=auto');
    expect(readPendingSettlementLabParams()).toBeNull();
  });
});
