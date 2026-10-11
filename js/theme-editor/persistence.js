import {
    LEGACY_ACTIVE_SAVED_THEME_ID_KEY,
    LEGACY_SAVED_THEMES_STORAGE_KEY,
    STORAGE_KEY,
} from "./constants.js";
import { buildAllControls, updateModifiedBadge } from "./controls.js";
import {
    applyNamedTheme,
    deactivateSavedTheme,
    deleteNamedTheme,
} from "./named-theme-actions.js";
import { renderSavedThemesStrip } from "./saved-strip.js";
import {
    getActiveNamedThemeId,
    getCurrentCustomCss,
    getEphemeralOverrides,
    getActiveEditorTheme,
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
    applyThemeOverrides,
    clearAllThemeEditorVars,
    getCurrentThemeName,
} from "./theme-runtime.js";
import { currentWorkspace } from "../workspaces/workspace-state.js";
import { patchAndPersistWorkspaceVisualSettings } from "../workspaces/workspace-visuals.js";
import { sanitizeImportedThemes } from "../untrusted-input.js";
import { t } from "../i18n.js";
import { getLocal, removeLocal, setLocal } from "../storage-local.js";

function showSaveDialog() {
    return new Promise((resolve) => {
        const overlay = document.getElementById("theme-save-dialog");
        const nameInput = document.getElementById("theme-save-name-input");
        const existingList = document.getElementById("theme-save-existing-list");
        const hint = document.getElementById("theme-save-overwrite-hint");
        const cancelBtn = document.getElementById("theme-save-dialog-cancel");
        const okBtn = document.getElementById("theme-save-dialog-ok");

        if (
            !overlay ||
            !nameInput ||
            !existingList ||
            !hint ||
            !cancelBtn ||
            !okBtn
        ) {
            resolve(window.prompt(t("p31_prompt_save_theme_as"), t("p31_default_theme_name")));
            return;
        }

        const activeName =
            getSavedNamedThemes().find(
                (theme) => theme.id === getActiveNamedThemeId(),
            )?.name || t("p31_default_theme_name");
        nameInput.value = activeName;

        existingList.innerHTML = "";
        getSavedNamedThemes().forEach((theme) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `theme-save-existing-chip${theme.name === activeName ? " selected" : ""}`;
            chip.textContent = theme.name;
            chip.addEventListener("click", () => {
                nameInput.value = theme.name;
                sync();
                nameInput.focus();
            });
            existingList.appendChild(chip);
        });

        function sync() {
            const value = nameInput.value.trim();
            hint.style.display = getSavedNamedThemes().some(
                (theme) => theme.name === value,
            )
                ? ""
                : "none";
            existingList
                .querySelectorAll(".theme-save-existing-chip")
                .forEach((chip) => {
                    chip.classList.toggle(
                        "selected",
                        chip.textContent === value,
                    );
                });
        }

        nameInput.addEventListener("input", sync);
        sync();
        overlay.style.display = "flex";
        setTimeout(() => {
            nameInput.focus();
            nameInput.select();
        }, 50);

        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            overlay.style.display = "none";
            nameInput.removeEventListener("input", sync);
            cancelBtn.removeEventListener("click", onCancel);
            okBtn.removeEventListener("click", onOk);
            overlay.removeEventListener("keydown", onKey);
            resolve(value);
        };
        const onOk = () => {
            const value = nameInput.value.trim();
            if (value) finish(value);
            else nameInput.focus();
        };
        const onCancel = () => {
            finish(null);
        };
        const onKey = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                onOk();
            }
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
            }
        };

        cancelBtn.addEventListener("click", onCancel);
        okBtn.addEventListener("click", onOk);
        overlay.addEventListener("keydown", onKey);
    });
}

function readCurrentWorkspaceBackground() {
    return new Promise((resolve) => {
        getLocal(
            [
                `workspace_bg_${currentWorkspace}`,
                "backgroundType",
                "color",
                "backgroundImage",
            ],
            (result) => {
                

                const workspaceBg = result[`workspace_bg_${currentWorkspace}`];
                if (workspaceBg) {
                    resolve({
                        type: workspaceBg.type || "color",
                        color:
                            workspaceBg.type === "color"
                                ? workspaceBg.value || ""
                                : "",
                        image:
                            workspaceBg.type === "image"
                                ? workspaceBg.value || null
                                : null,
                    });
                    return;
                }

                resolve({
                    type: result.backgroundType || "color",
                    color: result.color || "",
                    image: result.backgroundImage || null,
                });
            },
        );
    });
}

