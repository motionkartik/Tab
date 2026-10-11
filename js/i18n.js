// i18n.js — lightweight runtime internationalization layer for the web build.
//
// Provides:
//   1. t(key, subs)         — translate a string (used by JS renderers)
//   2. applyI18nToDom(root) — translate static HTML via data-i18n* attributes
//   3. an in-app language override (Settings → General) that fetches catalogs
//      directly so the user can pick a language regardless of browser locale.
//
// Catalogs use the `locales/<code>/messages.json` files (same shape as the
// extension's `_locales/` catalogs).
//
// Supported UI locales. `code` matches the locales/<code> directory name
// (Chrome uses underscores, e.g. pt_BR / zh_CN). `label` is the native name
// shown in the language switcher.
export const SUPPORTED_LOCALES = [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "pt_BR", label: "Português (Brasil)" },
    { code: "ru", label: "Русский" },
    { code: "it", label: "Italiano" },
    { code: "ja", label: "日本語" },
    { code: "zh_CN", label: "简体中文" },
    { code: "ko", label: "한국어" },
];

const DEFAULT_LOCALE = "en";
export const LANGUAGE_STORAGE_KEY = "general_language"; // "auto" | <code>

const SUPPORTED_CODES = new Set(SUPPORTED_LOCALES.map((l) => l.code));

// Loaded message dictionaries: { [key]: { message, placeholders? } }
let baseMessages = {}; // English fallback, always loaded
let activeMessages = {}; // selected locale (may equal baseMessages)
let activeLocale = DEFAULT_LOCALE;

/** The locale currently applied to the UI (e.g. "de", "pt_BR"). */
export function getActiveLocale() {
    return activeLocale;
}

// --- storage helpers ---------------------------------------------------------

function getStored(key) {
    return Promise.resolve().then(() => {
        try {
            return localStorage.getItem(key) ?? undefined;
        } catch {
            return undefined;
        }
    });
}

// --- locale resolution -------------------------------------------------------

// Map a preference + browser locale to one of our supported codes.
export function resolveLocale(pref) {
    if (pref && pref !== "auto" && SUPPORTED_CODES.has(pref)) return pref;

    let ui = DEFAULT_LOCALE;
    try {
        ui =
            (typeof navigator !== "undefined" &&
                (navigator.language || navigator.userLanguage)) ||
            DEFAULT_LOCALE;
    } catch {
        /* no navigator */
    }
    const norm = ui.replace(/-/g, "_"); // "pt-BR" -> "pt_BR"

    // Exact region match first (pt_BR, zh_CN), then primary-subtag match (de-DE -> de).
    if (SUPPORTED_CODES.has(norm)) return norm;
    const primary = norm.split("_")[0];
    for (const { code } of SUPPORTED_LOCALES) {
        if (code === primary || code.split("_")[0] === primary) return code;
    }
    return DEFAULT_LOCALE;
}

// BCP-47 tag for the <html lang> attribute.
function htmlLang(code) {
    return code.replace(/_/g, "-");
}

// --- catalog loading ---------------------------------------------------------

function catalogUrl(code) {
    // Relative to this module (js/i18n.js -> ../locales/...), so the app
    // works from any base path on static hosting.
    try {
        return new URL(`../locales/${code}/messages.json`, import.meta.url).toString();
    } catch {
        return `locales/${code}/messages.json`;
    }
}

async function loadCatalog(code) {
    try {
        const res = await fetch(catalogUrl(code));
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn(`[i18n] failed to load catalog "${code}":`, err);
        return null;
    }
}

// Synchronous catalog load. Needed so catalogs are ready DURING module
// evaluation (see the bootstrap at the bottom of this file), which is the only
// way module-level t() calls in other files — constant label tables built at
// import time — resolve to real translations instead of raw keys.
function loadCatalogSync(code) {
    try {
        const url = catalogUrl(code);
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false); // sync on purpose (runs once, at startup)
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
            return JSON.parse(xhr.responseText);
        }
    } catch (err) {
        console.warn(`[i18n] sync catalog load failed "${code}":`, err);
    }
    return null;
}

// The language preference lives in localStorage, which is synchronous and
// can be read during module evaluation.
function readPrefSync() {
    try {
        return localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
        return null;
    }
}

// --- translation -------------------------------------------------------------

