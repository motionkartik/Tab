import { TAU, mix, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "leaves",
    make: () => {
        let leaves = null;
        const spawn = (any) => ({
            x: Math.random(),
            y: any ? Math.random() * 1.1 - 0.1 : -0.05 - Math.random() * 0.1,
            z: 0.35 + Math.random() * 0.65,
            ph: Math.random() * TAU,
            spin: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4),
            flip: 0.8 + Math.random() * 1.6,
            c: Math.random(),
        });
        return {
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                if (!leaves)
                    leaves = Array.from({ length: 55 }, () => spawn(true)).sort(
                        (a, b) => a.z - b.z,
                    );
                const M = Math.max(w, h),
                    S = scaleOf(w, h),
                    wind = Math.sin(t * 0.13) * 0.012;
                for (const L of leaves) {
                    L.y += (0.035 + 0.05 * L.z) * dt;
                    L.x += (wind + Math.sin(t * 0.9 + L.ph) * 0.02 * L.z) * dt;
                    if (L.y > 1.08) Object.assign(L, spawn(false));
                    if (L.x < -0.05) L.x += 1.1;
                    else if (L.x > 1.05) L.x -= 1.1;
                    const size = (5 + 9 * L.z) * S * 1.6 + 2,
                        x = L.x * w,
                        y = L.y * h;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(
                        Math.sin(t * 0.8 + L.ph) * 0.9 + t * L.spin * 0.4,
                    );
                    ctx.scale(
                        Math.max(0.15, Math.abs(Math.cos(t * L.flip + L.ph))),
                        1,
                    );
                    ctx.globalAlpha = 0.45 + 0.55 * L.z;
                    ctx.beginPath();
                    ctx.moveTo(0, -size);
                    ctx.quadraticCurveTo(size * 0.75, -size * 0.2, 0, size);
                    ctx.quadraticCurveTo(-size * 0.75, -size * 0.2, 0, -size);
                    ctx.fillStyle =
                        L.c < 0.5
                            ? mix(p.ink[0], p.ink[1], L.c * 2)
                            : mix(p.ink[1], p.ink[0], (L.c - 0.5) * 0.6);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(0, -size * 0.85);
                    ctx.lineTo(0, size * 1.25);
                    ctx.strokeStyle = mix(p.ink[0], p.bg, 0.45);
                    ctx.lineWidth = Math.max(0.6, size * 0.08);
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
            },
        };
    },
};
