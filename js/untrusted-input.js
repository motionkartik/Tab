import { ANIM_BG_CLASSES } from "./constants.js";
import { formatSceneValue, parseSceneValue } from "./backgrounds/scene-kit.js";
import { GRID_COLS, doubleBoardColumns } from "./grid-columns.js";
import {
    ALL_THEME_CLASSES,
    THEME_CLASSES,
    THEME_DEFAULTS,
} from "./theme-editor/constants.js";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const BLOCKED_OPEN_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:"]);
const SAFE_TARGET_VALUES = new Set(["_self", "_blank", "_parent", "_top"]);
const ALLOWED_ITEM_TYPES = new Set([
    "link",
    "header",
    "divider",
    "note",
    "text",
    "todo",
    "clipboard",
    "launcher",
    "routine",
]);
const ALLOWED_LAUNCHER_KINDS = new Set(["app", "folder", "file", "powershell"]);
const ALLOWED_ROUTINE_STEP_KINDS = new Set([
    "url",
    "app",
    "file",
    "folder",
    "clipboard",
    "workspace",
    "delay",
]);
// "dock" / "icon-zone" (the removed tile-group experiment) are deliberately
// absent: any stray widget of those types loses its `type` below and lives
// on as a standard group holding the same items.
const ALLOWED_WORKSPACE_WIDGET_TYPES = new Set([
    "todo-list",
    "link-button",
    "clipboard-button",
    "launcher-button",
    "routine-button",
    "section-header",
    "section-stepheader",
    "section-text",
    "section-divider",
    "section-arrow",
    "section-callout",
    "section-code",
    "section-steps",
    "section-image",
    "section-profile",
    "section-linkcard",
    "section-file",
]);
const ALLOWED_SECTION_LEVELS = new Set(["h1", "h2", "h3"]);
const ALLOWED_ARROW_DIRS = new Set([
    "down",
    "right",
    "up",
    "left",
    "down-right",
    "down-left",
]);
const ALLOWED_FILE_KINDS = new Set([
    "generic",
    "pdf",
    "doc",
    "sheet",
    "slides",
    "archive",
    "image",
    "video",
    "audio",
]);
const PRESET_AVATAR_RE = /^preset:a([1-9]|10)$/;
const sanitizeHttpImageUrl = (val) => {
    try {
        const u = new URL(String(val).trim());
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch {
        return "";
    }
};
const ALLOWED_CALLOUT_VARIANTS = new Set([
    "info",
    "tip",
    "warning",
    "success",
    "error",
]);
const ALLOWED_TEXT_STYLES = new Set([
    "normal", "bold", "italic", "muted", "subtle", "mono",
]);
const ALLOWED_HEADER_ALIGN = new Set(["left", "center", "right"]);
const DISALLOWED_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const KNOWN_THEME_NAMES = new Set(Object.keys(THEME_CLASSES));
const KNOWN_MANAGED_THEME_CLASSES = new Set(
    ALL_THEME_CLASSES.filter((className) => className !== "dark-mode"),
);
const KNOWN_THEME_VAR_NAMES = new Set(
    Object.values(THEME_DEFAULTS).flatMap((themeDefaults) =>
        Object.keys(themeDefaults || {}),
    ),
);
const ALLOWED_BACKGROUND_BLEND_MODES = new Set([
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
]);
const SAFE_ANIMATED_BACKGROUND_NAMES = new Set(
    ANIM_BG_CLASSES.map((className) => className.replace(/^bg-anim-/, "")),
);

function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function extractScheme(value) {
    const match = trimString(value).match(/^([a-z][a-z0-9+.-]*:)/i);
    return match ? match[1].toLowerCase() : "";
}

function cssSupports(property, value) {
    return (
        typeof value === "string" &&
        !!value &&
        typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports(property, value)
    );
}

export function containsUnsafeCssUrl(value) {
    // Normalize CSS escapes and comments before rejecting resource functions.
    const normalized = value.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n\r\f])/gi,
        (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : char)
        .replace(/\/\*[\s\S]*?\*\//g, "");
    return /(?:url|(?:-webkit-)?image-set|image|src)\s*\(|expression|javascript:|@import/i.test(normalized);
}

function sanitizeStringMap(
    rawMap,
    { keyPattern = null, allowedKeys = null, valuePredicate = null } = {},
) {
    if (!isPlainObject(rawMap)) return {};

    const next = {};
    Object.entries(rawMap).forEach(([key, value]) => {
        if (DISALLOWED_JSON_KEYS.has(key)) return;
        if (allowedKeys && !allowedKeys.has(key)) return;
        if (keyPattern && !keyPattern.test(key)) return;
        if (typeof value !== "string") return;
        if (valuePredicate && !valuePredicate(value, key)) return;
        next[key] = value;
    });
    return next;
}

function sanitizeJsonValue(value, depth = 0) {
    if (depth > 8) return undefined;
    if (value === null) return null;
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => sanitizeJsonValue(entry, depth + 1))
            .filter((entry) => entry !== undefined);
    }
    if (!isPlainObject(value)) return undefined;

    const next = {};
    Object.entries(value).forEach(([key, entry]) => {
        if (DISALLOWED_JSON_KEYS.has(key)) return;
        const sanitized = sanitizeJsonValue(entry, depth + 1);
        if (sanitized !== undefined) next[key] = sanitized;
    });
    return next;
}

