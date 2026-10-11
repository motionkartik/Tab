import { TAU, rgba, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "rain",
    make: () => {
        let drops = null,
            splashes = [];
        const spawn = (any) => ({
            x: Math.random() * 1.2 - 0.1,
            y: any ? Math.random() : -0.1 - Math.random() * 0.3,
            z: Math.random(),
        });
        return {
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                if (!drops)
                    drops = Array.from({ length: 220 }, () => spawn(true)).sort(
                        (a, b) => a.z - b.z,
                    );
                const S = scaleOf(w, h),
                    slant = 0.16,
                    ground = h * 0.985;
                ctx.lineCap = "round";
                for (const d of drops) {
                    const v = 0.55 + 1.1 * d.z;
                    d.y += v * dt;
                    d.x += v * slant * dt * (h / w);
                    const x = d.x * w,
                        y = d.y * h,
                        len = (8 + 34 * d.z) * S * 1.4 + 4;
                    if (y > ground && d.z > 0.6)
                        splashes.push({ x, y: ground, born: t, s: d.z });
                    if (y > ground) {
                        Object.assign(d, spawn(false));
                        continue;
                    }
                    ctx.strokeStyle = rgba(p.ink[1], 0.18 + 0.55 * d.z);
                    ctx.lineWidth = Math.max(0.6, (0.5 + 1.4 * d.z) * S * 1.3);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - len * slant, y - len);
                    ctx.stroke();
                }
                splashes = splashes.filter((sp) => t - sp.born < 0.45);
                for (const sp of splashes) {
                    const u = (t - sp.born) / 0.45,
                        r = (4 + 10 * sp.s) * S * 1.4 * u + 1;
                    ctx.strokeStyle = rgba(p.ink[1], 0.6 * (1 - u));
                    ctx.lineWidth = Math.max(0.6, S);
                    ctx.beginPath();
                    ctx.ellipse(sp.x, sp.y, r, r * 0.3, 0, 0, TAU);
                    ctx.stroke();
                }
            },
        };
    },
};
