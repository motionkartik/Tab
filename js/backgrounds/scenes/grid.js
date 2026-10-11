import { TAU, rgba, scaleOf, sky } from "../scene-kit.js";

export default {
    id: "grid",
    make: () => {
        let off = null,
            octx = null,
            mask = null,
            mctx = null,
            snakes = null,
            dims = "";
        const SPEED = 2.2,
            DIRS = [
                [1, 0],
                [0, 1],
                [-1, 0],
                [0, -1],
            ];
        const pickDir = (sn, cols, rows) => {
            const opts = [];
            for (let d = 0; d < 4; d++) {
                if (d === (sn.dir + 2) % 4) continue;
                const nx = sn.c + DIRS[d][0],
                    ny = sn.r + DIRS[d][1];
                if (nx < 0 || ny < 0 || nx > cols || ny > rows) continue;
                opts.push(...Array(d === sn.dir ? 3 : 1).fill(d));
            }
            return opts.length
                ? opts[Math.floor(Math.random() * opts.length)]
                : (sn.dir + 2) % 4;
        };
        const advance = (sn, dt, cols, rows) => {
            sn.u += dt * SPEED;
            while (sn.u >= 1) {
                sn.u -= 1;
                sn.c += DIRS[sn.dir][0];
                sn.r += DIRS[sn.dir][1];
                sn.hist.unshift([sn.c, sn.r]);
                if (sn.hist.length > sn.len + 1) sn.hist.pop();
                sn.dir = pickDir(sn, cols, rows);
            }
        };
        // head point first, then the visited crossings back to the tail
        const points = (sn, T, ox, oy) => {
            const hx = sn.c + DIRS[sn.dir][0] * sn.u,
                hy = sn.r + DIRS[sn.dir][1] * sn.u;
            return [[hx, hy], ...sn.hist].map(([x, y]) => [
                ox + x * T,
                oy + y * T,
            ]);
        };
        const segDist = (px, py, ax, ay, bx, by) => {
            const dx = bx - ax,
                dy = by - ay,
                l2 = dx * dx + dy * dy || 1;
            const k = Math.max(
                0,
                Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2),
            );
            return Math.hypot(px - ax - k * dx, py - ay - k * dy);
        };
        return {
            draw(ctx, w, h, t, dt, p) {
                sky(ctx, w, h, p);
                const S = scaleOf(w, h),
                    T = Math.max(22, 64 * S);
                const cols = Math.floor(w / T),
                    rows = Math.floor(h / T),
                    ox = (w - cols * T) / 2,
                    oy = (h - rows * T) / 2;
                const cw = ctx.canvas.width,
                    ch = ctx.canvas.height;
                if (!off || off.width !== cw || off.height !== ch) {
                    off = document.createElement("canvas");
                    off.width = cw;
                    off.height = ch;
                    octx = off.getContext("2d");
                    mask = document.createElement("canvas");
                    mask.width = cw;
                    mask.height = ch;
                    mctx = mask.getContext("2d");
                }
                if (!snakes || dims !== cols + "x" + rows) {
                    dims = cols + "x" + rows;
                    snakes = [
                        [0.2, 0.3, 0, 8],
                        [0.8, 0.5, 2, 6],
                        [0.5, 0.8, 3, 4],
                    ].map(([fx, fy, dir, len]) => {
                        const sn = {
                            c: Math.round(cols * fx),
                            r: Math.round(rows * fy),
                            dir,
                            len,
                            u: 0,
                            hist: [],
                        };
                        sn.hist.push([sn.c, sn.r]);
                        for (let k = 0; k < 120; k++)
                            advance(sn, 1 / 20, cols, rows);
                        return sn;
                    });
                }
                for (const sn of snakes) advance(sn, dt, cols, rows);
                const paths = snakes.map((sn) => points(sn, T, ox, oy));
                const tf = ctx.getTransform();
                // mask: a soft, wide stroke along each snake that thins out toward the tail
                mctx.setTransform(1, 0, 0, 1, 0, 0);
                mctx.clearRect(0, 0, cw, ch);
                mctx.setTransform(tf);
                mctx.lineCap = "round";
                mctx.lineJoin = "round";
                for (const pts of paths) {
                    for (let k = 0; k < pts.length - 1; k++) {
                        const wgt = 1 - k / (pts.length - 1);
                        for (const [lw, a] of [
                            [T * 2.6, 0.12],
                            [T * 1.8, 0.18],
                            [T * 1.1, 0.3],
                            [T * 0.5, 0.4],
                        ]) {
                            mctx.strokeStyle = `rgba(0,0,0,${a * wgt})`;
                            mctx.lineWidth = lw * (0.55 + 0.45 * wgt);
                            mctx.beginPath();
                            mctx.moveTo(pts[k][0], pts[k][1]);
                            mctx.lineTo(pts[k + 1][0], pts[k + 1][1]);
                            mctx.stroke();
                        }
                    }
                }
                // revealed lattice + crossings, limited to the area around the snakes
                octx.setTransform(1, 0, 0, 1, 0, 0);
                octx.clearRect(0, 0, cw, ch);
                octx.setTransform(tf);
                octx.save();
                octx.shadowColor = p.ink[1];
                octx.shadowBlur = 4 + 8 * S;
                octx.lineWidth = Math.max(1, 1.3 * S);
                octx.strokeStyle = rgba(p.ink[1], 0.8);
                octx.beginPath();
                const nodes = new Set();
                for (const pts of paths) {
                    const xs = pts.map((q) => q[0]),
                        ys = pts.map((q) => q[1]),
                        pad = T * 1.5;
                    const c0 = Math.max(
                            0,
                            Math.floor((Math.min(...xs) - pad - ox) / T),
                        ),
                        c1 = Math.min(
                            cols,
                            Math.ceil((Math.max(...xs) + pad - ox) / T),
                        );
                    const r0 = Math.max(
                            0,
                            Math.floor((Math.min(...ys) - pad - oy) / T),
                        ),
                        r1 = Math.min(
                            rows,
                            Math.ceil((Math.max(...ys) + pad - oy) / T),
                        );
                    for (let c = c0; c <= c1; c++) {
                        octx.moveTo(ox + c * T, oy + r0 * T);
                        octx.lineTo(ox + c * T, oy + r1 * T);
                    }
                    for (let r = r0; r <= r1; r++) {
                        octx.moveTo(ox + c0 * T, oy + r * T);
                        octx.lineTo(ox + c1 * T, oy + r * T);
                    }
                    for (let c = c0; c <= c1; c++)
                        for (let r = r0; r <= r1; r++) nodes.add(c * 10000 + r);
                }
                octx.stroke();
                octx.restore();
                for (const key of nodes) {
                    const x = ox + Math.floor(key / 10000) * T,
                        y = oy + (key % 10000) * T;
                    let near = 0;
                    for (const pts of paths)
                        for (let k = 0; k < pts.length - 1; k++) {
                            const wgt = 1 - k / (pts.length - 1);
                            near = Math.max(
                                near,
                                (1 -
                                    segDist(
                                        x,
                                        y,
                                        pts[k][0],
                                        pts[k][1],
                                        pts[k + 1][0],
                                        pts[k + 1][1],
                                    ) /
                                        (T * 1.2)) *
                                    wgt,
                            );
                        }
                    if (near <= 0) continue;
                    const R = (5 + 14 * near) * S + 3;
                    const g = octx.createRadialGradient(x, y, 0, x, y, R);
                    g.addColorStop(0, rgba(p.ink[2], 0.9));
                    g.addColorStop(0.25, rgba(p.ink[1], 0.35));
                    g.addColorStop(1, rgba(p.ink[1], 0));
                    octx.fillStyle = g;
                    octx.fillRect(x - R, y - R, R * 2, R * 2);
                    octx.fillStyle = rgba(p.ink[2], 1);
                    octx.beginPath();
                    octx.arc(x, y, Math.max(1.2, 2 * S), 0, TAU);
                    octx.fill();
                }
                octx.setTransform(1, 0, 0, 1, 0, 0);
                octx.globalCompositeOperation = "destination-in";
                octx.drawImage(mask, 0, 0);
                octx.globalCompositeOperation = "source-over";
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(off, 0, 0);
                ctx.restore();
            },
        };
    },
};