// Resolve Chrome-style placeholders and $1..$9 substitutions.
function applySubs(entry, subs) {
    let msg = entry.message;
    if (!msg) return "";

    // Named placeholders: { name: { content: "$1" } } referenced as $name$.
    if (entry.placeholders) {
        for (const [name, def] of Object.entries(entry.placeholders)) {
            if (def && typeof def.content === "string") {
                msg = msg.replace(
                    new RegExp(`\\$${name}\\$`, "gi"),
                    def.content,
                );
            }
        }
    }

    // Positional substitutions ($1, $2, ...).
    if (subs != null) {
        const arr = Array.isArray(subs) ? subs : [subs];
        msg = msg.replace(/\$(\d)/g, (m, d) => {
            const i = Number(d) - 1;
            return i >= 0 && i < arr.length ? String(arr[i]) : m;
        });
    }
    return msg;
}

/**
 * Translate a message key. Falls back to the English catalog, then to the key
 * itself so nothing ever renders blank.
 * @param {string} key
 * @param {string|string[]} [subs] positional substitutions for $1..$9
 */
export function t(key, subs) {
    const entry = activeMessages[key] || baseMessages[key];
    if (!entry) return key;
    return applySubs(entry, subs);
}

// --- DOM application ---------------------------------------------------------

const ATTR_TARGETS = {
    "data-i18n-placeholder": "placeholder",
    "data-i18n-title": "title",
    "data-i18n-aria-label": "aria-label",
};

/**
 * Translate every element under `root` carrying an i18n attribute:
 *   data-i18n              → textContent
 *   data-i18n-html         → innerHTML (trusted catalog strings only)
 *   data-i18n-placeholder  → placeholder attribute
 *   data-i18n-title        → title attribute
 *   data-i18n-aria-label   → aria-label attribute
 */
export function applyI18nToDom(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") return;

    root.querySelectorAll("[data-i18n]").forEach((el) => {
        const v = t(el.getAttribute("data-i18n"));
        if (v) el.textContent = v;
    });

    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
        const v = t(el.getAttribute("data-i18n-html"));
        if (v) el.innerHTML = v;
    });

    for (const [dataAttr, attr] of Object.entries(ATTR_TARGETS)) {
        root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
            const v = t(el.getAttribute(dataAttr));
            if (v) el.setAttribute(attr, v);
        });
    }
}

// --- initialization & switcher ----------------------------------------------

/**
 * Load catalogs for the active locale and translate the current document.
 * Must run early in bootstrap, before other UI initializes.
 */
export async function initI18n() {
    // Catalogs are normally loaded synchronously at module load (bootstrap at
    // the bottom of this file). Fall back to async loading only if that failed.
    if (!Object.keys(baseMessages).length) {
        activeLocale = resolveLocale(readPrefSync());
        baseMessages = (await loadCatalog(DEFAULT_LOCALE)) || {};
        activeMessages =
            activeLocale === DEFAULT_LOCALE
                ? baseMessages
                : (await loadCatalog(activeLocale)) || baseMessages;
    }

    // One-time migration: very old installs stored the language only under
    // a legacy key — nothing to do in the web build, localStorage is canonical.
    try {
        document.documentElement.lang = htmlLang(activeLocale);
    } catch {
        /* no document (tests) */
    }

    applyI18nToDom(document);
}

// Persist a language choice and reload so every rendered string (including
// JS-injected ones) picks up the new locale cleanly.
export function setLanguage(code) {
    const value = code && SUPPORTED_CODES.has(code) ? code : "auto";
    // Persist synchronously so the bootstrap on next load picks it up.
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    } catch {
        /* ignore */
    }
    location.reload();
}

/**
 * Populate and wire the Settings → General language dropdown.
 * The select is expected to have id="language-select".
 */
export async function initLanguageSelector() {
    const select = document.getElementById("language-select");
    if (!select) return;

    const pref = readPrefSync() ?? (await getStored(LANGUAGE_STORAGE_KEY));

    // Build options: Auto (browser) + every supported locale.
    select.innerHTML = "";
    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = t("language_auto") || "Auto (browser)";
    select.appendChild(autoOpt);
    for (const { code, label } of SUPPORTED_LOCALES) {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = label;
        select.appendChild(opt);
    }

    select.value = pref && SUPPORTED_CODES.has(pref) ? pref : "auto";
    select.addEventListener("change", () => setLanguage(select.value));
}

// --- synchronous bootstrap ---------------------------------------------------
// Runs at module evaluation. Because ES modules fully evaluate a dependency
// before any importing module's body runs, loading catalogs here guarantees
// that module-level t() calls elsewhere (constant label tables built at import
// time) resolve to real translations instead of raw message keys.
(function bootstrapI18nSync() {
    try {
        activeLocale = resolveLocale(readPrefSync());
        baseMessages = loadCatalogSync(DEFAULT_LOCALE) || {};
        activeMessages =
            activeLocale === DEFAULT_LOCALE
                ? baseMessages
                : loadCatalogSync(activeLocale) || baseMessages;
    } catch (err) {
        console.warn("[i18n] synchronous bootstrap failed:", err);
    }
})();
