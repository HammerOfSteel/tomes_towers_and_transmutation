import { describe, it, expect } from 'vitest'
import { DEPTH_LADDER, DepthRole, depthFor, assertDepthSeparated } from '../../../../src/world/buildings/kit/DepthLadder'

describe('DepthLadder constants and assertion', () => {
  it('exports the expected numeric constants', () => {
    expect(DEPTH_LADDER.BUTTRESS).toBe(0.30)
    expect(DEPTH_LADDER.PILASTER).toBe(0.12)
    expect(DEPTH_LADDER.TRIM).toBe(0.08)
    expect(DEPTH_LADDER.FRAME).toBe(0.04)
    expect(DEPTH_LADDER.WALL).toBe(0)
    expect(DEPTH_LADDER.RECESS).toBe(-0.06)
    expect(DEPTH_LADDER.REVEAL).toBe(-0.12)
    expect(DEPTH_LADDER.GLAZING).toBe(-0.20)
  })

  it('depthFor returns the matching value for a role', () => {
    const r: DepthRole = 'TRIM'
    expect(depthFor(r)).toBe(DEPTH_LADDER.TRIM)
  })

  it('assertDepthSeparated throws when two depths are within 0.005', () => {
    const close = [0.1, 0.1039] // difference 0.0039 < 0.005
    expect(() => assertDepthSeparated(close)).toThrow()
  })

  it('assertDepthSeparated does not throw for separated depths', () => {
    const good = [0.1, 0.106] // difference 0.006 >= 0.005
    expect(() => assertDepthSeparated(good)).not.toThrow()
  })
})
