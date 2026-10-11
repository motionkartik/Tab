import { t } from "../i18n.js";
import { THEME_DEFAULTS } from "./constants.js";
import { colorAlphaToValue, parseColorAlpha } from "./color-utils.js";
import { SHADOW_PRESETS } from "./shadow-presets.js";
import {
    deleteEphemeralOverride,
    getActiveNamedThemeId,
    getCurrentCustomCss,
    getEphemeralOverrides,
    getActiveEditorTheme,
    getSavedNamedThemes,
    hasEphemeralOverride,
    setEphemeralOverride,
} from "./state.js";
import {
    applyVar,
    getCurrentThemeName,
    getEffectiveValue,
    removeVar,
} from "./theme-runtime.js";
import { currentWorkspace } from "../workspaces/workspace-state.js";
import { patchAndPersistWorkspaceVisualSettings } from "../workspaces/workspace-visuals.js";

function persistWorkspaceThemeOverrides() {
    void patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        theme: getActiveEditorTheme(),
        savedThemeId: getActiveNamedThemeId(),
        themeOverrides: getEphemeralOverrides(),
    });
}

function buildColorControl({
    controls,
    currentVal,
    themeDefault,
    varName,
    dot,
    resetBtn,
    markModified,
    doReset,
}) {
    const parsed = parseColorAlpha(currentVal);
    const initHex = parsed?.hex ?? "#888888";
    const initAlpha = parsed?.alpha ?? 100;

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "theme-editor-color-input";
    picker.value = initHex;

    const alphaSlider = document.createElement("input");
    alphaSlider.type = "range";
    alphaSlider.min = 0;
    alphaSlider.max = 100;
    alphaSlider.value = initAlpha;
    alphaSlider.className = "theme-editor-alpha-slider";
    alphaSlider.title = t("c29_opacity");

    const alphaLabel = document.createElement("span");
    alphaLabel.className = "theme-editor-alpha-label";
    alphaLabel.textContent = `${initAlpha}%`;

    const onColorChange = () => {
        const alpha = parseInt(alphaSlider.value, 10);
        const value = colorAlphaToValue(picker.value, alpha);
        alphaLabel.textContent = `${alphaSlider.value}%`;
        setEphemeralOverride(varName, value);
        if (getActiveEditorTheme() === getCurrentThemeName())
            applyVar(varName, value);
        markModified();
    };

    picker.addEventListener("input", onColorChange);
    alphaSlider.addEventListener("input", onColorChange);

    resetBtn.addEventListener("click", () => {
        const parsedDefault = parseColorAlpha(themeDefault);
        picker.value = parsedDefault?.hex ?? "#888888";
        alphaSlider.value = parsedDefault?.alpha ?? 100;
        alphaLabel.textContent = `${alphaSlider.value}%`;
        doReset();
    });

    controls.append(picker, alphaSlider, alphaLabel, dot, resetBtn);
}

function buildRangeControl({
    controls,
    row,
    currentVal,
    themeDefault,
    varName,
    dot,
    resetBtn,
    markModified,
    doReset,
}) {
    const min = parseFloat(row.dataset.min ?? 0);
    const max = parseFloat(row.dataset.max ?? 100);
    const step = parseFloat(row.dataset.step ?? 1);
    const unit = row.dataset.unit ?? "";
    const numVal = parseFloat(currentVal) || min;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = numVal;

    const valueSpan = document.createElement("span");
    valueSpan.className = "theme-editor-range-value";
    valueSpan.textContent = `${numVal}${unit}`;

    slider.addEventListener("input", () => {
        const value = `${slider.value}${unit}`;
        valueSpan.textContent = value;
        setEphemeralOverride(varName, value);
        if (getActiveEditorTheme() === getCurrentThemeName())
            applyVar(varName, value);
        markModified();
    });

    resetBtn.addEventListener("click", () => {
        const nextDefault = parseFloat(themeDefault) || min;
        slider.value = nextDefault;
        valueSpan.textContent = `${nextDefault}${unit}`;
        doReset();
    });

    const wrap = document.createElement("div");
    wrap.className = "theme-editor-range-wrap";
    wrap.append(slider, valueSpan);
    controls.append(wrap, dot, resetBtn);
}

