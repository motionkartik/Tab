import { resetLayoutBtn, uiStyleSelect } from "../variables.js";

import { buildAllControls } from "../theme-editor/controls.js";
import { onThemeChanged } from "../theme-editor/init.js";
import {
    applyNamedTheme,
    deactivateSavedTheme,
    deleteNamedTheme,
} from "../theme-editor/named-theme-actions.js";
import { renderSavedThemesStrip } from "../theme-editor/saved-strip.js";
import {
    applyBodyTheme,
    applyCustomCss,
} from "../theme-editor/theme-runtime.js";
import { THEME_BG_DEFAULTS } from "../theme-editor/constants.js";
import {
    setActiveNamedThemeId,
    setCurrentCustomCss,
    setEphemeralOverrides,
} from "../theme-editor/state.js";
import {
    loadWorkspaceBackground,
    patchAndPersistWorkspaceVisualSettings,
    persistWorkspaceBackground,
    persistWorkspaceVisuals,
    setAndPersistWorkspaceVisualSetting,
    syncWorkspaceVisualControls,
    readWorkspaceBackground,
} from "../workspaces/workspace-visuals.js";
import {
    currentWorkspace,
    DEFAULT_WORKSPACE_VISUAL_SETTINGS,
    getCurrentWorkspace,
    getWorkspaceVisualSettings,
    workspaceOrder,
    workspaceNames,
    updateWorkspaceVisualSettings,
} from "../workspaces/workspace-state.js";
import {
    fetchAllFavicons,
    removeAllIcons,
} from "./workspace-item-handlers.js";
import { showToast, showUndoToast } from "../undo-manager.js";
import { t } from "../i18n.js";
import { getLocal, setLocal } from "../storage-local.js";

const ALL_THEME_CLASSES = [
    "dark-mode",
    "ui-dark",
    "ui-light",
    "ui-midnight",
    "ui-luxury",
    "ui-nordic",
    "ui-ocean",
    "ui-aurora-glass",
    "ui-frost",
    "ui-sakura",
    "ui-professional",
    "ui-pastel-sunset",
    "ui-lavender-sky",
];

export const applyTheme = (theme) => {
    document.body.classList.remove(...ALL_THEME_CLASSES);
    applyBodyTheme(theme);
};

function renderThemeEditorUi() {
    buildAllControls();
    renderSavedThemesStrip({
        onApplyNamedTheme: applyNamedTheme,
        onDeleteNamedTheme: deleteNamedTheme,
        onDeactivateSavedTheme: deactivateSavedTheme,
    });
}

function cloneVisualSettings(settings) {
    return {
        ...(settings || {}),
        themeOverrides: { ...(settings?.themeOverrides || {}) },
    };
}

function cloneBackground(background) {
    if (!background || typeof background !== "object") return null;
    return {
        type: background.type,
        value: background.value ?? "",
    };
}

function buildBuiltInThemeResetPatch(theme, currentVisuals) {
    return {
        theme,
        savedThemeId: null,
        themeOverrides: {},
        customCss: "",
        borderRadius: DEFAULT_WORKSPACE_VISUAL_SETTINGS.borderRadius,
        cardOpacity: DEFAULT_WORKSPACE_VISUAL_SETTINGS.cardOpacity,
        tabUnderline: DEFAULT_WORKSPACE_VISUAL_SETTINGS.tabUnderline,
        showDescriptions: currentVisuals.showDescriptions,
        autoFavicon: currentVisuals.autoFavicon,
        hoverMotion: currentVisuals.hoverMotion,
    };
}

async function captureThemeSelectionSnapshot(workspaceId) {
    return {
        workspaceId,
        visuals: cloneVisualSettings(getWorkspaceVisualSettings(workspaceId)),
        background: cloneBackground(await readWorkspaceBackground(workspaceId)),
    };
}

