import * as THREE from 'three';

export interface GothicArchOptions {
  /** Full clear span measured across the springing line. */
  width: number;
  /** Height of the straight jambs before the curved head begins. */
  springHeight: number;
  /**
   * Circular-arc radius divided by clear span (R / S).
   * 0.5 = Romanesque semicircle, 1.0 = equilateral Gothic, 1.6+ = tall lancet.
   */
  archRatio: number;
}

export const GOTHIC_ARCH_ROMANESQUE_RATIO = 0.5;
export const GOTHIC_ARCH_EQUILATERAL_RATIO = 1.0;
export const GOTHIC_ARCH_LANCET_RATIO = 1.6;

function getEffectiveArchRatio(archRatio: number): number {
  return Math.max(archRatio, GOTHIC_ARCH_ROMANESQUE_RATIO);
}

function getGothicArchMetrics(width: number, archRatio: number) {
  const span = Math.max(width, 0);
  const radius = span * getEffectiveArchRatio(archRatio);
  const halfSpan = span / 2;
  const centerOffset = radius - halfSpan;
  const rise = Math.sqrt(Math.max(radius * radius - centerOffset * centerOffset, 0));
  const halfSweep = Math.atan2(rise, centerOffset);

  return { span, halfSpan, radius, centerOffset, rise, halfSweep };
}

export function buildGothicArchShape({ width, springHeight, archRatio }: GothicArchOptions): THREE.Shape {
  const { halfSpan, radius, centerOffset, halfSweep } = getGothicArchMetrics(width, archRatio);
  const shape = new THREE.Shape();

  shape.moveTo(-halfSpan, 0);
  shape.lineTo(-halfSpan, springHeight);
  shape.absarc(centerOffset, springHeight, radius, Math.PI, Math.PI - halfSweep, true);
  shape.absarc(-centerOffset, springHeight, radius, halfSweep, 0, true);
  shape.lineTo(halfSpan, 0);
  shape.lineTo(-halfSpan, 0);

  return shape;
}
