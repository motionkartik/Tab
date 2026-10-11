// Background application utilities shared by workspace modules and chrome-integration.js.
// Note: content.ts has its own copy of this logic (it runs in a separate context
// and cannot import page-side ES modules).

import { ANIM_BG_CLASSES } from "./constants.js";
import { escapeCssUrl, sanitizeImageSource } from "./untrusted-input.js";
import {
    buildPalette,
    parseSceneAppearance,
    parseSceneValue,
    resolveSceneVariant,
    scenePlaceholderCss,
} from "./backgrounds/scene-kit.js";

/**
 * Apply a background descriptor { type, value } to document.body.
 *
 * type 'color' value formats:
 *   '__animated__:<name>'  → CSS animation class
 *   '__scene__:<id>|<tint>|<variant>' → canvas scene (see backgrounds/)
 *   '__solid__:<css>'      → solid colour or any CSS value
 *   '__css__:<css>'        → arbitrary CSS (alias of __solid__)
 *   '<gradient>'           → CSS gradient string (backgroundImage)
 *
 * type 'image' value: data-URL or remote URL string
 *
 * @param {{ type: string, value: string }} bg
 */
const clearAdvancedProps = () => {
    document.body.style.backgroundBlendMode = "";
    document.body.style.filter = "";
    document.body.style.backgroundColor = "";
    document.body.style.webkitMaskImage = "";
    document.body.style.maskImage = "";
};

// The scene runtime (canvas + animation loop) is only fetched once a scene
// background is actually used. Start and stop are chained on the same promise,
// so they always run in the order they were requested.
let sceneRuntime = null;

const loadSceneRuntime = () => {
    sceneRuntime ??= import("./backgrounds/scene-runtime.js");
    return sceneRuntime;
};

const stopSceneBackground = () => {
    if (!sceneRuntime) return;
    void sceneRuntime.then((runtime) => runtime.stopScene());
};

const startSceneBackground = (scene) => {
    void loadSceneRuntime()
        .then((runtime) => runtime.startScene(scene))
        .catch((error) => {
            console.warn("[background-utils] Scene background failed:", error);
        });
};

export const normalizeCssBackgroundValue = (rawValue) => {
    if (typeof rawValue !== "string") return "";

    const trimmedValue = rawValue.trim();
    if (!trimmedValue) return "";

    const withoutTrailingSemicolons = trimmedValue.replace(/;+$/, "").trim();

    if (
        typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports("background", withoutTrailingSemicolons)
    ) {
        return withoutTrailingSemicolons;
    }

    return trimmedValue;
};

const paintBackground = (bg) => {
    if (!bg) return;
    const { type, value } = bg;
    const scene = type === "color" ? parseSceneValue(value) : null;
    // A scene value whose id this version does not know (removed, or saved by
    // a newer version) still carries a tint: show its static gradient.
    const sceneAppearance =
        scene || (type === "color" ? parseSceneAppearance(value) : null);

    if (!scene) stopSceneBackground();

    if (sceneAppearance) {
        // Paint a static stand-in on <body> right away; the canvas takes
        // over once the scene module has loaded.
        const palette = buildPalette(
            sceneAppearance.tint,
            resolveSceneVariant(sceneAppearance.variant),
        );
        clearAdvancedProps();
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.style.backgroundImage = "";
        document.body.style.background = scenePlaceholderCss(palette);
        document.body.style.backgroundSize = "";
        document.body.style.backgroundPosition = "";
        document.body.style.backgroundRepeat = "";
        if (scene) startSceneBackground(scene);
    } else if (
        type === "color" &&
        typeof value === "string" &&
        value.startsWith("__animated__:")
    ) {
        const animName = value.replace("__animated__:", "");
        clearAdvancedProps();
        document.body.style.backgroundImage = "";
        document.body.style.background = "";
        document.body.style.backgroundSize = "";
        document.body.style.backgroundPosition = "";
        document.body.style.backgroundRepeat = "";
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.classList.add(`bg-anim-${animName}`);
    } else if (
        type === "color" &&
        typeof value === "string" &&
        value.startsWith("__advanced__:")
    ) {
        let data;
        try {
            data = JSON.parse(value.replace("__advanced__:", ""));
        } catch (e) {
            console.warn(
                "[background-utils] Invalid __advanced__ background data:",
                e.message,
            );
            return;
        }
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.style.background = "";
        document.body.style.backgroundImage = data.backgroundImage || "";
        document.body.style.backgroundBlendMode =
            data.backgroundBlendMode || "";
        document.body.style.filter = data.filter || "";
        document.body.style.backgroundColor = data.backgroundColor || "";
        document.body.style.backgroundSize = "";
        document.body.style.backgroundPosition = "";
        document.body.style.backgroundRepeat = "";
        document.body.style.webkitMaskImage = data.maskImage || "";
        document.body.style.maskImage = data.maskImage || "";
    } else if (
        type === "color" &&
        typeof value === "string" &&
        (value.startsWith("__solid__:") || value.startsWith("__css__:"))
    ) {
        const cssValue = normalizeCssBackgroundValue(
            value.replace(/^__(solid|css)__:/, ""),
        );
        clearAdvancedProps();
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.style.backgroundImage = "";
        document.body.style.background = cssValue;
        document.body.style.backgroundSize = "";
        document.body.style.backgroundPosition = "";
        document.body.style.backgroundRepeat = "";
    } else if (type === "color") {
        const backgroundValue = normalizeCssBackgroundValue(value);
        clearAdvancedProps();
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.style.backgroundImage = backgroundValue;
        document.body.style.backgroundSize = "";
        document.body.style.backgroundPosition = "";
        document.body.style.backgroundRepeat = "";
    } else if (type === "image" && value) {
        const safeImageSource = sanitizeImageSource(value);
        if (!safeImageSource) {
            console.warn("[background-utils] Ignoring unsupported background image source.");
            return;
        }

        clearAdvancedProps();
        document.body.classList.remove(...ANIM_BG_CLASSES);
        document.body.style.backgroundImage = `url("${escapeCssUrl(safeImageSource)}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundRepeat = "no-repeat";
    }
};

let appliedBackground = null;

/** The background descriptor most recently applied to the page (or null). */
export const getAppliedBackground = () => appliedBackground;

export const applyBackgroundObj = (bg) => {
    if (!bg) return;
    paintBackground(bg);
    appliedBackground = bg;
    // Lets the settings card keep its "current background" preview in sync,
    // whichever code path applied the background.
    window.dispatchEvent(
        new CustomEvent("rt:background-applied", { detail: { background: bg } }),
    );
};
