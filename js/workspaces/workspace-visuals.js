import { applyBackgroundObj } from "../background-utils.js";
import { persistWorkspaceState } from "./workspace-storage.js";
import { THEME_BG_DEFAULTS } from "../theme-editor/constants.js";
import {
    applyBodyTheme,
    applyWorkspaceThemeEditorState,
} from "../theme-editor/theme-runtime.js";
import {
    DEFAULT_WORKSPACE_VISUAL_SETTINGS,
    getCurrentWorkspace,
    getWorkspaceVisualSettings,
    setWorkspaceVisualSetting,
    updateWorkspaceVisualSettings,
    workspacesData,
} from "./workspace-state.js";
import { getLocal } from "../storage-local.js";

function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function applyBorderRadius(borderRadius) {
    document.body.style.setProperty("--border-radius", `${borderRadius}px`);
}

function applyCardOpacity(cardOpacity) {
    document.body.style.setProperty(
        "--card-opacity",
        (cardOpacity / 100).toString(),
    );
}

function applyTabUnderline(enabled) {
    document.body.classList.toggle("tabs-underline", !!enabled);
    setChecked("tab-underline-toggle", enabled);
}

function applyShowDescriptions(enabled) {
    document.body.classList.toggle("show-descriptions", !!enabled);
    setChecked("show-descriptions-toggle", enabled);
}

function applyAutoFavicon(enabled) {
    window.autoFaviconEnabled = !!enabled;
    setChecked("auto-favicon-toggle", enabled);
}

function applyHoverMotion(enabled) {
    document.body.classList.toggle("hover-motion-disabled", !enabled);
    setChecked("hover-motion-toggle", enabled);
}

function applyTheme(theme, visualState) {
    applyBodyTheme(theme);
    setValue("ui-style-select", theme);
    applyWorkspaceThemeEditorState(theme, visualState);
}

export function persistWorkspaceVisuals() {
    return persistWorkspaceState({
        workspaceVisuals: workspacesData.workspaceVisuals || {},
    });
}

export async function setAndPersistWorkspaceVisualSetting(
    workspaceId,
    key,
    value,
) {
    setWorkspaceVisualSetting(workspaceId, key, value);
    await persistWorkspaceVisuals();
    return getWorkspaceVisualSettings(workspaceId);
}

export async function patchAndPersistWorkspaceVisualSettings(
    workspaceId,
    patch,
) {
    updateWorkspaceVisualSettings(workspaceId, patch);
    await persistWorkspaceVisuals();
    return getWorkspaceVisualSettings(workspaceId);
}

export function syncWorkspaceVisualControls(workspaceId) {
    const visuals = getWorkspaceVisualSettings(workspaceId);

    applyBorderRadius(visuals.borderRadius);
    applyCardOpacity(visuals.cardOpacity);
    applyTabUnderline(visuals.tabUnderline);
    applyShowDescriptions(visuals.showDescriptions);
    applyAutoFavicon(visuals.autoFavicon);
    applyHoverMotion(visuals.hoverMotion);
    applyTheme(visuals.theme, visuals);

    return visuals;
}

export function readWorkspaceBackground(workspaceId) {
    return new Promise((resolve) => {
        const storageKey = `workspace_bg_${workspaceId}`;
        getLocal([storageKey], (result) => {
            

            const workspaceBg = result[storageKey];
            if (
                workspaceBg &&
                typeof workspaceBg === "object" &&
                typeof workspaceBg.type === "string"
            ) {
                resolve({
                    type: workspaceBg.type,
                    value: workspaceBg.value ?? "",
                });
                return;
            }

            resolve(null);
        });
    });
}

export function persistWorkspaceBackground(workspaceId, background) {
    const storageKey = `workspace_bg_${workspaceId}`;
    if (!background) {
        return persistWorkspaceState({}, { removeKeys: [storageKey] });
    }
    return persistWorkspaceState({
        [storageKey]: {
            type: background.type,
            value: background.value,
        },
    });
}

export function loadWorkspaceBackground(workspaceId) {
    return new Promise((resolve) => {
        const id = workspaceId || "default";
        const storageKey = `workspace_bg_${id}`;
        const keys =
            id === "default"
                ? [storageKey, "backgroundType", "color", "backgroundImage"]
                : [storageKey];

        // With no saved background, fall back to this workspace's theme default
        // (e.g. Simple's warm neutral) rather than a fixed legacy blue gradient.
        const theme =
            getWorkspaceVisualSettings(id)?.theme ||
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.theme;
        const themeDefaultBg =
            THEME_BG_DEFAULTS[theme] || THEME_BG_DEFAULTS.simple;

        getLocal(keys, (result) => {
            const workspaceBg = result[storageKey];
            if (workspaceBg) {
                applyBackgroundObj(workspaceBg);
                resolve(workspaceBg);
                return;
            }

            if (id === "default") {
                const type = result.backgroundType || "color";
                const value =
                    type === "image"
                        ? result.backgroundImage || ""
                        : result.color || themeDefaultBg;

                const fallback = { type, value };
                applyBackgroundObj(fallback);
                resolve(fallback);
                return;
            }

            const fallback = { type: "color", value: themeDefaultBg };
            applyBackgroundObj(fallback);
            resolve(fallback);
        });
    });
}

export async function applyWorkspaceVisualSettings(workspaceId) {
    const visuals = syncWorkspaceVisualControls(workspaceId);
    await loadWorkspaceBackground(workspaceId);
    window.dispatchEvent(
        new CustomEvent("rt:workspace-visual-settings-applied", {
            detail: { workspaceId },
        }),
    );
    return visuals;
}

export async function applyCurrentWorkspaceVisualSettings() {
    return applyWorkspaceVisualSettings(getCurrentWorkspace());
}

export function getWorkspaceVisualSettingOrDefault(workspaceId, key) {
    const visuals = getWorkspaceVisualSettings(workspaceId);
    return visuals[key] ?? DEFAULT_WORKSPACE_VISUAL_SETTINGS[key];
}
