import { TAU, rgba, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "constellation",
    make: () => {
        let pts = null;
        return {
            init() {
                if (pts) return;
                pts = Array.from({ length: 130 }, () => ({
                    x: Math.random(),
                    y: Math.random(),
                    vx: (Math.random() - 0.5) * 0.014,
                    vy: (Math.random() - 0.5) * 0.014,
                    r: Math.random(),
                    ph: Math.random() * TAU,
                }));
            },
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                const M = Math.max(w, h),
                    D = M * 0.085,
                    D2 = D * D,
                    S = scaleOf(w, h);
                const xy = new Float32Array(pts.length * 2);
                pts.forEach((q, i) => {
                    q.x = (q.x + q.vx * dt + 1) % 1;
                    q.y = (q.y + q.vy * dt + 1) % 1;
                    xy[i * 2] = q.x * w;
                    xy[i * 2 + 1] = q.y * h;
                });
                ctx.lineWidth = Math.max(0.5, 0.9 * S);
                for (let i = 0; i < pts.length; i++)
                    for (let j = i + 1; j < pts.length; j++) {
                        const dx = xy[i * 2] - xy[j * 2],
                            dy = xy[i * 2 + 1] - xy[j * 2 + 1],
                            d2 = dx * dx + dy * dy;
                        if (d2 > D2) continue;
                        ctx.strokeStyle = rgba(
                            p.ink[1],
                            (1 - Math.sqrt(d2) / D) * 0.5,
                        );
                        ctx.beginPath();
                        ctx.moveTo(xy[i * 2], xy[i * 2 + 1]);
                        ctx.lineTo(xy[j * 2], xy[j * 2 + 1]);
                        ctx.stroke();
                    }
                pts.forEach((q, i) => {
                    const a = 0.55 + 0.45 * Math.sin(t * 1.6 + q.ph);
                    ctx.fillStyle = rgba(q.r > 0.8 ? p.ink[2] : p.ink[1], a);
                    ctx.beginPath();
                    ctx.arc(
                        xy[i * 2],
                        xy[i * 2 + 1],
                        Math.max(0.8, (1 + q.r * 2.2) * S),
                        0,
                        TAU,
                    );
                    ctx.fill();
                });
            },
        };
    },
};
