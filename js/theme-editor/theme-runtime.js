import {
    ALL_THEME_CLASSES,
    THEME_CLASSES,
    THEME_DEFAULTS,
} from "./constants.js";
import {
    getActiveNamedThemeId,
    getCurrentCustomCss,
    getEphemeralOverrides,
    getActiveEditorTheme,
    setActiveNamedThemeId,
    setCurrentCustomCss,
    setEphemeralOverrides,
    setActiveEditorTheme,
} from "./state.js";

export function applyVar(name, value) {
    document.body.style.setProperty(name, value);
}

export function removeVar(name) {
    document.body.style.removeProperty(name);
}

export function applyCustomCss(css) {
    let style = document.getElementById("theme-custom-css");
    if (!style) {
        style = document.createElement("style");
        style.id = "theme-custom-css";
        document.head.appendChild(style);
    }
    style.textContent = css || "";
}

export function clearAllThemeEditorVars(theme) {
    Object.keys(THEME_DEFAULTS[theme] || THEME_DEFAULTS.simple).forEach(
        (varName) => removeVar(varName),
    );
}

export function applyBodyTheme(theme) {
    document.body.classList.remove(...ALL_THEME_CLASSES);
    (THEME_CLASSES[theme] || []).forEach((className) =>
        document.body.classList.add(className),
    );
}

export function getCurrentThemeName() {
    const body = document.body;
    if (body.classList.contains("ui-sakura")) return "sakura";
    if (body.classList.contains("ui-frost")) return "frost";
    if (body.classList.contains("ui-aurora-glass")) return "aurora-glass";
    if (body.classList.contains("ui-ocean")) return "ocean";
    if (body.classList.contains("ui-nordic")) return "nordic";
    if (body.classList.contains("ui-luxury")) return "luxury";
    if (body.classList.contains("ui-midnight")) return "midnight";
    if (body.classList.contains("ui-dark")) return "dark";
    if (body.classList.contains("ui-light")) return "light";
    if (body.classList.contains("ui-professional")) return "professional";
    if (body.classList.contains("ui-pastel-sunset")) return "pastel-sunset";
    if (body.classList.contains("ui-lavender-sky")) return "lavender-sky";
    return "simple";
}

export function applyThemeOverrides(theme) {
    setActiveEditorTheme(theme);
    clearAllThemeEditorVars(theme);

    const themeOverrides = getEphemeralOverrides();
    Object.entries(themeOverrides).forEach(([varName, value]) =>
        applyVar(varName, value),
    );

    const customCss = getCurrentCustomCss();
    applyCustomCss(customCss);

    const textarea = document.getElementById("theme-custom-css-input");
    if (textarea) textarea.value = customCss;
}

export function getEffectiveValue(varName) {
    const overrides = getEphemeralOverrides();
    if (varName in overrides) return overrides[varName];
    const defaults =
        THEME_DEFAULTS[getActiveEditorTheme()] || THEME_DEFAULTS.simple;
    return defaults[varName] || "";
}

/**
 * Sets the active theme-editor state for the current workspace and applies its overrides.
 * Called on workspace switch so the correct customisation is displayed.
 */
export function applyWorkspaceThemeEditorState(
    theme,
    workspaceVisualStateOrSavedThemeId,
) {
    if (
        workspaceVisualStateOrSavedThemeId &&
        typeof workspaceVisualStateOrSavedThemeId === "object" &&
        !Array.isArray(workspaceVisualStateOrSavedThemeId)
    ) {
        const visualState = workspaceVisualStateOrSavedThemeId;

        setActiveNamedThemeId(
            visualState.savedThemeId ?? visualState.proThemeId ?? null,
        );
        setEphemeralOverrides(visualState.themeOverrides || {});
        setCurrentCustomCss(visualState.customCss || "");
        applyThemeOverrides(theme);
        return;
    }

    setActiveNamedThemeId(workspaceVisualStateOrSavedThemeId ?? null);
    setEphemeralOverrides({});
    setCurrentCustomCss("");
    applyThemeOverrides(theme);
}
