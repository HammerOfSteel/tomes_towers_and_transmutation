import { describe, it, expect } from 'vitest';
describe('canvas sanity', () => {
    it('getContext returns our mock', () => {
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        console.log('ctx is:', ctx);
        console.log('ctx.fillStyle:', ctx?.fillStyle);
        expect(ctx).not.toBeNull();
        expect(typeof ctx?.fillRect).toBe('function');
    });
});
