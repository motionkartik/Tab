import {
    gradientOptions,
    resetBackgroundBtn,
    settingsBgImageInput,
    settingsUploadImage,
} from "../variables.js";

import { getCurrentWorkspace } from "../workspaces/workspace-state.js";
import { persistWorkspaceState } from "../workspaces/workspace-storage.js";
import { ADVANCED_GRADIENTS } from "../advanced-gradients.js";
import { applyTheme } from "./settings-layout-handlers.js";
import {
    applyBackgroundObj,
    getAppliedBackground,
} from "../background-utils.js";
import {
    DEFAULT_SCENE_TINT,
    DEFAULT_SCENE_VARIANT,
    SCENE_IDS,
    SCENE_TINTS,
    formatSceneValue,
    parseSceneValue,
} from "../backgrounds/scene-kit.js";
import { escapeCssUrl, sanitizeImageSource } from "../untrusted-input.js";
import { loadWorkspaceBackground } from "../workspaces/workspace-visuals.js";
import {
    getWorkspaceVisualSettings,
    workspacesData,
} from "../workspaces/workspace-state.js";
import { t } from "../i18n.js";
import { getLocal } from "../storage-local.js";

const MAX_BG_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

const summarizeBackgroundValue = (value) => {
    if (typeof value !== "string") return value;

    if (value.startsWith("data:")) {
        return `${value.slice(0, 48)}… [len=${value.length}]`;
    }

    return value.length > 160 ? `${value.slice(0, 160)}…` : value;
};

const applyAndSaveWorkspaceBg = (type, value) => {
    applyBackgroundObj({ type, value });
    saveWorkspaceBg(type, value);
};

export const saveWorkspaceBg = (type, value) => {
    const workspaceId = getCurrentWorkspace();
    const storageKey = `workspace_bg_${workspaceId}`;

    void persistWorkspaceState({ [storageKey]: { type, value } }).then(
        ({ error }) => {
            if (!error) return;
            console.error(
                "[settings-background] Failed to save workspace background",
                {
                    workspaceId,
                    storageKey,
                    type,
                    value: summarizeBackgroundValue(value),
                    error,
                },
            );
            if (error.toLowerCase().includes("quota")) {
                alert(t("sbh15_quota_exceeded"));
            }
        },
    );
};

export const saveWorkspaceStyle = (theme) => {
    const workspaceId = getCurrentWorkspace();
    const currentVisuals = getWorkspaceVisualSettings(workspaceId);
    workspacesData.workspaceVisuals[workspaceId] = {
        ...currentVisuals,
        theme,
    };
    void persistWorkspaceState({
        workspaceVisuals: workspacesData.workspaceVisuals,
    });
};


/* ---------- Background card: tabs, current preview, canvas scenes ---------- */

const BG_TAB_LABEL_KEYS = {
    themes: "setbg_tab_themes",
    animated: "setbg_tab_animated",
    gradients: "setbg_tab_gradients",
    solid: "setbg_tab_solid",
    image: "setbg_tab_image",
    css: "setbg_tab_css",
};

// Tint and appearance used for the next scene the user picks. They follow the
// current background whenever that is a scene.
let sceneTint = DEFAULT_SCENE_TINT;
let sceneVariant = DEFAULT_SCENE_VARIANT;
let sceneThumbsRendered = false;

const getBgCard = () => document.querySelector("#settings-layout .bg-card");

function selectBackgroundTab(tabId, { focus = false } = {}) {
    const card = getBgCard();
    if (!card || !BG_TAB_LABEL_KEYS[tabId]) return;
    card.querySelectorAll(".bg-tab").forEach((tab) => {
        const isActive = tab.dataset.bgTab === tabId;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive && focus) tab.focus();
    });
    card.querySelectorAll(".bg-tab-panel").forEach((panel) => {
        panel.hidden = panel.dataset.bgPanel !== tabId;
    });
    if (tabId === "animated") void renderSceneThumbnails();
}

