export function parseColorAlpha(val) {
    if (!val) return null;
    const trimmed = val.trim();
    const rgba = trimmed.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );
    if (rgba) {
        const r = Math.round(parseFloat(rgba[1]));
        const g = Math.round(parseFloat(rgba[2]));
        const b = Math.round(parseFloat(rgba[3]));
        const a =
            rgba[4] !== undefined ? Math.round(parseFloat(rgba[4]) * 100) : 100;
        return {
            hex: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
            alpha: a,
        };
    }

    // Gradients (and other multi-stop values) can't be shown in a single color
    // swatch — fall back to the gradient's first color stop so the picker
    // reflects a real color instead of a gray placeholder.
    const gradientColor = extractGradientColor(trimmed);
    if (gradientColor) {
        const parsed = parseColorAlpha(gradientColor);
        if (parsed) return parsed;
    }

    const hex = toHex(trimmed);
    if (hex) return { hex, alpha: 100 };
    return null;
}

// Pull the first color stop out of a CSS gradient value (linear/radial/conic).
// Returns the raw color token (hex / rgb(a) / hsl(a)) or null when the value
// isn't a gradient. Direction/angle keywords are skipped by only matching
// recognized color syntaxes.
export function extractGradientColor(val) {
    if (!val || !/gradient\(/i.test(val)) return null;
    const match = val.match(
        /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i,
    );
    return match ? match[0] : null;
}

export function colorAlphaToValue(hex, alpha) {
    const normalizedHex = toHex(hex) || "#888888";
    if (alpha >= 100) return normalizedHex;
    const r = parseInt(normalizedHex.slice(1, 3), 16);
    const g = parseInt(normalizedHex.slice(3, 5), 16);
    const b = parseInt(normalizedHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${(alpha / 100).toFixed(2)})`;
}

export function toHex(val) {
    if (!val) return null;
    const trimmed = val.trim();

    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
        }
        return trimmed.slice(0, 7);
    }

    try {
        const ctx = document.createElement("canvas").getContext("2d");
        // Probe with two distinct sentinels: a valid CSS color overwrites both
        // to the same value, while an invalid one (e.g. a gradient) leaves each
        // sentinel intact — so differing results mean the value isn't a color.
        ctx.fillStyle = "#000000";
        ctx.fillStyle = trimmed;
        const black = ctx.fillStyle;
        ctx.fillStyle = "#ffffff";
        ctx.fillStyle = trimmed;
        const white = ctx.fillStyle;
        if (black === white && /^#[0-9a-f]{6}$/i.test(black)) return black;
    } catch {}

    return null;
}
