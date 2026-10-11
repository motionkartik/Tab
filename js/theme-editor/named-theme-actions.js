import { t } from "../i18n.js";
import { STORAGE_KEY, THEME_BG_DEFAULTS } from "./constants.js";
import { buildAllControls } from "./controls.js";
import { renderSavedThemesStrip } from "./saved-strip.js";
import {
    getActiveNamedThemeId,
    getSavedNamedThemes,
    setActiveNamedThemeId,
    setCurrentCustomCss,
    setEphemeralOverrides,
    setActiveEditorTheme,
    setSavedNamedThemes,
} from "./state.js";
import {
    applyBodyTheme,
    applyCustomCss,
    applyVar,
    applyThemeOverrides,
    clearAllThemeEditorVars,
    getCurrentThemeName,
} from "./theme-runtime.js";
import {
    currentWorkspace,
    DEFAULT_WORKSPACE_VISUAL_SETTINGS,
} from "../workspaces/workspace-state.js";
import { patchAndPersistWorkspaceVisualSettings } from "../workspaces/workspace-visuals.js";
import { saveWorkspaceBg } from "../event-handlers/settings-background-handlers.js";
import { applyBackgroundObj } from "../background-utils.js";
import { setLocal } from "../storage-local.js";

export async function applyNamedTheme(id) {
    const theme = getSavedNamedThemes().find(
        (savedTheme) => savedTheme.id === id,
    );
    if (!theme) return;

    setActiveNamedThemeId(id);
    setActiveEditorTheme(theme.baseTheme);

    applyBodyTheme(theme.baseTheme);

    const nextThemeOverrides = {
        ...(theme.themeOverrides || {}),
    };

    clearAllThemeEditorVars(theme.baseTheme);
    Object.entries(nextThemeOverrides).forEach(([varName, value]) =>
        applyVar(varName, value),
    );
    setEphemeralOverrides(nextThemeOverrides);

    const customCss = theme.customCss || "";
    setCurrentCustomCss(customCss);
    applyCustomCss(customCss);
    const cssTextarea = document.getElementById("theme-custom-css-input");
    if (cssTextarea) cssTextarea.value = customCss;

    const uiStyleSelect = document.getElementById("ui-style-select");
    if (uiStyleSelect) uiStyleSelect.value = theme.baseTheme;

    const nextBorderRadius = Number.isFinite(Number(theme.borderRadius))
        ? Number(theme.borderRadius)
        : null;
    if (nextBorderRadius !== null) {
        document.body.style.setProperty(
            "--border-radius",
            `${nextBorderRadius}px`,
        );
    }

    const nextCardOpacity = Number.isFinite(Number(theme.cardOpacity))
        ? Number(theme.cardOpacity)
        : null;
    if (nextCardOpacity !== null) {
        document.body.style.setProperty(
            "--card-opacity",
            (nextCardOpacity / 100).toString(),
        );
    }

    if (theme.tabUnderline !== undefined) {
        document.body.classList.toggle("tabs-underline", !!theme.tabUnderline);
        const tabUnderlineToggle = document.getElementById(
            "tab-underline-toggle",
        );
        if (tabUnderlineToggle)
            tabUnderlineToggle.checked = !!theme.tabUnderline;
    }

    if (theme.showDescriptions !== undefined) {
        document.body.classList.toggle(
            "show-descriptions",
            !!theme.showDescriptions,
        );
        const showDescriptionsToggle = document.getElementById(
            "show-descriptions-toggle",
        );
        if (showDescriptionsToggle)
            showDescriptionsToggle.checked = !!theme.showDescriptions;
    }

    if (theme.autoFavicon !== undefined) {
        window.autoFaviconEnabled = !!theme.autoFavicon;
        const autoFaviconToggle = document.getElementById(
            "auto-favicon-toggle",
        );
        if (autoFaviconToggle) autoFaviconToggle.checked = !!theme.autoFavicon;
    }

    if (theme.hoverMotion !== undefined) {
        document.body.classList.toggle(
            "hover-motion-disabled",
            !theme.hoverMotion,
        );
        const hoverMotionToggle = document.getElementById(
            "hover-motion-toggle",
        );
        if (hoverMotionToggle) hoverMotionToggle.checked = !!theme.hoverMotion;
    }

    if (theme.background?.type === "color" && theme.background.color) {
        saveWorkspaceBg("color", theme.background.color);
        applyBackgroundObj({ type: "color", value: theme.background.color });
    } else if (theme.background?.type === "image" && theme.background.image) {
        saveWorkspaceBg("image", theme.background.image);
        applyBackgroundObj({ type: "image", value: theme.background.image });
    }

    await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        theme: theme.baseTheme,
        savedThemeId: id,
        themeOverrides: nextThemeOverrides,
        customCss,
        ...(nextBorderRadius !== null
            ? { borderRadius: nextBorderRadius }
            : {}),
        ...(nextCardOpacity !== null ? { cardOpacity: nextCardOpacity } : {}),
        ...(theme.tabUnderline !== undefined
            ? { tabUnderline: !!theme.tabUnderline }
            : {}),
        ...(theme.showDescriptions !== undefined
            ? { showDescriptions: !!theme.showDescriptions }
            : {}),
        ...(theme.autoFavicon !== undefined
            ? { autoFavicon: !!theme.autoFavicon }
            : {}),
        ...(theme.hoverMotion !== undefined
            ? { hoverMotion: !!theme.hoverMotion }
            : {}),
    });

    applyThemeOverrides(theme.baseTheme);
    buildAllControls();
    renderSavedThemesStrip({
        onApplyNamedTheme: applyNamedTheme,
        onDeleteNamedTheme: deleteNamedTheme,
        onDeactivateSavedTheme: deactivateSavedTheme,
    });
}

