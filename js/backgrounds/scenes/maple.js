import { TAU, mix, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "maple",
    make: () => {
        let leaves = null;
        // right half of a five-lobed maple outline in unit space (tip at y = -1), mirrored for the left half
        const RIGHT = [
            [0, 0.32],
            [0.1, 0.36],
            [0.3, 0.44],
            [0.26, 0.28],
            [0.5, 0.2],
            [0.42, 0.1],
            [0.88, -0.1],
            [0.66, -0.18],
            [0.75, -0.35],
            [0.52, -0.3],
            [0.5, -0.53],
            [0.34, -0.4],
            [0.28, -0.63],
            [0.16, -0.58],
            [0.2, -0.8],
            [0.08, -0.74],
            [0, -1],
        ];
        const outline = new Path2D();
        [
            ...RIGHT,
            ...RIGHT.slice(1, -1)
                .reverse()
                .map(([x, y]) => [-x, y]),
        ].forEach(([x, y], i) =>
            i ? outline.lineTo(x, y) : outline.moveTo(x, y),
        );
        outline.closePath();
        const veins = new Path2D();
        for (const [x, y] of [
            [0, -0.95],
            [0.82, -0.1],
            [-0.82, -0.1],
            [0.28, 0.4],
            [-0.28, 0.4],
            [0.62, -0.42],
            [-0.62, -0.42],
        ]) {
            veins.moveTo(0, 0.3);
            veins.lineTo(x, y);
        }
        const stem = new Path2D();
        stem.moveTo(0, 0.3);
        stem.quadraticCurveTo(0.02, 0.5, 0.08, 0.72);
        const spawn = (any) => ({
            x: Math.random(),
            y: any ? Math.random() * 1.1 - 0.1 : -0.08 - Math.random() * 0.1,
            z: 0.3 + Math.random() * 0.7,
            ph: Math.random() * TAU,
            spin: (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.8),
            flip: 0.5 + Math.random() * 1.1,
            c: Math.random(),
        });
        return {
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                if (!leaves)
                    leaves = Array.from({ length: 26 }, () => spawn(true)).sort(
                        (a, b) => a.z - b.z,
                    );
                const S = scaleOf(w, h),
                    wind = Math.sin(t * 0.11) * 0.012;
                for (const L of leaves) {
                    L.y += (0.025 + 0.04 * L.z) * dt;
                    L.x += (wind + Math.sin(t * 0.6 + L.ph) * 0.025 * L.z) * dt;
                    if (L.y > 1.12) Object.assign(L, spawn(false));
                    if (L.x < -0.08) L.x += 1.16;
                    else if (L.x > 1.08) L.x -= 1.16;
                    const size = (12 + 22 * L.z) * S * 1.6 + 4;
                    ctx.save();
                    ctx.translate(L.x * w, L.y * h);
                    ctx.rotate(
                        Math.sin(t * 0.5 + L.ph) * 0.8 + t * L.spin * 0.35,
                    );
                    const fx = Math.cos(t * L.flip + L.ph),
                        fy =
                            0.75 +
                            0.25 * Math.cos(t * L.flip * 0.7 + L.ph * 1.3);
                    ctx.scale(size * Math.max(0.12, Math.abs(fx)), size * fy);
                    ctx.globalAlpha = 0.5 + 0.5 * L.z;
                    const back = fx < 0;
                    const g = ctx.createLinearGradient(0, -1, 0, 0.45);
                    g.addColorStop(
                        0,
                        back
                            ? mix(p.ink[1], p.bg, 0.3)
                            : mix(p.ink[1], p.ink[0], L.c * 0.6),
                    );
                    g.addColorStop(
                        1,
                        back
                            ? mix(p.ink[0], p.bg, 0.35)
                            : mix(p.ink[0], p.bg, L.c < 0.3 ? 0.15 : 0),
                    );
                    ctx.fillStyle = g;
                    ctx.fill(outline);
                    ctx.lineCap = "round";
                    ctx.strokeStyle = mix(p.ink[0], p.bg, 0.5, 0.7);
                    ctx.lineWidth = (Math.max(0.5, 0.9 * S) / size) * 1.6;
                    ctx.stroke(veins);
                    ctx.strokeStyle = mix(p.ink[0], p.bg, 0.35);
                    ctx.lineWidth = (Math.max(0.8, 1.6 * S) / size) * 1.6;
                    ctx.stroke(stem);
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
            },
        };
    },
};
