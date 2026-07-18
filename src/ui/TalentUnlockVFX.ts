/**
 * TalentUnlockVFX — DOM particle burst + short chime when a talent node unlocks.
 *
 * Usage:
 *   import { spawnTalentUnlockVFX } from '@/ui/TalentUnlockVFX';
 *   spawnTalentUnlockVFX(nodeScreenX, nodeScreenY);   // pass screen coords of the node button
 */

export function spawnTalentUnlockVFX(cx: number, cy: number, color = '#cc88ff'): void {
  const NUM     = 18;
  const GRAVITY = 0.04;   // px/frame² downward pull
  const FPS     = 60;
  const FRAMES  = 40;

  interface Particle {
    el:  HTMLElement;
    x:   number;
    y:   number;
    vx:  number;
    vy:  number;
    age: number;
  }

  const particles: Particle[] = [];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9500;overflow:hidden;';
  document.body.appendChild(container);

  for (let i = 0; i < NUM; i++) {
    const angle  = (Math.PI * 2 * i) / NUM + (Math.random() - 0.5) * 0.4;
    const speed  = 3 + Math.random() * 4;
    const size   = 4 + Math.random() * 5;
    const el     = document.createElement('div');
    el.style.cssText = [
      `position:absolute;`,
      `width:${size}px;height:${size}px;border-radius:50%;`,
      `background:${i % 3 === 0 ? '#ffffff' : color};`,
      `pointer-events:none;`,
    ].join('');
    container.appendChild(el);
    particles.push({
      el, x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,   // slight upward bias
      age: 0,
    });
  }

  // Star text pop
  const star = document.createElement('div');
  star.style.cssText = [
    'position:absolute;font-size:22px;pointer-events:none;',
    `left:${cx - 11}px;top:${cy - 24}px;`,
    'transform:scale(0);transition:transform 0.12s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s;',
    'z-index:1;',
  ].join('');
  star.textContent = '✦';
  star.style.color = color;
  container.appendChild(star);
  requestAnimationFrame(() => { star.style.transform = 'scale(1.4)'; });
  setTimeout(() => { star.style.opacity = '0'; }, 320);

  let frame = 0;
  const interval = setInterval(() => {
    frame++;
    const progress = frame / FRAMES;
    for (const p of particles) {
      p.age++;
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += GRAVITY;
      const alpha = Math.max(0, 1 - progress);
      p.el.style.left    = `${p.x}px`;
      p.el.style.top     = `${p.y}px`;
      p.el.style.opacity = String(alpha);
    }
    if (frame >= FRAMES) {
      clearInterval(interval);
      document.body.removeChild(container);
    }
  }, 1000 / FPS);

  // Chime SFX via Web Audio API (no asset required)
  _playChime();
}

function _playChime(): void {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Two-note ascending chime
    osc.type     = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.start(now);
    osc.stop(now + 0.45);
    osc.addEventListener('ended', () => ctx.close());
  } catch {
    // Web Audio not available — silently skip
  }
}