export async function saveTheme() {
    const trimmedName = await showSaveDialog();
    if (!trimmedName) return;

    const background = await readCurrentWorkspaceBackground();

    const existing = getSavedNamedThemes().find(
        (theme) => theme.name === trimmedName,
    );

    const parsedBorderRadius = parseInt(
        getComputedStyle(document.body)
            .getPropertyValue("--border-radius")
            .trim(),
        10,
    );
    const parsedCardOpacity = parseFloat(
        getComputedStyle(document.body)
            .getPropertyValue("--card-opacity")
            .trim(),
    );

    const entry = {
        id: existing ? existing.id : Date.now().toString(),
        name: trimmedName,
        baseTheme: getActiveEditorTheme(),
        themeOverrides: { ...getEphemeralOverrides() },
        background,
        borderRadius: Number.isFinite(parsedBorderRadius)
            ? parsedBorderRadius
            : 8,
        cardOpacity: Number.isFinite(parsedCardOpacity)
            ? Math.round(parsedCardOpacity * 100)
            : 85,
        tabUnderline: document.body.classList.contains("tabs-underline"),
        showDescriptions: document.body.classList.contains("show-descriptions"),
        autoFavicon: !!window.autoFaviconEnabled,
        hoverMotion: !document.body.classList.contains("hover-motion-disabled"),
        customCss: getCurrentCustomCss(),
    };

    const nextThemes = existing
        ? getSavedNamedThemes().map((theme) =>
              theme.id === existing.id ? entry : theme,
          )
        : [...getSavedNamedThemes(), entry];

    setSavedNamedThemes(nextThemes);
    setActiveNamedThemeId(entry.id);

    await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        theme: getActiveEditorTheme(),
        savedThemeId: entry.id,
        themeOverrides: { ...getEphemeralOverrides() },
        customCss: getCurrentCustomCss(),
    });

    setLocal({ [STORAGE_KEY]: nextThemes }, () => {
        

        removeLocal(LEGACY_SAVED_THEMES_STORAGE_KEY);

        renderSavedThemesStrip({
            onApplyNamedTheme: applyNamedTheme,
            onDeleteNamedTheme: deleteNamedTheme,
            onDeactivateSavedTheme: deactivateSavedTheme,
        });
        updateModifiedBadge();
        const btn = document.getElementById("theme-save-btn");
        if (btn) {
            const originalLabel = btn.textContent;
            btn.textContent = t("p31_btn_saved");
            btn.style.background = "#059669";
            setTimeout(() => {
                btn.textContent = originalLabel;
                btn.style.background = "";
            }, 1500);
        }
    });
}

export async function resetTheme() {
    if (!confirm(t("p31_confirm_reset_theme")))
        return;

    setActiveNamedThemeId(null);
    setEphemeralOverrides({});
    setCurrentCustomCss("");

    clearAllThemeEditorVars(getActiveEditorTheme());
    applyCustomCss("");

    const textarea = document.getElementById("theme-custom-css-input");
    if (textarea) textarea.value = "";

    await patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        savedThemeId: null,
        themeOverrides: {},
        customCss: "",
    });

    buildAllControls();
    renderSavedThemesStrip({
        onApplyNamedTheme: applyNamedTheme,
        onDeleteNamedTheme: deleteNamedTheme,
        onDeactivateSavedTheme: deactivateSavedTheme,
    });
}

export function exportThemes() {
    const data = JSON.stringify({ themes: getSavedNamedThemes() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "startpage-themes.json";
    anchor.click();
    URL.revokeObjectURL(url);
}

export function importThemes(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            const importedThemes = Array.isArray(parsed.themes)
                ? parsed.themes
                : parsed.pro_themes;
            if (!Array.isArray(importedThemes)) {
                throw new Error("Invalid format: 'themes' must be an array");
            }

            // Imported CSS is code-adjacent: only keep it when the user
            // vouches for the file (their own export). Everything else is
            // stripped as before.
            const containsCustomCss = importedThemes.some(
                (theme) =>
                    typeof theme?.customCss === "string" &&
                    theme.customCss.trim().length > 0,
            );
            const allowCustomCss =
                containsCustomCss && confirm(t("p31_confirm_import_custom_css"));

            const sanitizedThemes = sanitizeImportedThemes(importedThemes, {
                allowCustomCss,
            });

            // Merge by name: importing a backup updates same-named themes
            // and never wipes the rest of the library (this used to be a
            // wholesale replace — fable.md B.1).
            const importedNames = new Set(
                sanitizedThemes.map((theme) => theme.name),
            );
            const mergedThemes = [
                ...getSavedNamedThemes().filter(
                    (theme) => !importedNames.has(theme.name),
                ),
                ...sanitizedThemes,
            ];
            setSavedNamedThemes(mergedThemes);

            setLocal({ [STORAGE_KEY]: mergedThemes }, () => {
                

                removeLocal(LEGACY_SAVED_THEMES_STORAGE_KEY);

                applyThemeOverrides(getCurrentThemeName());
                buildAllControls();
                renderSavedThemesStrip({
                    onApplyNamedTheme: applyNamedTheme,
                    onDeleteNamedTheme: deleteNamedTheme,
                    onDeactivateSavedTheme: deactivateSavedTheme,
                });
                alert(t("p31_alert_import_success"));
            });
        } catch (err) {
            alert(t("p31_alert_import_failed", [err.message]));
        }
    };

    reader.readAsText(file);
}