function initBackgroundTabs() {
    const card = getBgCard();
    if (!card) return;
    // The preview row opens and closes the options (tabs + grids). The drawer
    // closes every collapsible when it opens, so the card starts collapsed.
    const toggle = document.getElementById("bg-card-toggle");
    toggle?.addEventListener("click", () => {
        const willOpen = !card.classList.contains("is-open");
        card.classList.toggle("is-open", willOpen);
        toggle.setAttribute("aria-expanded", String(willOpen));
    });
    const tabs = Array.from(card.querySelectorAll(".bg-tab"));
    tabs.forEach((tab, index) => {
        tab.tabIndex = tab.classList.contains("is-active") ? 0 : -1;
        tab.addEventListener("click", () =>
            selectBackgroundTab(tab.dataset.bgTab),
        );
        tab.addEventListener("keydown", (event) => {
            const step =
                event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : 0;
            if (!step) return;
            event.preventDefault();
            const next = tabs[(index + step + tabs.length) % tabs.length];
            selectBackgroundTab(next.dataset.bgTab, { focus: true });
        });
    });
}

/** Canvas thumbnails are only meaningful once their tab is visible (they need a size). */
async function renderSceneThumbnails({ force = false } = {}) {
    const panel = document.getElementById("bg-panel-animated");
    if (!panel || panel.hidden) return;
    // Nothing to measure while the settings drawer is closed; the resize
    // observer in initSceneOptions calls back in once the panel has a size.
    if (!panel.getClientRects().length) {
        if (force) sceneThumbsRendered = false;
        return;
    }
    if (sceneThumbsRendered && !force) return;
    sceneThumbsRendered = true;
    const { renderSceneStill } = await import(
        "../backgrounds/scene-runtime.js"
    );
    for (const canvas of panel.querySelectorAll(".bg-scene-option canvas")) {
        await renderSceneStill(
            canvas,
            canvas.closest(".bg-scene-option").dataset.scene,
            sceneTint,
            sceneVariant,
        );
    }
}

function syncSceneControls(scene) {
    const controls = document.getElementById("bg-scene-controls");
    if (!controls) return;
    controls.hidden = !scene;
    controls.querySelectorAll(".bg-scene-tint").forEach((dot) => {
        dot.setAttribute(
            "aria-checked",
            dot.dataset.tint === sceneTint ? "true" : "false",
        );
    });
    const custom = document.getElementById("bg-scene-tint-custom");
    if (custom) custom.value = sceneTint;
    controls.querySelectorAll("[data-scene-variant]").forEach((btn) => {
        btn.setAttribute(
            "aria-checked",
            btn.dataset.sceneVariant === sceneVariant ? "true" : "false",
        );
    });
}

/** Work out what the applied background is, in the card's terms. */
function describeBackground(bg) {
    const card = getBgCard();
    const value = typeof bg?.value === "string" ? bg.value : "";
    const labelOf = (el) => el?.querySelector("span:last-child")?.textContent;
    const swatchCss = (el) =>
        el?.querySelector(".named-gradient-swatch, .animated-bg-swatch")?.style
            .background || "";

    if (bg?.type === "image") {
        const src = sanitizeImageSource(value);
        return {
            tab: "image",
            name: t("setbg_name_custom_image"),
            preview: src ? `url("${escapeCssUrl(src)}") center / cover` : "",
        };
    }

    // Theme swatches are matched first: a theme default may itself be stored
    // with a __css__ prefix (e.g. Professional).
    const byColor = (selector) =>
        Array.from(card?.querySelectorAll(selector) || []).find(
            (el) => el.dataset.color === value,
        );
    const themeOption = byColor("#bg-panel-themes .named-gradient-option");
    if (themeOption) {
        return {
            tab: "themes",
            name: labelOf(themeOption),
            preview: value.replace(/^__(?:solid|css)__:/, ""),
            option: themeOption,
        };
    }

    const scene = parseSceneValue(value);
    if (scene) {
        return {
            tab: "animated",
            name: t(`setbg_scene_${scene.id}`),
            scene,
            option: card?.querySelector(
                `.bg-scene-option[data-scene="${scene.id}"]`,
            ),
        };
    }

    if (value.startsWith("__animated__:")) {
        const option = card?.querySelector(
            `.animated-bg-option[data-anim="${CSS.escape(value.slice("__animated__:".length))}"]`,
        );
        return {
            tab: "animated",
            name: labelOf(option) || t("setbg_tab_animated"),
            preview: swatchCss(option),
            option,
        };
    }

    if (value.startsWith("__advanced__:")) {
        const option = Array.from(
            card?.querySelectorAll(
                "#advanced-gradient-options .named-gradient-option",
            ) || [],
        ).find((el) => el.dataset.advanced === value);
        return {
            tab: "gradients",
            name: labelOf(option) || t("setbg_name_gradient"),
            preview: swatchCss(option),
            option,
        };
    }

    if (value.startsWith("__solid__:")) {
        const color = value.slice("__solid__:".length);
        const option = Array.from(
            card?.querySelectorAll(".bg-solid-option[data-solid]") || [],
        ).find((el) => el.dataset.solid.toLowerCase() === color.toLowerCase());
        return {
            tab: "solid",
            name: labelOf(option) || t("setbg_name_custom_color"),
            preview: color,
            option: option || card?.querySelector(".bg-solid-custom"),
        };
    }

    if (value.startsWith("__css__:")) {
        return {
            tab: "css",
            name: t("setbg_name_custom_css"),
            preview: value.slice("__css__:".length),
        };
    }

    return {
        tab: "gradients",
        name: t("setbg_name_gradient"),
        preview: value,
        option: byColor(".gradient-option"),
    };
}

