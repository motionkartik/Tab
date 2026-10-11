import { mix, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "waves",
    make: () => ({
        draw(ctx, w, h, t, dt, p) {
            sky(ctx, w, h, p);
            const S = scaleOf(w, h),
                step = Math.max(3, w / 300),
                amp = Math.min(h, w * 0.7),
                N = 6;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            for (let i = 0; i < N; i++) {
                const k = i / (N - 1);
                const base = h * (0.28 + k * 0.46);
                const a = amp * (0.07 + 0.025 * Math.sin(t * 0.23 + i * 1.1));
                const phase = t * 0.18 + i * 0.45;
                const line = new Path2D();
                for (let x = -step; x <= w + step; x += step) {
                    // the sine argument spans 1.2 pi across the width, so each line turns at most twice
                    const y =
                        base + Math.sin(phase + (x / w) * Math.PI * 1.2) * a;
                    x === -step ? line.moveTo(x, y) : line.lineTo(x, y);
                }
                const g = ctx.createLinearGradient(0, 0, w, 0);
                g.addColorStop(0, p.ink[0]);
                g.addColorStop(0.5, mix(p.ink[0], p.ink[1], 0.3 + 0.7 * k));
                g.addColorStop(1, p.ink[0]);
                ctx.strokeStyle = g;
                ctx.globalAlpha = 0.1;
                ctx.lineWidth = Math.max(4, 12 * S);
                ctx.stroke(line);
                ctx.globalAlpha = 0.55 + 0.45 * k;
                ctx.lineWidth = Math.max(1.2, 2.4 * S);
                ctx.stroke(line);
            }
            ctx.globalAlpha = 1;
        },
    }),
};