async function restoreThemeSelectionSnapshot(snapshot) {
    if (!snapshot?.workspaceId || !snapshot.visuals) return;

    await patchAndPersistWorkspaceVisualSettings(
        snapshot.workspaceId,
        cloneVisualSettings(snapshot.visuals),
    );
    await persistWorkspaceBackground(
        snapshot.workspaceId,
        cloneBackground(snapshot.background),
    );

    if (getCurrentWorkspace() !== snapshot.workspaceId) return;

    syncWorkspaceVisualControls(snapshot.workspaceId);
    await loadWorkspaceBackground(snapshot.workspaceId);
    renderThemeEditorUi();
}

async function applyBuiltInThemeSelection(theme, themeLabel = theme) {
    const workspaceId = getCurrentWorkspace();
    const snapshot = await captureThemeSelectionSnapshot(workspaceId);
    const currentVisuals = getWorkspaceVisualSettings(workspaceId);
    const nextBackground = THEME_BG_DEFAULTS[theme] || THEME_BG_DEFAULTS.simple;

    await patchAndPersistWorkspaceVisualSettings(
        workspaceId,
        buildBuiltInThemeResetPatch(theme, currentVisuals),
    );
    await persistWorkspaceBackground(workspaceId, {
        type: "color",
        value: nextBackground,
    });

    if (getCurrentWorkspace() === workspaceId) {
        syncWorkspaceVisualControls(workspaceId);
        await loadWorkspaceBackground(workspaceId);
        renderThemeEditorUi();
    }

    showUndoToast(
        t("slh16_theme_changed", [themeLabel]),
        () => {
            void restoreThemeSelectionSnapshot(snapshot);
        },
        {
            actionLabel: t("slh16_revert"),
            durationMs: 10000,
            singletonKey: "theme-change",
            dismissible: true,
        },
    );
}