let hasSyncedBackgroundCard = false;
/** Scene shown in the "current background" preview, or null. */
let previewScene = null;

function renderScenePreview() {
    const canvas = document.getElementById("bg-current-preview-canvas");
    if (!previewScene || !canvas || !canvas.getClientRects().length) return;
    const scene = previewScene;
    void import("../backgrounds/scene-runtime.js").then(
        ({ renderSceneStill }) =>
            renderSceneStill(canvas, scene.id, scene.tint, scene.variant),
    );
}

function syncBackgroundCard(bg) {
    const card = getBgCard();
    if (!card || !bg) return;
    const info = describeBackground(bg);

    card.querySelectorAll(".is-selected").forEach((el) =>
        el.classList.remove("is-selected"),
    );
    info.option?.classList.add("is-selected");

    const nameEl = document.getElementById("bg-current-name");
    const categoryEl = document.getElementById("bg-current-category");
    if (nameEl) nameEl.textContent = info.name || "";
    if (categoryEl) categoryEl.textContent = t(BG_TAB_LABEL_KEYS[info.tab]);

    const preview = document.getElementById("bg-current-preview");
    const previewCanvas = document.getElementById("bg-current-preview-canvas");
    if (preview && previewCanvas) {
        previewCanvas.hidden = !info.scene;
        preview.style.background = info.scene ? "" : info.preview || "";
        previewScene = info.scene || null;
        renderScenePreview();
    }

    if (info.scene) {
        const changed =
            info.scene.tint !== sceneTint ||
            info.scene.variant !== sceneVariant;
        sceneTint = info.scene.tint;
        sceneVariant = info.scene.variant;
        if (changed) void renderSceneThumbnails({ force: true });
    }
    syncSceneControls(info.scene);

    // Open on the tab that holds the current background, once. After that the
    // user's own tab choice wins.
    if (!hasSyncedBackgroundCard) {
        hasSyncedBackgroundCard = true;
        selectBackgroundTab(info.tab);
    }
}

function initSceneOptions() {
    const list = document.querySelector("#bg-panel-animated .animated-bg-options");
    const tints = document.getElementById("bg-scene-tints");
    if (!list || !tints) return;

    // Canvas scenes come first in the Animated tab, ahead of the CSS gradients.
    const fragment = document.createDocumentFragment();
    SCENE_IDS.forEach((id) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bg-scene-option";
        btn.dataset.scene = id;
        const swatch = document.createElement("canvas");
        swatch.className = "animated-bg-swatch";
        const label = document.createElement("span");
        label.textContent = t(`setbg_scene_${id}`);
        btn.append(swatch, label);
        btn.addEventListener("click", () => {
            applyAndSaveWorkspaceBg(
                "color",
                formatSceneValue({ id, tint: sceneTint, variant: sceneVariant }),
            );
        });
        fragment.appendChild(btn);
    });
    list.prepend(fragment);

    // Canvases cannot be drawn while the drawer is closed (no size yet), so
    // paint the thumbnails and the preview when the card first becomes visible.
    const card = getBgCard();
    if (card && typeof ResizeObserver === "function") {
        new ResizeObserver(() => {
            void renderSceneThumbnails();
            renderScenePreview();
        }).observe(card);
    }

    const currentScene = () => parseSceneValue(getAppliedBackground()?.value);
    // Recolor the scene that is showing. `save: false` is used while a color
    // picker is being dragged, so storage is only written once it settles.
    const reapply = ({ save = true } = {}) => {
        const scene = currentScene();
        if (!scene) return;
        const value = formatSceneValue({
            id: scene.id,
            tint: sceneTint,
            variant: sceneVariant,
        });
        if (save) applyAndSaveWorkspaceBg("color", value);
        else applyBackgroundObj({ type: "color", value });
    };

    SCENE_TINTS.forEach(({ id, hex }) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "bg-scene-tint";
        dot.dataset.tint = hex;
        dot.style.background = hex;
        dot.setAttribute("role", "radio");
        dot.setAttribute("aria-label", t(`setbg_scene_tint_${id}`));
        dot.title = t(`setbg_scene_tint_${id}`);
        dot.addEventListener("click", () => {
            sceneTint = hex;
            reapply();
        });
        tints.appendChild(dot);
    });

    const custom = document.getElementById("bg-scene-tint-custom");
    if (custom) {
        let pendingFrame = 0;
        custom.addEventListener("input", () => {
            sceneTint = custom.value.toLowerCase();
            if (pendingFrame) return;
            pendingFrame = requestAnimationFrame(() => {
                pendingFrame = 0;
                reapply({ save: false });
            });
        });
        custom.addEventListener("change", () => {
            sceneTint = custom.value.toLowerCase();
            reapply();
        });
    }

    document
        .querySelectorAll("#bg-scene-variants [data-scene-variant]")
        .forEach((btn) => {
            btn.addEventListener("click", () => {
                sceneVariant = btn.dataset.sceneVariant;
                reapply();
            });
        });
}