function buildSelectControl({
    controls,
    row,
    currentVal,
    themeDefault,
    varName,
    dot,
    resetBtn,
    markModified,
    doReset,
}) {
    const options = (row.dataset.options || "").split(",");
    const select = document.createElement("select");
    select.className = "theme-editor-select";

    options.forEach((opt) => {
        const trimmed = opt.trim();
        const option = document.createElement("option");
        option.value = trimmed;
        option.textContent = trimmed;
        if (currentVal === trimmed) option.selected = true;
        select.appendChild(option);
    });

    select.addEventListener("change", () => {
        setEphemeralOverride(varName, select.value);
        if (getActiveEditorTheme() === getCurrentThemeName())
            applyVar(varName, select.value);
        markModified();
    });

    resetBtn.addEventListener("click", () => {
        select.value = themeDefault;
        doReset();
    });

    controls.append(select, dot, resetBtn);
}

const THEME_DEFAULT_SHADOW = "__theme_default__";

function buildShadowControl({
    controls,
    currentVal,
    themeDefault,
    varName,
    dot,
    resetBtn,
    markModified,
    doReset,
}) {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

    const select = document.createElement("select");
    select.className = "theme-editor-select theme-editor-shadow-select";

    const preview = document.createElement("span");
    preview.className = "theme-editor-shadow-preview";
    preview.setAttribute("aria-hidden", "true");

    // "Theme default" clears the override so the theme's own shadow is used.
    const optDefault = document.createElement("option");
    optDefault.value = THEME_DEFAULT_SHADOW;
    optDefault.textContent = t("c29_theme_default_opt");
    select.appendChild(optDefault);

    SHADOW_PRESETS.forEach((preset) => {
        const option = document.createElement("option");
        option.value = preset.value;
        option.textContent = preset.label;
        select.appendChild(option);
    });

    // Pick the initial selection: no override -> theme default; an override that
    // matches a preset -> that preset; anything else -> a synthetic "Custom"
    // option that preserves the hand-authored value verbatim.
    if (!hasEphemeralOverride(varName)) {
        select.value = THEME_DEFAULT_SHADOW;
    } else {
        const preset = SHADOW_PRESETS.find(
            (p) => norm(p.value) === norm(currentVal),
        );
        if (preset) {
            select.value = preset.value;
        } else {
            const custom = document.createElement("option");
            custom.value = currentVal;
            custom.textContent = t("c29_custom");
            select.appendChild(custom);
            select.value = currentVal;
        }
    }

    const updatePreview = () => {
        const value =
            select.value === THEME_DEFAULT_SHADOW ? themeDefault : select.value;
        preview.style.boxShadow = value && value !== "none" ? value : "none";
    };
    updatePreview();

    select.addEventListener("change", () => {
        if (select.value === THEME_DEFAULT_SHADOW) {
            doReset();
        } else {
            setEphemeralOverride(varName, select.value);
            if (getActiveEditorTheme() === getCurrentThemeName())
                applyVar(varName, select.value);
            markModified();
        }
        updatePreview();
    });

    resetBtn.addEventListener("click", () => {
        select.value = THEME_DEFAULT_SHADOW;
        doReset();
        updatePreview();
    });

    controls.append(select, preview, dot, resetBtn);
}

