let savedNamedThemes = [];
let activeNamedThemeId = null;
let ephemeralOverrides = {};
let activeEditorTheme = "simple";
let currentCustomCss = "";

export const getSavedNamedThemes = () => savedNamedThemes;
export const setSavedNamedThemes = (themes) => {
    savedNamedThemes = Array.isArray(themes) ? themes : [];
};

export const getActiveNamedThemeId = () => activeNamedThemeId;
export const setActiveNamedThemeId = (id) => {
    activeNamedThemeId = id ?? null;
};

export const getEphemeralOverrides = () => ephemeralOverrides;
export const setEphemeralOverrides = (overrides) => {
    ephemeralOverrides = { ...(overrides || {}) };
};
export const setEphemeralOverride = (key, value) => {
    ephemeralOverrides[key] = value;
};
export const deleteEphemeralOverride = (key) => {
    delete ephemeralOverrides[key];
};
export const hasEphemeralOverride = (key) => key in ephemeralOverrides;

export const getActiveEditorTheme = () => activeEditorTheme;
export const setActiveEditorTheme = (theme) => {
    activeEditorTheme = theme || "simple";
};

export const getCurrentCustomCss = () => currentCustomCss;
export const setCurrentCustomCss = (css) => {
    currentCustomCss = css || "";
};
