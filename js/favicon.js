// favicon.js — central helpers for link icons in the web build.
//
// Two behaviours live here:
//   1. Letter-avatar fallback: when a link has no icon, or its remote icon
//      fails to load, render a deterministic initial-based avatar instead of
//      nothing (or a broken image).
//   2. Remote-favicon privacy gate: `remoteFaviconsAllowed()` mirrors the
//      Settings → Favicons toggle (`general_remoteFavicons`, default ON).
//      When OFF, no icon request may leave the browser: builders return ""
//      and renderers show letter avatars instead of remote images.
//      `data:`/`blob:` URLs are local and always allowed.

/** True for http(s) URLs — i.e. requests that would leave the browser. */
export function isRemoteImageUrl(value) {
    if (typeof value !== "string") return false;
    const v = value.trim().toLowerCase();
    return v.startsWith("http://") || v.startsWith("https://");
}

/** Global kill-switch for remote favicon loads (default ON). */
export function remoteFaviconsAllowed() {
    try {
        return window.remoteFaviconsEnabled !== false;
    } catch {
        return true;
    }
}

function hashHue(str) {
    let h = 0;
    const s = String(str || "?");
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h % 360;
}

/**
 * Build a letter-avatar element for `name`.
 * Deterministic hue derived from the name; always local (no network).
 */
export function letterAvatarElement(name, size = 16) {
    const letter = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
    const hue = hashHue(name);
    const el = document.createElement("span");
    el.className = "letter-avatar";
    el.textContent = letter;
    el.setAttribute("aria-hidden", "true");
    const px = Math.max(12, Number(size) || 16);
    el.style.width = `${px}px`;
    el.style.height = `${px}px`;
    el.style.fontSize = `${Math.round(px * 0.62)}px`;
    el.style.background = `hsl(${hue} 45% 45%)`;
    return el;
}

/**
 * Build an <img> for a favicon URL that swaps itself for a letter avatar of
 * `fallbackName` when the remote image fails to load.
 */
export function faviconImage(url, { size = 16, fallbackName = "?", className = "" } = {}) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    if (className) img.className = className;
    img.style.display = "block";
    img.style.objectFit = "contain";
    img.addEventListener(
        "error",
        () => {
            const avatar = letterAvatarElement(fallbackName, size);
            if (img.className) avatar.classList.add(...img.className.split(/\s+/).filter(Boolean));
            img.replaceWith(avatar);
        },
        { once: true },
    );
    return img;
}