function buildTextControl({
    controls,
    row,
    currentVal,
    themeDefault,
    varName,
    dot,
    resetBtn,
    markModified,
    doReset,
}) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "theme-editor-text-input";
    input.value = currentVal;
    input.placeholder = themeDefault;

    let committedValue = currentVal;

    const syncValidityState = (isInvalid, message = "") => {
        input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
        input.title = message;
    };

    const isValidValue = (value) => {
        const trimmed = value.trim();
        if (!trimmed) return false;

        const cssProperty = row?.dataset?.cssProperty?.trim();
        if (
            cssProperty &&
            typeof CSS !== "undefined" &&
            typeof CSS.supports === "function"
        ) {
            return CSS.supports(cssProperty, trimmed);
        }

        return true;
    };

    const commitValue = () => {
        const nextValue = input.value.trim();
        if (nextValue === committedValue) {
            syncValidityState(false);
            input.value = committedValue;
            return;
        }

        if (!isValidValue(nextValue)) {
            input.value = committedValue;
            syncValidityState(
                true,
                t("c29_invalid_css"),
            );
            return;
        }

        committedValue = nextValue;
        input.value = nextValue;
        syncValidityState(false);
        setEphemeralOverride(varName, nextValue);
        if (getActiveEditorTheme() === getCurrentThemeName())
            applyVar(varName, nextValue);
        markModified();
    };

    input.addEventListener("input", () => {
        syncValidityState(false);
    });

    input.addEventListener("blur", commitValue);
    input.addEventListener("change", commitValue);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
        } else if (event.key === "Escape") {
            event.preventDefault();
            input.value = committedValue;
            syncValidityState(false);
            input.blur();
        }
    });

    resetBtn.addEventListener("click", () => {
        committedValue = themeDefault;
        input.value = themeDefault;
        syncValidityState(false);
        doReset();
    });

    controls.append(input, dot, resetBtn);
}

function buildControl(row) {
    const varName = row.dataset.var;
    const type = row.dataset.type;
    const controls = row.querySelector(".theme-editor-controls");
    if (!controls || !varName) return;

    controls.innerHTML = "";

    const currentVal = getEffectiveValue(varName);
    const defaults =
        THEME_DEFAULTS[getActiveEditorTheme()] || THEME_DEFAULTS.simple;
    const themeDefault = defaults[varName] || "";
    const modified = hasEphemeralOverride(varName);

    const dot = document.createElement("span");
    dot.className = `theme-editor-modified-dot${modified ? " visible" : ""}`;

    const resetBtn = document.createElement("button");
    resetBtn.className = "theme-editor-var-reset";
    resetBtn.title = t("c29_reset_to_default");
    resetBtn.textContent = "↺";
    if (modified) resetBtn.style.opacity = "1";

    const markModified = () => {
        dot.classList.add("visible");
        resetBtn.style.opacity = "1";
        updateModifiedBadge();
        persistWorkspaceThemeOverrides();
    };

    const doReset = () => {
        deleteEphemeralOverride(varName);

        if (getActiveEditorTheme() === getCurrentThemeName()) {
            removeVar(varName);
        }

        dot.classList.remove("visible");
        resetBtn.style.opacity = "";
        updateModifiedBadge();
        persistWorkspaceThemeOverrides();
    };

    const ctx = {
        controls,
        row,
        currentVal,
        themeDefault,
        varName,
        dot,
        resetBtn,
        markModified,
        doReset,
    };

    if (type === "color") buildColorControl(ctx);
    else if (type === "range") buildRangeControl(ctx);
    else if (type === "select") buildSelectControl(ctx);
    else if (type === "shadow") buildShadowControl(ctx);
    else if (type === "text") buildTextControl(ctx);
}

export function buildAllControls() {
    document
        .querySelectorAll("#settings-theme-editor .theme-editor-row[data-var]")
        .forEach((row) => buildControl(row));
    updateModifiedBadge();
}

export function isModifiedVsSaved() {
    const defaults =
        THEME_DEFAULTS[getActiveEditorTheme()] || THEME_DEFAULTS.simple;
    const knownKeys = Object.keys(defaults);
    const overrides = getEphemeralOverrides();

    const activeTheme = getActiveNamedThemeId()
        ? getSavedNamedThemes().find(
              (theme) => theme.id === getActiveNamedThemeId(),
          ) || null
        : null;

    const savedBase = activeTheme?.themeOverrides || {};
    const savedCustomCss = activeTheme?.customCss || "";
    const currentCustomCss = getCurrentCustomCss();

    return (
        currentCustomCss !== savedCustomCss ||
        knownKeys.some((key) => {
            const current = overrides[key] ?? defaults[key];
            const saved = savedBase[key] ?? defaults[key];
            return current !== saved;
        })
    );
}

export function updateModifiedBadge() {
    const badge = document.getElementById("theme-editor-modified-badge");
    if (!badge) return;
    badge.style.display = isModifiedVsSaved() ? "" : "none";
}
