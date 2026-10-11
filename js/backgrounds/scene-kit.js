// Shared helpers for the canvas ("scene") backgrounds: value parsing, the
// tint → palette builder, and the small drawing/noise toolkit every scene uses.
// Kept dependency-free so the public reader can import it for its static fallback.

export const TAU = Math.PI * 2;

export const SCENE_PREFIX = "__scene__:";

/** Scene ids in the order they appear in the Animated tab. */
export const SCENE_IDS = [
    "wave",
    "waves",
    "swell",
    "constellation",
    "grid",
    "drift",
    "leaves",
    "maple",
    "snow",
    "rain",
];

export const SCENE_VARIANTS = ["system", "dark", "light"];

/** Preset tints offered in the settings card. */
export const SCENE_TINTS = [
    { id: "teal", hex: "#2fb3c4" },
    { id: "coral", hex: "#e8664f" },
    { id: "moss", hex: "#6fae5a" },
    { id: "indigo", hex: "#6d7cff" },
    { id: "magenta", hex: "#e04ce8" },
    { id: "amber", hex: "#e9a53a" },
];

export const DEFAULT_SCENE_TINT = "#2fb3c4";
export const DEFAULT_SCENE_VARIANT = "system";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Parse a stored background value of the form
 * `__scene__:<id>|<#rrggbb>|<system|dark|light>`.
 * Returns null for anything that is not a known, well-formed scene value.
 */
export function parseSceneValue(value) {
    if (typeof value !== "string" || !value.startsWith(SCENE_PREFIX)) {
        return null;
    }
    const [id, tint, variant] = value.slice(SCENE_PREFIX.length).split("|");
    if (!SCENE_IDS.includes(id)) return null;
    return {
        id,
        tint: HEX_COLOR_RE.test(tint || "")
            ? tint.toLowerCase()
            : DEFAULT_SCENE_TINT,
        variant: SCENE_VARIANTS.includes(variant)
            ? variant
            : DEFAULT_SCENE_VARIANT,
    };
}

/**
 * Tint + appearance of any `__scene__:` value, even when its scene id is not
 * one this version knows (removed, or added by a newer version). Lets such a
 * value degrade to the palette gradient instead of an invalid CSS background.
 * Returns null when the value is not a scene value at all.
 */
export function parseSceneAppearance(value) {
    if (typeof value !== "string" || !value.startsWith(SCENE_PREFIX)) {
        return null;
    }
    const [, tint, variant] = value.slice(SCENE_PREFIX.length).split("|");
    return {
        tint: HEX_COLOR_RE.test(tint || "")
            ? tint.toLowerCase()
            : DEFAULT_SCENE_TINT,
        variant: SCENE_VARIANTS.includes(variant)
            ? variant
            : DEFAULT_SCENE_VARIANT,
    };
}

export function formatSceneValue({ id, tint, variant }) {
    return `${SCENE_PREFIX}${id}|${tint}|${variant}`;
}

/** Resolve "system" to the OS color scheme. */
export function resolveSceneVariant(variant) {
    if (variant === "dark" || variant === "light") return variant;
    const prefersDark =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
}

/* ---------- color helpers ---------- */

const hexCache = new Map();

export const hex = (h) => {
    let v = hexCache.get(h);
    if (!v) {
        v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        hexCache.set(h, v);
    }
    return v;
};

export const rgba = (h, a = 1) => `rgba(${hex(h).join(",")},${a})`;

/** Mix two hex colors. Both inputs must be `#rrggbb` (not an rgba() string). */
export const mix = (a, b, t, al = 1) => {
    const A = hex(a);
    const B = hex(b);
    return `rgba(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)},${al})`;
};

function hexToHsl(hx) {
    const [r, g, b] = hex(hx).map((v) => v / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    const h = d
        ? (mx === r
              ? ((g - b) / d) % 6
              : mx === g
                ? (b - r) / d + 2
                : (r - g) / d + 4) * 60
        : 0;
    return [(h + 360) % 360, s * 100, l * 100];
}

function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return (
        "#" +
        [f(0), f(8), f(4)]
            .map((x) =>
                Math.round(x * 255)
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}

/**
 * Derive the full scene palette from one tint color.
 * `variant` must already be resolved to "dark" or "light".
 */
export function buildPalette(tint, variant) {
    const [h, s0] = hexToHsl(tint);
    const s = Math.max(35, Math.min(90, s0));
    if (variant === "light") {
        return {
            light: true,
            bg: hsl(h, s * 0.35, 96),
            bg2: hsl(h, s * 0.4, 88),
            ink: [
                hsl(h, s * 0.8, 44),
                hsl(h + 12, s * 0.85, 60),
                hsl(h, s * 0.5, 18),
            ],
            swell: [hsl(h - 18, 90, 58), hsl(h + 22, 90, 62)],
        };
    }
    return {
        light: false,
        bg: hsl(h, s * 0.45, 7),
        bg2: hsl(h, s * 0.45, 15),
        ink: [
            hsl(h, s * 0.75, 48),
            hsl(h + 12, s * 0.85, 70),
            hsl(h, s * 0.4, 92),
        ],
        swell: [hsl(h - 18, 80, 45), hsl(h + 22, 90, 62)],
    };
}

/** Static CSS stand-in for a scene (used before the canvas paints, and by the reader). */
export function scenePlaceholderCss(palette) {
    return `linear-gradient(180deg, ${palette.bg}, ${palette.bg2})`;
}

/* ---------- drawing helpers ---------- */

export function sky(ctx, w, h, p) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.bg);
    g.addColorStop(1, p.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

/** Size factor so a scene looks the same in a thumbnail as it does full screen. */
export const scaleOf = (w, h) => Math.max(0.3, Math.max(w, h) / 1440);

/* ---------- Perlin noise ---------- */

const P = new Uint8Array(512);
{
    let seed = 1337;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const order = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = order[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function grad(h, x, y, z) {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return (g & 1 ? -u : u) + (g & 2 ? -v : v);
}

/** 3D Perlin noise, roughly in [-1, 1]. */
export function noise3(x, y, z) {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    let Z = Math.floor(z);
    x -= X;
    y -= Y;
    z -= Z;
    X &= 255;
    Y &= 255;
    Z &= 255;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = P[X] + Y;
    const AA = P[A] + Z;
    const AB = P[A + 1] + Z;
    const B = P[X + 1] + Y;
    const BA = P[B] + Z;
    const BB = P[B + 1] + Z;
    return lerp(
        lerp(
            lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u),
            lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u),
            v,
        ),
        lerp(
            lerp(
                grad(P[AA + 1], x, y, z - 1),
                grad(P[BA + 1], x - 1, y, z - 1),
                u,
            ),
            lerp(
                grad(P[AB + 1], x, y - 1, z - 1),
                grad(P[BB + 1], x - 1, y - 1, z - 1),
                u,
            ),
            v,
        ),
        w,
    );
}