export const initSettingsLayoutHandlers = () => {
    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener("click", async () => {
            setActiveNamedThemeId(null);
            setEphemeralOverrides({});
            setCurrentCustomCss("");
            applyCustomCss("");

            document.body.classList.remove(...ALL_THEME_CLASSES);
            applyTheme("light");
            onThemeChanged();
            if (uiStyleSelect) uiStyleSelect.value = "light";

            const tabUnderlineToggle = document.getElementById(
                "tab-underline-toggle",
            );
            if (tabUnderlineToggle) tabUnderlineToggle.checked = false;
            document.body.classList.remove("tabs-underline");

            const showDescriptionsToggle = document.getElementById(
                "show-descriptions-toggle",
            );
            if (showDescriptionsToggle) showDescriptionsToggle.checked = false;
            document.body.classList.remove("show-descriptions");

            const hoverMotionToggle = document.getElementById(
                "hover-motion-toggle",
            );
            if (hoverMotionToggle) hoverMotionToggle.checked = true;
            document.body.classList.remove("hover-motion-disabled");

            await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
                theme: "light",
                savedThemeId: null,
                themeOverrides: {},
                customCss: "",
                tabUnderline: false,
                showDescriptions: false,
                hoverMotion: true,
            });
        });
    }

    const applyToWorkspacesBtn = document.getElementById(
        "apply-theme-to-workspaces-btn",
    );
    if (applyToWorkspacesBtn) {
        applyToWorkspacesBtn.addEventListener("click", () => {
            const others = workspaceOrder.filter(
                (id) => id !== currentWorkspace,
            );
            if (others.length === 0) return;

            getLocal(["defaultWorkspaceName"], (stored) => {
                const defaultName = stored.defaultWorkspaceName || "Start";
                const currentTheme = uiStyleSelect
                    ? uiStyleSelect.value
                    : "light";

                const modal = document.getElementById("apply-theme-modal");
                const nameEl = document.getElementById(
                    "apply-theme-modal-name",
                );
                const listEl = document.getElementById(
                    "apply-theme-modal-list",
                );
                const allCheck = document.getElementById(
                    "apply-theme-modal-all",
                );
                const okBtn = document.getElementById("apply-theme-modal-ok");
                const cancelBtn = document.getElementById(
                    "apply-theme-modal-cancel",
                );
                if (
                    !modal ||
                    !nameEl ||
                    !listEl ||
                    !allCheck ||
                    !okBtn ||
                    !cancelBtn
                )
                    return;

                nameEl.textContent =
                    currentTheme.charAt(0).toUpperCase() +
                    currentTheme.slice(1).replace(/-/g, " ");
                listEl.innerHTML = "";
                allCheck.checked = false;

                others.forEach((id) => {
                    const displayName =
                        id === "default"
                            ? defaultName
                            : workspaceNames[id] || id.replace(/-/g, " ");
                    const label = document.createElement("label");
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.value = id;
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(displayName));
                    listEl.appendChild(label);
                });

                allCheck.onchange = () => {
                    listEl
                        .querySelectorAll('input[type="checkbox"]')
                        .forEach((cb) => {
                            cb.checked = allCheck.checked;
                        });
                };

                modal.style.display = "flex";

                const close = () => {
                    modal.style.display = "none";
                };

                cancelBtn.onclick = close;
                modal.onclick = (e) => {
                    if (e.target === modal) close();
                };

                okBtn.onclick = async () => {
                    const checked = [
                        ...listEl.querySelectorAll(
                            'input[type="checkbox"]:checked',
                        ),
                    ].map((cb) => cb.value);
                    if (checked.length === 0) {
                        close();
                        return;
                    }

                    const nextBackground =
                        THEME_BG_DEFAULTS[currentTheme] ||
                        THEME_BG_DEFAULTS.simple;

                    checked.forEach((id) => {
                        updateWorkspaceVisualSettings(
                            id,
                            buildBuiltInThemeResetPatch(
                                currentTheme,
                                getWorkspaceVisualSettings(id),
                            ),
                        );
                    });
                    await persistWorkspaceVisuals();
                    await Promise.all(
                        checked.map((id) =>
                            persistWorkspaceBackground(id, {
                                type: "color",
                                value: nextBackground,
                            }),
                        ),
                    );
                    close();
                };
            });
        });
    }

    if (uiStyleSelect) {
        uiStyleSelect.addEventListener(
            "change",
            async function onUiStyleChange() {
                const theme = this.value;
                const themeLabel =
                    this.selectedOptions?.[0]?.textContent?.trim() || theme;

                await applyBuiltInThemeSelection(theme, themeLabel);
            },
        );
    }

    const tabUnderlineToggle = document.getElementById("tab-underline-toggle");
    if (tabUnderlineToggle) {
        tabUnderlineToggle.addEventListener(
            "change",
            async function onTabUnderlineChange() {
                document.body.classList.toggle("tabs-underline", this.checked);
                await setAndPersistWorkspaceVisualSetting(
                    currentWorkspace,
                    "tabUnderline",
                    this.checked,
                );
            },
        );
    }

    const showDescriptionsToggle = document.getElementById(
        "show-descriptions-toggle",
    );
    if (showDescriptionsToggle) {
        showDescriptionsToggle.addEventListener(
            "change",
            async function onShowDescriptionsChange() {
                document.body.classList.toggle(
                    "show-descriptions",
                    this.checked,
                );
                await setAndPersistWorkspaceVisualSetting(
                    currentWorkspace,
                    "showDescriptions",
                    this.checked,
                );
            },
        );
    }

    const autoFaviconToggle = document.getElementById("auto-favicon-toggle");
    if (autoFaviconToggle) {
        autoFaviconToggle.addEventListener(
            "change",
            async function onAutoFaviconChange() {
                window.autoFaviconEnabled = this.checked;
                await setAndPersistWorkspaceVisualSetting(
                    currentWorkspace,
                    "autoFavicon",
                    this.checked,
                );
            },
        );
    }

    // Privacy gate for remote favicon loads (global, per browser profile).
    // Toggling re-renders the active workspace so avatars/images swap live.
    const remoteFaviconsToggle = document.getElementById(
        "remote-favicons-toggle",
    );
    if (remoteFaviconsToggle) {
        getLocal(["general_remoteFavicons"], (result) => {
            const allowed = result.general_remoteFavicons !== false;
            window.remoteFaviconsEnabled = allowed;
            remoteFaviconsToggle.checked = allowed;
        });
        remoteFaviconsToggle.addEventListener(
            "change",
            async function onRemoteFaviconsChange() {
                window.remoteFaviconsEnabled = this.checked;
                await setLocal({ general_remoteFavicons: this.checked });
                const { loadCurrentWorkspace } =
                    await import("../workspaces/workspace-grid-sync.js");
                loadCurrentWorkspace();
            },
        );
    }

    const fetchAllFaviconsBtn = document.getElementById(
        "fetch-all-favicons-btn",
    );
    if (fetchAllFaviconsBtn && !fetchAllFaviconsBtn.dataset.bound) {
        fetchAllFaviconsBtn.dataset.bound = "true";
        fetchAllFaviconsBtn.addEventListener("click", async () => {
            if (fetchAllFaviconsBtn.disabled) return;
            // Ask whether to also overwrite icons that are already set,
            // otherwise only fill in links that have no icon yet.
            const includeExisting = window.confirm(
                t("slh16_favicon_overwrite_confirm"),
            );
            const originalLabel = fetchAllFaviconsBtn.textContent;
            fetchAllFaviconsBtn.disabled = true;
            fetchAllFaviconsBtn.textContent = t("slh16_fetching_favicons");
            try {
                const { total, updated } = await fetchAllFavicons({
                    includeExisting,
                });
                if (total === 0) {
                    showToast(
                        includeExisting
                            ? t("slh16_no_links_with_url")
                            : t("slh16_no_links_without_icon"),
                    );
                } else {
                    showToast(
                        includeExisting
                            ? t("slh16_updated_favicons", [updated, updated === 1 ? "" : "s"])
                            : t("slh16_added_favicons", [updated, updated === 1 ? "" : "s"]),
                    );
                }
            } catch (error) {
                console.error("[settings] Failed to fetch favicons:", error);
                showToast(t("slh16_could_not_fetch_favicons"), true);
            } finally {
                fetchAllFaviconsBtn.disabled = false;
                fetchAllFaviconsBtn.textContent = originalLabel;
            }
        });
    }

    const removeAllIconsBtn = document.getElementById("remove-all-icons-btn");
    if (removeAllIconsBtn && !removeAllIconsBtn.dataset.bound) {
        removeAllIconsBtn.dataset.bound = "true";
        removeAllIconsBtn.addEventListener("click", async () => {
            if (removeAllIconsBtn.disabled) return;
            const confirmed = window.confirm(
                t("slh16_remove_all_icons_confirm"),
            );
            if (!confirmed) return;
            const originalLabel = removeAllIconsBtn.textContent;
            removeAllIconsBtn.disabled = true;
            removeAllIconsBtn.textContent = t("slh16_removing_icons");
            try {
                const { removed } = await removeAllIcons();
                showToast(
                    removed === 0
                        ? t("slh16_no_icons_to_remove")
                        : t("slh16_removed_icons", [removed, removed === 1 ? "" : "s"]),
                );
            } catch (error) {
                console.error("[settings] Failed to remove icons:", error);
                showToast(t("slh16_could_not_remove_icons"), true);
            } finally {
                removeAllIconsBtn.disabled = false;
                removeAllIconsBtn.textContent = originalLabel;
            }
        });
    }

    const hoverMotionToggle = document.getElementById("hover-motion-toggle");
    if (hoverMotionToggle) {
        hoverMotionToggle.addEventListener(
            "change",
            async function onHoverMotionChange() {
                document.body.classList.toggle(
                    "hover-motion-disabled",
                    !this.checked,
                );
                await setAndPersistWorkspaceVisualSetting(
                    currentWorkspace,
                    "hoverMotion",
                    this.checked,
                );
            },
        );
    }
};