function initImageDropZone() {
    const drop = document.getElementById("bg-image-drop");
    const label = document.getElementById("bg-image-drop-label");
    if (!drop || !label || !settingsBgImageInput) return;

    const showFileName = () => {
        const file = settingsBgImageInput.files[0];
        label.textContent = file ? file.name : t("setbg_image_drop");
    };
    settingsBgImageInput.addEventListener("change", showFileName);

    ["dragenter", "dragover"].forEach((type) =>
        drop.addEventListener(type, (event) => {
            event.preventDefault();
            drop.classList.add("is-dragover");
        }),
    );
    ["dragleave", "drop"].forEach((type) =>
        drop.addEventListener(type, () => drop.classList.remove("is-dragover")),
    );
    drop.addEventListener("drop", (event) => {
        event.preventDefault();
        const file = Array.from(event.dataTransfer?.files || []).find((f) =>
            f.type.startsWith("image/"),
        );
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        settingsBgImageInput.files = transfer.files;
        showFileName();
    });
}

const _populateApplyFrom = () => {
    import("../workspaces/workspace-state.js").then(
        ({
            workspaceOrder,
            workspaceNames,
            currentWorkspace,
            managedBoardIds,
        }) => {
            const sel = document.getElementById("apply-from-workspace-select");
            if (!sel) return;
            sel.innerHTML = `<option value="">${t("sbh15_select_workspace")}</option>`;
            workspaceOrder
                .filter(
                    (id) => id !== currentWorkspace && !managedBoardIds.has(id),
                )
                .forEach((id) => {
                    const opt = document.createElement("option");
                    opt.value = id;
                    opt.textContent =
                        id === "default"
                            ? t("sbh15_default_workspace")
                            : workspaceNames[id] || id.replace(/-/g, " ");
                    sel.appendChild(opt);
                });
        },
    );
};

