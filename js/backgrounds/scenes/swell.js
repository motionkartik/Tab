import { TAU } from "../scene-kit.js";

export default {
    id: "swell",
    make: () => ({
        draw(ctx, w, h, t, dt, p) {
            ctx.fillStyle = p.bg;
            ctx.fillRect(0, 0, w, h);
            const step = Math.max(4, w / 220),
                amp = Math.min(h, w * 0.75);
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, p.swell?.[0] ?? p.ink[0]);
            g.addColorStop(1, p.swell?.[1] ?? p.ink[1]);
            ctx.fillStyle = g;
            const layers = [
                { y: 0.64, a: 0.13, f: 0.62, sp: 0.33, ph: 0.0, al: 0.3 },
                { y: 0.7, a: 0.12, f: 0.85, sp: -0.42, ph: 1.9, al: 0.32 },
                { y: 0.76, a: 0.1, f: 0.7, sp: 0.48, ph: 3.4, al: 0.38 },
                { y: 0.83, a: 0.08, f: 0.95, sp: -0.36, ph: 4.8, al: 0.55 },
            ];
            for (const L of layers) {
                // one long swell per layer: under one full period across the width, with breathing height and a slow bob
                const A = amp * L.a * (1 + 0.4 * Math.sin(t * 0.35 + L.ph));
                const base =
                    h * (L.y + 0.025 * Math.sin(t * 0.25 + L.ph * 1.3));
                ctx.beginPath();
                ctx.moveTo(-step, h);
                for (let x = -step; x <= w + step; x += step) {
                    const u = x / w;
                    ctx.lineTo(
                        x,
                        base +
                            h * (0.5 - u) * 0.1 +
                            Math.sin(u * TAU * L.f + t * L.sp + L.ph) * A,
                    );
                }
                ctx.lineTo(w + step, h);
                ctx.closePath();
                ctx.globalAlpha = L.al;
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        },
    }),
};