export function sanitizeLinkUrl(rawValue) {
    const normalized = normalizeLinkUrl(rawValue);
    if (!normalized) return "";

    const scheme = extractScheme(normalized);
    if (!scheme || !SAFE_LINK_PROTOCOLS.has(scheme)) return "";
    return normalized;
}

// Matches schemeless URLs like "example.com", "mail.google.com/inbox" or
// "example.com:8080/path" — a dotted hostname with optional port/path.
// Never matches strings with spaces (search terms) or explicit schemes.
const BARE_DOMAIN_RE =
    /^(?!([a-z][a-z0-9+.-]*:|javascript:|data:|blob:))([\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i;

/**
 * Normalize user-typed URLs: "example.com" -> "https://example.com".
 * Returns the trimmed input unchanged when it already has a scheme or
 * doesn't look like a bare domain. Safe to run before sanitizeLinkUrl —
 * the result is still scheme-validated downstream.
 */
export function normalizeLinkUrl(rawValue) {
    const value = trimString(rawValue);
    if (!value) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    if (BARE_DOMAIN_RE.test(value)) return `https://${value}`;
    return value;
}

export function sanitizeLauncherAppTarget(rawValue) {
    const value = trimString(rawValue);
    if (!value) return "";

    const scheme = extractScheme(value);
    if (!scheme || BLOCKED_OPEN_PROTOCOLS.has(scheme)) return "";
    return value;
}

export function sanitizeLinkTarget(rawValue) {
    const value = trimString(rawValue);
    return SAFE_TARGET_VALUES.has(value) ? value : "";
}

/**
 * Derive a human-readable title from a URL's hostname.
 * Example: gemini.google.com -> "Google Gemini", mail.google.com ->
 * "Google Mail", example.com -> "Example". Returns "" for invalid URLs.
 */
export function getNameFromUrl(url) {
    try {
        // Accept bare domains ("example.com") as well as full URLs.
        const normalized = normalizeLinkUrl(url);
        if (!normalized) return "";
        const hostname = new URL(normalized).hostname;
        const parts = hostname.replace(/^www\./, "").split(".");
        let name = "";

        if (parts.length >= 2) {
            // Example: gemini.google.com -> Google Gemini
            // Example: mail.google.com -> Google Mail
            const domain = parts[parts.length - 2];
            const subdomain = parts[0];

            if (parts.length > 2 && subdomain !== "www") {
                // Check for actual subdomain
                name = `${domain.charAt(0).toUpperCase() + domain.slice(1)} ${subdomain.charAt(0).toUpperCase() + subdomain.slice(1)}`;
            } else {
                // No significant subdomain or just www
                name = domain.charAt(0).toUpperCase() + domain.slice(1);
            }
        } else {
            // Fallback for simple domains like example.com
            name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
        return name;
    } catch (e) {
        return ""; // Return empty for invalid URLs
    }
}

export function sanitizeImageSource(rawValue) {
    const value = trimString(rawValue);
    if (!value) return "";

    const lower = value.toLowerCase();
    if (
        lower.startsWith("https://") ||
        lower.startsWith("http://") ||
        lower.startsWith("data:image/") ||
        lower.startsWith("blob:")
    ) {
        return value;
    }
    return "";
}

export function escapeCssUrl(rawValue) {
    return String(rawValue)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/[\n\r\f]/g, "");
}

function sanitizeUntrustedBackgroundCssValue(rawValue, property) {
    const value = trimString(rawValue);
    if (!value || containsUnsafeCssUrl(value)) return "";
    return cssSupports(property, value) ? value : "";
}

export function sanitizeUntrustedBackgroundDescriptor(rawBackground) {
    if (!isPlainObject(rawBackground)) return null;

    const type = rawBackground.type === "image" ? "image" : "color";
    const value =
        typeof rawBackground.value === "string" ? rawBackground.value : "";

    if (type === "image") {
        const safeImage = sanitizeImageSource(value);
        return safeImage ? { type: "image", value: safeImage } : null;
    }

    const trimmedValue = trimString(value);
    if (!trimmedValue) return null;

    if (trimmedValue.startsWith("__animated__:")) {
        const animName = trimmedValue.replace("__animated__:", "").trim();
        return SAFE_ANIMATED_BACKGROUND_NAMES.has(animName)
            ? { type: "color", value: `__animated__:${animName}` }
            : null;
    }

    if (trimmedValue.startsWith("__scene__:")) {
        // Re-serialise from the parsed parts so only a known scene id, a hex
        // tint and a known variant can ever reach storage.
        const scene = parseSceneValue(trimmedValue);
        return scene
            ? { type: "color", value: formatSceneValue(scene) }
            : null;
    }

    if (trimmedValue.startsWith("__advanced__:")) {
        try {
            const parsed = JSON.parse(
                trimmedValue.replace("__advanced__:", ""),
            );
            if (!isPlainObject(parsed)) return null;

            const backgroundImage = sanitizeUntrustedBackgroundCssValue(
                parsed.backgroundImage,
                "background-image",
            );
            if (!backgroundImage) return null;

            const next = {
                backgroundImage,
            };

            const blendMode = trimString(
                parsed.backgroundBlendMode,
            ).toLowerCase();
            if (blendMode && ALLOWED_BACKGROUND_BLEND_MODES.has(blendMode)) {
                next.backgroundBlendMode = blendMode;
            }

            const filter = sanitizeUntrustedBackgroundCssValue(
                parsed.filter,
                "filter",
            );
            if (filter) next.filter = filter;

            const backgroundColor = sanitizeUntrustedBackgroundCssValue(
                parsed.backgroundColor,
                "background-color",
            );
            if (backgroundColor) next.backgroundColor = backgroundColor;

            const maskImage = sanitizeUntrustedBackgroundCssValue(
                parsed.maskImage,
                "mask-image",
            );
            if (maskImage) next.maskImage = maskImage;

            return {
                type: "color",
                value: `__advanced__:${JSON.stringify(next)}`,
            };
        } catch {
            return null;
        }
    }

    if (
        trimmedValue.startsWith("__solid__:") ||
        trimmedValue.startsWith("__css__:")
    ) {
        const prefix = trimmedValue.startsWith("__solid__:")
            ? "__solid__:"
            : "__css__:";
        const cssValue = sanitizeUntrustedBackgroundCssValue(
            trimmedValue.slice(prefix.length),
            "background",
        );
        return cssValue
            ? { type: "color", value: `${prefix}${cssValue}` }
            : null;
    }

    const plainValue = sanitizeUntrustedBackgroundCssValue(
        trimmedValue,
        "background-image",
    );
    return plainValue ? { type: "color", value: plainValue } : null;
}

// Saved themes persist background as { type, color, image } (see theme-editor
// persistence.js and named-theme-actions.js), but the descriptor sanitizer
// above speaks the workspace-bg { type, value } shape. Bridge the two so a
// valid theme background survives sanitization on load instead of being nulled
// (which then got persisted, permanently destroying every saved theme's
// background).
export function sanitizeThemeBackgroundDescriptor(rawBackground) {
    if (!isPlainObject(rawBackground)) return null;
    const type = rawBackground.type === "image" ? "image" : "color";
    const rawValue =
        type === "image" ? rawBackground.image : rawBackground.color;
    const value = typeof rawValue === "string" ? rawValue : "";
    const sanitized = sanitizeUntrustedBackgroundDescriptor({ type, value });
    if (!sanitized) return null;
    return sanitized.type === "image"
        ? { type: "image", color: "", image: sanitized.value }
        : { type: "color", color: sanitized.value, image: null };
}

export function sanitizeManagedThemeClass(rawThemeClass) {
    const themeClass = trimString(rawThemeClass);
    return KNOWN_MANAGED_THEME_CLASSES.has(themeClass) ? themeClass : "";
}

export function sanitizeManagedBoardBranding(rawBranding) {
    if (!isPlainObject(rawBranding)) return null;

    const logo = sanitizeImageSource(rawBranding.logo);
    const theme = sanitizeManagedThemeClass(rawBranding.theme);
    const background = sanitizeUntrustedBackgroundDescriptor(
        rawBranding.background,
    );

    const next = {};
    if (logo) next.logo = logo;
    if (theme) next.theme = theme;
    if (background) next.background = background;

    return Object.keys(next).length ? next : null;
}

export function sanitizeWorkspaceItem(rawItem) {
    if (!isPlainObject(rawItem)) return null;

    const item = sanitizeJsonValue(rawItem);
    const type = ALLOWED_ITEM_TYPES.has(item.type) ? item.type : "link";
    item.type = type;

    if (typeof item.url === "string") {
        item.url = sanitizeLinkUrl(item.url);
    }

    if (typeof item.targetOverride === "string") {
        const safeTarget = sanitizeLinkTarget(item.targetOverride);
        if (safeTarget) item.targetOverride = safeTarget;
        else delete item.targetOverride;
    }

    if (typeof item.style !== "undefined") {
        const style = sanitizeStringMap(item.style, {
            keyPattern: /^--[a-z0-9-]+$/i,
            // Reject url()/expression()/etc. in the value — an attacker-set
            // custom property like `--card-bg: url(https://tracker/x.png)`
            // would otherwise fetch for every board viewer (deanonymization).
            valuePredicate: (value) => !containsUnsafeCssUrl(value),
        });
        if (Object.keys(style).length) item.style = style;
        else delete item.style;
    }

    if (type === "launcher") {
        item.launcherKind = ALLOWED_LAUNCHER_KINDS.has(item.launcherKind)
            ? item.launcherKind
            : "app";

        if (typeof item.target === "string") {
            if (item.launcherKind === "app") {
                item.target = sanitizeLauncherAppTarget(item.target);
            }
        }

        if (item.launcherKind === "powershell") {
            item.visible = !!item.visible;
        } else {
            delete item.visible;
        }
    } else {
        delete item.launcherKind;
        delete item.target;
        delete item.visible;
    }

    if (type === "todo") {
        item.done = !!item.done;
    } else {
        delete item.done;
    }

    if (type === "header") {
        item.align = ALLOWED_HEADER_ALIGN.has(item.align)
            ? item.align
            : "center";
        item.separator = item.separator !== false;
    } else {
        delete item.align;
        delete item.separator;
    }

    if (type === "note" || type === "text") {
        item.textStyle = ALLOWED_TEXT_STYLES.has(item.textStyle)
            ? item.textStyle
            : "normal";
    } else {
        delete item.textStyle;
    }

    if (type !== "clipboard") {
        delete item.content;
    }

    if (type === "routine") {
        item.steps = sanitizeRoutineSteps(item.steps);
        item.stagger = sanitizeRoutineStagger(item.stagger);
    } else {
        delete item.steps;
        delete item.stagger;
    }

    return item;
}

// Validate a routine's steps[] array: drop steps with unknown kinds and
// sanitize the user-supplied target of each kind.
function sanitizeRoutineSteps(rawSteps) {
    if (!Array.isArray(rawSteps)) return [];
    const out = [];
    for (const raw of rawSteps) {
        if (!isPlainObject(raw)) continue;
        if (!ALLOWED_ROUTINE_STEP_KINDS.has(raw.kind)) continue;
        const step = { kind: raw.kind };
        if (typeof raw.label === "string") step.label = raw.label.slice(0, 200);
        if (raw.kind === "url") {
            const safe = sanitizeLinkUrl(raw.url);
            if (!safe) continue;
            step.url = safe;
        } else if (raw.kind === "app") {
            const safe = sanitizeLauncherAppTarget(raw.target);
            if (!safe) continue;
            step.target = safe;
        } else if (raw.kind === "file" || raw.kind === "folder") {
            // File/folder paths are opaque local strings (like launcher
            // folder/file targets); keep as a bounded string.
            if (typeof raw.target !== "string" || !raw.target) continue;
            step.target = raw.target.slice(0, 1000);
        } else if (raw.kind === "clipboard") {
            step.content = typeof raw.content === "string" ? raw.content : "";
        } else if (raw.kind === "workspace") {
            if (typeof raw.workspaceId !== "string" || !raw.workspaceId)
                continue;
            step.workspaceId = raw.workspaceId.slice(0, 100);
        } else if (raw.kind === "delay") {
            const ms = Number(raw.ms);
            if (!Number.isFinite(ms) || ms <= 0) continue;
            step.ms = Math.min(Math.round(ms), 600000);
        }
        out.push(step);
    }
    return out;
}

function sanitizeRoutineStagger(rawStagger) {
    const ms = Number(rawStagger);
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.min(Math.round(ms), 60000);
}

function sanitizeWorkspaceGroup(rawGroup) {
    if (!isPlainObject(rawGroup)) return null;

    const group = sanitizeJsonValue(rawGroup);
    const widgetType = ALLOWED_WORKSPACE_WIDGET_TYPES.has(group.type)
        ? group.type
        : "";

    if (widgetType) group.type = widgetType;
    else delete group.type;

    // Zone placement for action buttons (top bar vs board). Only "main" is
    // meaningful; "top" is the default so we drop it to keep data lean.
    if (group.zone === "main") group.zone = "main";
    else delete group.zone;

    // Shortcut display variants: "tile"/"tile2" (square icon cards, 1 and 2
    // columns wide) are the only non-default values — and only on top-level
    // action widgets. On any other entry (plain group, section block) the
    // field is meaningless; without the type guard a crafted payload could
    // carry a square display on a group and the w-pin below would crush it
    // to one column. Retired values land here too and lazily migrate on
    // contact: legacy "cta" (full-width banner) strips to a standard
    // shortcut, and the bare-favicon "icon" variant becomes a 1×1 "tile"
    // (same cell, label state kept) — favicons assume browser chrome behind
    // them and were unreadable on arbitrary wallpapers; the tile's chip
    // guarantees contrast.
    const isActionWidget = widgetType.endsWith("-button");
    if (isActionWidget && group.display === "icon") {
        group.display = "tile";
    }
    if (
        !isActionWidget ||
        (group.display !== "tile" && group.display !== "tile2")
    ) {
        delete group.display;
    }
    // labelHidden is retired (2026-07): the 1×1 tile never shows a caption —
    // at one column wide the text was unreadable, so the field lost its last
    // consumer (the name lives in the tooltip). Strip it on contact.
    delete group.labelHidden;
    // Fixed-square shortcuts: pin only the column SPAN (width-independent).
    // The cell HEIGHT is derived from the live column width at render
    // (grid-renderer's tileCellRows) and serialized as-is, so we must NOT
    // force a canonical h here — doing so made stored y/h disagree and broke
    // tile stacking on reload. A missing h just falls back to the render.
    if (group.display === "tile") {
        group.w = 1;
    } else if (group.display === "tile2") {
        group.w = 2;
    }

    if (typeof group.style !== "undefined") {
        const style = sanitizeStringMap(group.style, {
            keyPattern: /^--[a-z0-9-]+$/i,
            // See item.style above — block url()-based viewer tracking.
            valuePredicate: (value) => !containsUnsafeCssUrl(value),
        });
        if (Object.keys(style).length) group.style = style;
        else delete group.style;
    }

    if (typeof group.targetOverride === "string") {
        const safeTarget = sanitizeLinkTarget(group.targetOverride);
        if (safeTarget) group.targetOverride = safeTarget;
        else delete group.targetOverride;
    }

    if (widgetType === "link-button") {
        if (typeof group.url === "string") {
            group.url = sanitizeLinkUrl(group.url);
        }
        delete group.content;
        delete group.launcherKind;
        delete group.target;
        delete group.visible;
        delete group.items;
    } else if (widgetType === "clipboard-button") {
        if (typeof group.content !== "string") group.content = "";
        delete group.url;
        delete group.launcherKind;
        delete group.target;
        delete group.visible;
        delete group.items;
    } else if (widgetType === "launcher-button") {
        group.launcherKind = ALLOWED_LAUNCHER_KINDS.has(group.launcherKind)
            ? group.launcherKind
            : "app";
        if (typeof group.target === "string") {
            if (group.launcherKind === "app") {
                group.target = sanitizeLauncherAppTarget(group.target);
            }
        } else {
            group.target = "";
        }
        if (group.launcherKind === "powershell") {
            group.visible = !!group.visible;
        } else {
            delete group.visible;
        }
        delete group.url;
        delete group.content;
        delete group.items;
    } else if (widgetType === "routine-button") {
        group.steps = sanitizeRoutineSteps(group.steps);
        group.stagger = sanitizeRoutineStagger(group.stagger);
        delete group.url;
        delete group.content;
        delete group.items;
        delete group.launcherKind;
        delete group.target;
        delete group.visible;
    } else if (
        widgetType === "section-header" ||
        widgetType === "section-stepheader" ||
        widgetType === "section-text" ||
        widgetType === "section-divider" ||
        widgetType === "section-arrow" ||
        widgetType === "section-callout" ||
        widgetType === "section-code" ||
        widgetType === "section-steps" ||
        widgetType === "section-image" ||
        widgetType === "section-profile" ||
        widgetType === "section-linkcard" ||
        widgetType === "section-file"
    ) {
        // Section elements: preserve text/content/level/align/surface/variant/thickness.
        if (!ALLOWED_HEADER_ALIGN.has(group.align)) delete group.align;
        group.surface = group.surface === "panel" ? "panel" : undefined;
        if (typeof group.surface === "undefined") delete group.surface;

        if (widgetType === "section-header") {
            group.text = typeof group.text === "string" ? group.text : "";
            group.level = ALLOWED_SECTION_LEVELS.has(group.level)
                ? group.level
                : "h2";
            delete group.content;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-stepheader") {
            group.text = typeof group.text === "string" ? group.text : "";
            const n = parseInt(group.number, 10);
            group.number = Number.isFinite(n)
                ? Math.max(0, Math.min(999, n))
                : 1;
            delete group.content;
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-arrow") {
            group.direction = ALLOWED_ARROW_DIRS.has(group.direction)
                ? group.direction
                : "down";
            delete group.text;
            delete group.content;
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (
            widgetType === "section-text" ||
            widgetType === "section-code" ||
            widgetType === "section-steps"
        ) {
            group.content =
                typeof group.content === "string" ? group.content : "";
            delete group.text;
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-callout") {
            group.content =
                typeof group.content === "string" ? group.content : "";
            group.variant = ALLOWED_CALLOUT_VARIANTS.has(group.variant)
                ? group.variant
                : "info";
            delete group.text;
            delete group.level;
            delete group.thickness;
        } else if (widgetType === "section-image") {
            group.src = sanitizeHttpImageUrl(group.src);
            if (!group.src) delete group.src;
            group.fit = group.fit === "contain" ? "contain" : "cover";
            delete group.text;
            delete group.content;
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-profile") {
            if (
                typeof group.avatar === "string" &&
                (PRESET_AVATAR_RE.test(group.avatar) ||
                    sanitizeHttpImageUrl(group.avatar))
            ) {
                group.avatar = PRESET_AVATAR_RE.test(group.avatar)
                    ? group.avatar
                    : sanitizeHttpImageUrl(group.avatar);
            } else {
                group.avatar = "preset:a1";
            }
            group.text = typeof group.text === "string" ? group.text : "";
            group.content =
                typeof group.content === "string" ? group.content : "";
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-linkcard") {
            group.src = sanitizeHttpImageUrl(group.src);
            if (!group.src) delete group.src;
            group.url = sanitizeHttpImageUrl(group.url);
            if (!group.url) delete group.url;
            group.text = typeof group.text === "string" ? group.text : "";
            group.content =
                typeof group.content === "string" ? group.content : "";
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else if (widgetType === "section-file") {
            group.url = sanitizeHttpImageUrl(group.url);
            if (!group.url) delete group.url;
            group.text = typeof group.text === "string" ? group.text : "";
            group.filekind = ALLOWED_FILE_KINDS.has(group.filekind)
                ? group.filekind
                : "generic";
            delete group.content;
            delete group.level;
            delete group.variant;
            delete group.thickness;
        } else {
            // section-divider
            if (widgetType === "section-divider") {
                const t = parseInt(group.thickness, 10);
                if (Number.isFinite(t)) {
                    group.thickness = Math.max(1, Math.min(15, t));
                } else {
                    delete group.thickness;
                }
            } else {
                delete group.thickness;
            }
            delete group.text;
            delete group.content;
            delete group.level;
            delete group.variant;
        }
        if (widgetType !== "section-linkcard" && widgetType !== "section-file")
            delete group.url;
        delete group.launcherKind;
        delete group.target;
        delete group.visible;
        delete group.items;
    } else {
        delete group.url;
        delete group.content;
        delete group.launcherKind;
        delete group.target;
        delete group.visible;

        if ("items" in rawGroup && !Array.isArray(rawGroup.items)) group.items = [];
        if (Array.isArray(rawGroup.items)) {
            group.items = rawGroup.items
                .map((item) => sanitizeWorkspaceItem(item))
                .filter(Boolean);
        }

        if (isPlainObject(rawGroup.content)) {
            const content = sanitizeJsonValue(rawGroup.content);
            if ("items" in rawGroup.content && !Array.isArray(rawGroup.content.items)) content.items = [];
            if (Array.isArray(rawGroup.content.items)) {
                content.items = rawGroup.content.items
                    .map((item) => sanitizeWorkspaceItem(item))
                    .filter(Boolean);
            }
            if (Object.keys(content).length) {
                group.content = content;
            }
        }
    }

    return group;
}

export function sanitizeWorkspaceGroups(rawGroups) {
    if (!Array.isArray(rawGroups)) return [];
    return rawGroups
        .map((group) => sanitizeWorkspaceGroup(group))
        .filter(Boolean);
}

// WI-5: a protected workspace's plaintext entry is a sentinel, never content
// (the encrypted `workspace_protected_*` blob is the persistent truth).
// Structural check (no import — this module is shared with the reader).
export function isProtectedWorkspaceSentinel(value) {
    return (
        isPlainObject(value) &&
        value.__protected__ === true
    );
}

export function sanitizeWorkspaceMap(rawWorkspaces) {
    if (!isPlainObject(rawWorkspaces)) return {};

    const next = {};
    Object.entries(rawWorkspaces).forEach(([workspaceId, groups]) => {
        if (DISALLOWED_JSON_KEYS.has(workspaceId)) return;
        // The sentinel is normalized (only its marker survives), not run
        // through the group sanitizer — it has no groups.
        if (isProtectedWorkspaceSentinel(groups)) {
            next[workspaceId] = { __protected__: true };
            return;
        }
        next[workspaceId] = sanitizeWorkspaceGroups(groups);
    });
    return next;
}

// Payloads from the 12-column era (no gridColumns stamp) get their top-level
// x/w doubled into GRID_COLS space. Stamping the output keeps this idempotent:
// managed-board subscription records round-trip through their sanitizer on
// every read and save, so an unstamped output would double again each pass.
function sanitizePayloadGroupsToGridCols(rawPayload) {
    const groups = sanitizeWorkspaceGroups(rawPayload.groups);
    return rawPayload.gridColumns === GRID_COLS
        ? groups
        : doubleBoardColumns(groups);
}

export function sanitizeSharedWorkspacePayload(rawPayload) {
    if (!isPlainObject(rawPayload)) {
        return { name: "Imported", groups: [], gridColumns: GRID_COLS };
    }
    return {
        name: trimString(rawPayload.name) || "Imported",
        groups: sanitizePayloadGroupsToGridCols(rawPayload),
        gridColumns: GRID_COLS,
    };
}

export function sanitizeManagedBoardPayload(rawPayload) {
    if (!isPlainObject(rawPayload)) {
        return { groups: [], branding: null, gridColumns: GRID_COLS };
    }

    return {
        groups: sanitizePayloadGroupsToGridCols(rawPayload),
        branding: sanitizeManagedBoardBranding(rawPayload.branding),
        gridColumns: GRID_COLS,
    };
}

function sanitizeThemeVars(rawVars) {
    return sanitizeStringMap(rawVars, {
        allowedKeys: KNOWN_THEME_VAR_NAMES,
        valuePredicate: (value) => !containsUnsafeCssUrl(value),
    });
}

function sanitizeImportedThemeEntry(
    rawTheme,
    index,
    { allowCustomCss = true } = {},
) {
    if (!isPlainObject(rawTheme)) return null;

    const baseTheme = KNOWN_THEME_NAMES.has(rawTheme.baseTheme)
        ? rawTheme.baseTheme
        : "simple";

    return {
        ...sanitizeJsonValue(rawTheme),
        id:
            typeof rawTheme.id === "string" && rawTheme.id.trim()
                ? rawTheme.id
                : `imported-theme-${Date.now()}-${index}`,
        name:
            typeof rawTheme.name === "string" && rawTheme.name.trim()
                ? rawTheme.name.trim()
                : `Imported Theme ${index + 1}`,
        baseTheme,
        themeOverrides: sanitizeThemeVars(
            rawTheme.themeOverrides || rawTheme.proVars,
        ),
        background: sanitizeThemeBackgroundDescriptor(rawTheme.background),
        customCss:
            allowCustomCss && typeof rawTheme.customCss === "string"
                ? rawTheme.customCss
                : "",
    };
}

export function sanitizeImportedThemes(rawThemes, options = {}) {
    if (!Array.isArray(rawThemes)) return [];
    return rawThemes
        .map((theme, index) =>
            sanitizeImportedThemeEntry(theme, index, options),
        )
        .filter(Boolean);
}