export const initSettingsBackgroundHandlers = () => {
    initBackgroundTabs();
    initSceneOptions();
    initImageDropZone();

    if (gradientOptions) {
        gradientOptions.forEach((option) => {
            option.style.backgroundImage = option.dataset.color;
            option.addEventListener("click", () => {
                applyAndSaveWorkspaceBg("color", option.dataset.color);
            });
        });
    }

    document.querySelectorAll(".named-gradient-option").forEach((option) => {
        option.addEventListener("click", () => {
            applyAndSaveWorkspaceBg("color", option.dataset.color);
        });
    });

    const advancedContainer = document.getElementById(
        "advanced-gradient-options",
    );
    if (advancedContainer) {
        ADVANCED_GRADIENTS.forEach((grad) => {
            const btn = document.createElement("button");
            btn.className = "named-gradient-option";
            const swatch = document.createElement("span");
            swatch.className = "named-gradient-swatch";
            swatch.style.background = grad.preview;
            const label = document.createElement("span");
            label.textContent = grad.name;
            btn.appendChild(swatch);
            btn.appendChild(label);
            const { preview: _p, name: _n, ...cssProps } = grad;
            const advVal = `__advanced__:${JSON.stringify(cssProps)}`;
            // Lets the card find the option that matches the current background.
            btn.dataset.advanced = advVal;
            btn.addEventListener("click", () => {
                applyAndSaveWorkspaceBg("color", advVal);
            });
            advancedContainer.appendChild(btn);
        });
    }

    if (settingsUploadImage && settingsBgImageInput) {
        settingsUploadImage.addEventListener("click", () => {
            const file = settingsBgImageInput.files[0];
            if (!file) return;

            if (file.size > MAX_BG_IMAGE_BYTES) {
                alert(
                    t("sbh15_image_too_large", [
                        (file.size / 1024 / 1024).toFixed(1),
                    ]),
                );
                settingsBgImageInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = event.target.result;
                applyAndSaveWorkspaceBg("image", imageData);
            };
            reader.readAsDataURL(file);
        });
    }

    document.querySelectorAll(".bg-solid-option[data-solid]").forEach((btn) => {
        btn.addEventListener("click", () => {
            applyAndSaveWorkspaceBg("color", `__solid__:${btn.dataset.solid}`);
        });
    });

    const bgSolidColor = document.getElementById("bg-solid-color");
    if (bgSolidColor) {
        bgSolidColor.addEventListener("input", function onBgSolidColorInput() {
            const colorVal = `__solid__:${this.value}`;
            applyAndSaveWorkspaceBg("color", colorVal);
        });
    }

    const bgCustomCssApply = document.getElementById("bg-custom-css-apply");
    if (bgCustomCssApply) {
        bgCustomCssApply.addEventListener("click", () => {
            const inputEl = document.getElementById("bg-custom-css");
            const rawValue = inputEl?.value?.trim();
            if (!rawValue) return;

            const value = rawValue.replace(/;+$/, "").trim();
            if (!value) return;
            if (
                typeof CSS !== "undefined" &&
                typeof CSS.supports === "function" &&
                !CSS.supports("background", value)
            ) {
                return;
            }

            if (inputEl) {
                inputEl.value = value;
            }

            const cssColorVal = `__css__:${value}`;
            applyAndSaveWorkspaceBg("color", cssColorVal);
        });
    }

    if (resetBackgroundBtn) {
        resetBackgroundBtn.addEventListener("click", () => {
            const workspaceId = getCurrentWorkspace();
            // Clearing the per-workspace override makes the background fall
            // back to the current theme's default, so re-run the loader to
            // apply that default instead of a hardcoded gradient.
            void persistWorkspaceState(
                {},
                { removeKeys: [`workspace_bg_${workspaceId}`] },
            ).then(() => loadWorkspaceBackground(workspaceId));
        });
    }

    document.querySelectorAll(".animated-bg-option").forEach((btn) => {
        btn.addEventListener("click", function onAnimatedBgClick() {
            const animName = this.dataset.anim;
            const animVal = `__animated__:${animName}`;
            applyAndSaveWorkspaceBg("color", animVal);
        });
    });

    window.addEventListener("rt:background-applied", (event) => {
        syncBackgroundCard(event.detail?.background);
    });
    syncBackgroundCard(getAppliedBackground());

    // Apply from workspace
    document
        .querySelector('.settings-tab[data-tab="layout"]')
        ?.addEventListener("click", _populateApplyFrom);

    // Copy-from-workspace card collapse/expand (standalone single-item accordion)
    const copyFromTrigger = document.querySelector(
        "#copy-from-workspace-card .settings-collapsible-trigger",
    );
    if (copyFromTrigger) {
        copyFromTrigger.addEventListener("click", () => {
            const item = copyFromTrigger.closest(".settings-collapsible-item");
            const willOpen = !item.classList.contains("is-open");
            item.classList.toggle("is-open", willOpen);
            copyFromTrigger.setAttribute("aria-expanded", String(willOpen));
        });
    }

    const applyFromBtn = document.getElementById("apply-from-workspace-btn");
    if (applyFromBtn) {
        applyFromBtn.addEventListener("click", async () => {
            const sel = document.getElementById("apply-from-workspace-select");
            const sourceId = sel?.value;
            if (!sourceId) return;

            const theme = getWorkspaceVisualSettings(sourceId).theme;

            getLocal([`workspace_bg_${sourceId}`], (result) => {
                const bg = result[`workspace_bg_${sourceId}`];

                if (bg) {
                    saveWorkspaceBg(bg.type, bg.value);
                    applyBackgroundObj(bg);
                }

                if (theme) {
                    applyTheme(theme);
                    saveWorkspaceStyle(theme);
                    const uiSel = document.getElementById("ui-style-select");
                    if (uiSel) uiSel.value = theme;
                }
            });
        });
    }
};
