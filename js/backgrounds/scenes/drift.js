import { TAU, rgba, sky } from "../scene-kit.js";

export default {
    id: "drift",
    make: () => {
        let bs = null;
        // about one bubble in seventy is a rare big one, two to three times the size, rising a little slower
        const spawn = (any) => {
            const big = Math.random() < 0.015;
            return {
                x: Math.random(),
                y: any ? Math.random() * 1.2 : 1.3,
                z: big ? 0.7 + Math.random() * 0.3 : Math.random(),
                ph: Math.random() * TAU,
                big: big ? 2.2 + Math.random() * 0.9 : 1,
            };
        };
        return {
            init() {
                if (!bs)
                    bs = Array.from({ length: 70 }, () => spawn(true)).sort(
                        (a, b) => a.z - b.z,
                    );
            },
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                const M = Math.max(w, h);
                for (const b of bs) {
                    const r = (0.005 + 0.03 * b.z * b.z) * M * b.big;
                    b.y -= ((0.02 + 0.07 * b.z) * dt) / Math.sqrt(b.big);
                    if (b.y < -0.3) Object.assign(b, spawn(false));
                    const x = b.x * w + Math.sin(t * 0.6 + b.ph) * r * 1.2,
                        y = b.y * h,
                        a = 0.25 + 0.65 * b.z;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, TAU);
                    ctx.fillStyle = rgba(p.ink[0], 0.1 * a);
                    ctx.fill();
                    ctx.strokeStyle = rgba(p.ink[1], 0.6 * a);
                    ctx.lineWidth = Math.max(0.6, r * 0.06);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(x, y, r * 0.7, Math.PI * 1.1, Math.PI * 1.45);
                    ctx.strokeStyle = rgba(p.ink[2], 0.75 * a);
                    ctx.lineWidth = Math.max(0.6, r * 0.09);
                    ctx.lineCap = "round";
                    ctx.stroke();
                }
            },
        };
    },
};