export async function deactivateSavedTheme() {
    const uiStyleSelect = document.getElementById("ui-style-select");
    const theme = uiStyleSelect?.value || getCurrentThemeName();
    const defaultVisuals = DEFAULT_WORKSPACE_VISUAL_SETTINGS;
    const nextBackground = THEME_BG_DEFAULTS[theme] || THEME_BG_DEFAULTS.simple;

    setActiveNamedThemeId(null);
    setActiveEditorTheme(theme);
    setEphemeralOverrides({});
    setCurrentCustomCss("");

    applyBodyTheme(theme);
    applyThemeOverrides(theme);

    document.body.style.setProperty(
        "--border-radius",
        `${defaultVisuals.borderRadius}px`,
    );
    document.body.style.setProperty(
        "--card-opacity",
        (defaultVisuals.cardOpacity / 100).toString(),
    );

    document.body.classList.toggle(
        "tabs-underline",
        !!defaultVisuals.tabUnderline,
    );
    document.body.classList.toggle(
        "show-descriptions",
        !!defaultVisuals.showDescriptions,
    );
    document.body.classList.toggle(
        "hover-motion-disabled",
        !defaultVisuals.hoverMotion,
    );
    window.autoFaviconEnabled = !!defaultVisuals.autoFavicon;

    const tabUnderlineToggle = document.getElementById("tab-underline-toggle");
    if (tabUnderlineToggle)
        tabUnderlineToggle.checked = !!defaultVisuals.tabUnderline;

    const showDescriptionsToggle = document.getElementById(
        "show-descriptions-toggle",
    );
    if (showDescriptionsToggle)
        showDescriptionsToggle.checked = !!defaultVisuals.showDescriptions;

    const autoFaviconToggle = document.getElementById("auto-favicon-toggle");
    if (autoFaviconToggle)
        autoFaviconToggle.checked = !!defaultVisuals.autoFavicon;

    const hoverMotionToggle = document.getElementById("hover-motion-toggle");
    if (hoverMotionToggle)
        hoverMotionToggle.checked = !!defaultVisuals.hoverMotion;

    if (uiStyleSelect) uiStyleSelect.value = theme;

    saveWorkspaceBg("color", nextBackground);
    applyBackgroundObj({ type: "color", value: nextBackground });

    const cssTextarea = document.getElementById("theme-custom-css-input");
    if (cssTextarea) cssTextarea.value = "";

    await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        theme,
        savedThemeId: null,
        themeOverrides: {},
        customCss: "",
        borderRadius: defaultVisuals.borderRadius,
        cardOpacity: defaultVisuals.cardOpacity,
        tabUnderline: defaultVisuals.tabUnderline,
        showDescriptions: defaultVisuals.showDescriptions,
        autoFavicon: defaultVisuals.autoFavicon,
        hoverMotion: defaultVisuals.hoverMotion,
    });

    buildAllControls();
    renderSavedThemesStrip({
        onApplyNamedTheme: applyNamedTheme,
        onDeleteNamedTheme: deleteNamedTheme,
        onDeactivateSavedTheme: deactivateSavedTheme,
    });
}

export async function deleteNamedTheme(id) {
    if (!confirm(t("nta30_delete_confirm"))) return;

    const nextThemes = getSavedNamedThemes().filter((theme) => theme.id !== id);
    const wasActive = getActiveNamedThemeId() === id;

    const saved = await new Promise((resolve) => {
        setLocal({ [STORAGE_KEY]: nextThemes }, () => {
            
            resolve(true);
        });
    });

    if (!saved) return;

    setSavedNamedThemes(nextThemes);

    if (wasActive) {
        setActiveNamedThemeId(null);
        await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
            savedThemeId: null,
        });
    }

    renderSavedThemesStrip({
        onApplyNamedTheme: applyNamedTheme,
        onDeleteNamedTheme: deleteNamedTheme,
        onDeactivateSavedTheme: deactivateSavedTheme,
    });
}