export function loadThemeEditorState() {
    getLocal(
        [
            STORAGE_KEY,
            LEGACY_SAVED_THEMES_STORAGE_KEY,
            LEGACY_ACTIVE_SAVED_THEME_ID_KEY,
            "workspaceVisuals",
        ],
        (result) => {
            

            const rawThemes = Array.isArray(result[STORAGE_KEY])
                ? result[STORAGE_KEY]
                : Array.isArray(result[LEGACY_SAVED_THEMES_STORAGE_KEY])
                  ? result[LEGACY_SAVED_THEMES_STORAGE_KEY]
                  : [];
            const sanitizedThemes = sanitizeImportedThemes(rawThemes);
            setSavedNamedThemes(sanitizedThemes);

            if (
                !Array.isArray(result[STORAGE_KEY]) &&
                Array.isArray(result[LEGACY_SAVED_THEMES_STORAGE_KEY])
            ) {
                setLocal(
                    { [STORAGE_KEY]: sanitizedThemes },
                    () => {
                        removeLocal(
                            LEGACY_SAVED_THEMES_STORAGE_KEY,
                        );
                    },
                );
            }

            const workspaceVisuals =
                result.workspaceVisuals &&
                typeof result.workspaceVisuals === "object"
                    ? result.workspaceVisuals
                    : {};

            const currentVisuals =
                workspaceVisuals[currentWorkspace] &&
                typeof workspaceVisuals[currentWorkspace] === "object"
                    ? workspaceVisuals[currentWorkspace]
                    : {};

            const applyLoadedState = (activeId) => {
                const activeTheme = sanitizedThemes.find(
                    (theme) => theme.id === activeId,
                );
                const resolvedTheme =
                    typeof currentVisuals.theme === "string" &&
                    currentVisuals.theme
                        ? currentVisuals.theme
                        : activeTheme?.baseTheme || getCurrentThemeName();
                const resolvedOverrides =
                    currentVisuals.themeOverrides &&
                    typeof currentVisuals.themeOverrides === "object"
                        ? currentVisuals.themeOverrides
                        : activeTheme?.themeOverrides &&
                            typeof activeTheme.themeOverrides === "object"
                          ? activeTheme.themeOverrides
                          : {};
                const resolvedCustomCss =
                    typeof currentVisuals.customCss === "string"
                        ? currentVisuals.customCss
                        : typeof activeTheme?.customCss === "string"
                          ? activeTheme.customCss
                          : "";

                setActiveNamedThemeId(activeId);
                setActiveEditorTheme(resolvedTheme);
                setEphemeralOverrides(resolvedOverrides);
                setCurrentCustomCss(resolvedCustomCss);
                applyBodyTheme(resolvedTheme);
                applyThemeOverrides(resolvedTheme);
            };

            const activeId =
                currentVisuals.savedThemeId ??
                currentVisuals.proThemeId ??
                result[LEGACY_ACTIVE_SAVED_THEME_ID_KEY] ??
                null;

            if (activeId || result.workspaceVisuals) {
                applyLoadedState(activeId);
                return;
            }

            getLocal(
                ["workspaceSavedThemes", "workspaceProThemes"],
                (legacyResult) => {
                    const legacyWorkspaceMap =
                        legacyResult.workspaceSavedThemes &&
                        typeof legacyResult.workspaceSavedThemes === "object"
                            ? legacyResult.workspaceSavedThemes
                            : legacyResult.workspaceProThemes &&
                                typeof legacyResult.workspaceProThemes ===
                                    "object"
                              ? legacyResult.workspaceProThemes
                              : {};

                    applyLoadedState(
                        legacyWorkspaceMap[currentWorkspace] ?? null,
                    );
                },
            );
        },
    );
}
