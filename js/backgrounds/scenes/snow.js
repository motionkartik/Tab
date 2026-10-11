import { TAU, rgba, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "snow",
    make: () => {
        let flakes = null;
        const spawn = (any, crystal) => ({
            x: Math.random(),
            y: any ? Math.random() : -0.03,
            z: crystal ? 0.75 + Math.random() * 0.25 : Math.random(),
            ph: Math.random() * TAU,
            crystal,
            rot: Math.random() * TAU,
            spin: (Math.random() - 0.5) * 0.6,
        });
        return {
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                if (!flakes)
                    flakes = [
                        ...Array.from({ length: 160 }, () =>
                            spawn(true, false),
                        ),
                        ...Array.from({ length: 14 }, () => spawn(true, true)),
                    ].sort((a, b) => a.z - b.z);
                const S = scaleOf(w, h),
                    col = p.light ? p.ink[0] : p.ink[2],
                    wind = Math.sin(t * 0.1) * 0.01;
                for (const f of flakes) {
                    f.y += (0.025 + 0.06 * f.z) * dt;
                    f.x +=
                        (wind +
                            Math.sin(t * 0.7 + f.ph) * 0.008 * (0.4 + f.z)) *
                        dt;
                    if (f.y > 1.03) Object.assign(f, spawn(false, f.crystal));
                    if (f.x < -0.03) f.x += 1.06;
                    else if (f.x > 1.03) f.x -= 1.06;
                    const x = f.x * w,
                        y = f.y * h;
                    if (!f.crystal) {
                        const r = (0.6 + 2.6 * f.z * f.z) * S * 1.5 + 0.4;
                        ctx.fillStyle = rgba(col, 0.35 + 0.6 * f.z);
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, TAU);
                        ctx.fill();
                        continue;
                    }
                    const R = (7 + 6 * f.z) * S * 1.6 + 3;
                    f.rot += f.spin * dt;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(f.rot);
                    ctx.strokeStyle = rgba(col, 0.85);
                    ctx.lineWidth = Math.max(0.8, R * 0.09);
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = (k * TAU) / 6,
                            cx = Math.cos(a),
                            cy = Math.sin(a);
                        ctx.moveTo(0, 0);
                        ctx.lineTo(cx * R, cy * R);
                        for (const [d, b] of [
                            [0.5, 0.28],
                            [0.75, 0.18],
                        ]) {
                            const bx = cx * R * d,
                                by = cy * R * d;
                            ctx.moveTo(bx, by);
                            ctx.lineTo(
                                bx + Math.cos(a + 0.8) * R * b,
                                by + Math.sin(a + 0.8) * R * b,
                            );
                            ctx.moveTo(bx, by);
                            ctx.lineTo(
                                bx + Math.cos(a - 0.8) * R * b,
                                by + Math.sin(a - 0.8) * R * b,
                            );
                        }
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            },
        };
    },
};
