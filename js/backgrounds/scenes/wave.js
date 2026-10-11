import { TAU, noise3, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "wave",
    make: () => ({
        draw(ctx, w, h, t, dt, p) {
            sky(ctx, w, h, p);
            const S = scaleOf(w, h),
                step = Math.max(3, w / 300),
                amp = Math.min(h, w * 0.7);
            const line = new Path2D();
            for (let x = -step; x <= w + step; x += step) {
                const y =
                    h * 0.52 +
                    Math.sin((x / (w * 1.1)) * TAU + t * 0.28) * amp * 0.13 +
                    Math.sin((x / (w * 0.43)) * TAU - t * 0.41 + 1.3) *
                        amp *
                        0.045 +
                    noise3(x / (w * 0.6), 0.5, t * 0.08) * amp * 0.07;
                x === -step ? line.moveTo(x, y) : line.lineTo(x, y);
            }
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, p.ink[0]);
            g.addColorStop(0.5, p.ink[1]);
            g.addColorStop(1, p.ink[0]);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = g;
            ctx.globalAlpha = 0.06;
            ctx.lineWidth = Math.max(8, 34 * S);
            ctx.stroke(line);
            ctx.globalAlpha = 0.14;
            ctx.lineWidth = Math.max(4, 12 * S);
            ctx.stroke(line);
            ctx.globalAlpha = 1;
            ctx.lineWidth = Math.max(1.5, 3 * S);
            ctx.stroke(line);
        },
    }),
};
