// ── LevelUpBanner ─────────────────────────────────────────────────────────────
//
//  Transient full-screen golden glow + rising text when the player levels up.
//  Call show(level) once per level-up event.
export class LevelUpBanner {
    _active = false;
    show(level) {
        if (this._active)
            return;
        this._active = true;
        // Outer glow overlay
        const glow = document.createElement('div');
        Object.assign(glow.style, {
            position: 'fixed', inset: '0',
            background: 'radial-gradient(ellipse at center, rgba(255,210,60,0.18) 0%, transparent 70%)',
            pointerEvents: 'none', zIndex: '950',
            opacity: '1', transition: 'opacity 0.9s ease',
        });
        // Text block
        const text = document.createElement('div');
        Object.assign(text.style, {
            position: 'fixed', left: '50%', top: '40%',
            transform: 'translateX(-50%) translateY(0)',
            textAlign: 'center', pointerEvents: 'none', zIndex: '951',
            opacity: '1', transition: 'opacity 1.1s ease, transform 1.4s ease',
        });
        const levelLine = document.createElement('div');
        levelLine.textContent = `LEVEL  ${level}`;
        Object.assign(levelLine.style, {
            fontFamily: '"Cinzel", serif',
            fontSize: '42px', letterSpacing: '10px',
            color: '#ffd43c',
            textShadow: '0 0 30px rgba(255,210,60,0.8), 0 0 60px rgba(255,180,0,0.4)',
        });
        const subLine = document.createElement('div');
        subLine.textContent = '— Stat point granted —';
        Object.assign(subLine.style, {
            fontFamily: '"IM Fell English", Georgia, serif',
            fontSize: '14px', letterSpacing: '3px',
            color: 'rgba(255,210,60,0.6)',
            marginTop: '10px',
        });
        text.append(levelLine, subLine);
        document.body.append(glow, text);
        // Animate out after 2.2s
        setTimeout(() => {
            glow.style.opacity = '0';
            text.style.opacity = '0';
            text.style.transform = 'translateX(-50%) translateY(-30px)';
        }, 1800);
        setTimeout(() => {
            glow.remove();
            text.remove();
            this._active = false;
        }, 3200);
    }
}
