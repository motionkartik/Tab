import { buildAllControls } from "./controls.js";
import {
    applyNamedTheme,
    deactivateSavedTheme,
    deleteNamedTheme,
} from "./named-theme-actions.js";
import {
    exportThemes,
    importThemes,
    resetTheme,
    saveTheme,
} from "./persistence.js";
import { renderSavedThemesStrip } from "./saved-strip.js";
import {
    getActiveNamedThemeId,
    getCurrentCustomCss,
    getEphemeralOverrides,
    getActiveEditorTheme,
    setCurrentCustomCss,
    setActiveEditorTheme,
} from "./state.js";
import {
    applyCustomCss,
    applyThemeOverrides,
    getCurrentThemeName,
} from "./theme-runtime.js";
import { patchAndPersistWorkspaceVisualSettings } from "../workspaces/workspace-visuals.js";
import { currentWorkspace } from "../workspaces/workspace-state.js";

function persistCurrentWorkspaceThemeEditorState(patch = {}) {
    return patchAndPersistWorkspaceVisualSettings(currentWorkspace, {
        theme: getActiveEditorTheme(),
        savedThemeId: getActiveNamedThemeId(),
        themeOverrides: getEphemeralOverrides(),
        customCss: getCurrentCustomCss(),
        ...patch,
    });
}

function createChevronSvg() {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6"></path>
        </svg>
    `;
}

function setOpenThemeEditorGroup(container, nextItem) {
    if (!container) return;
    container
        .querySelectorAll(":scope > .theme-editor-accordion-item")
        .forEach((item) => {
            const isOpen = item === nextItem;
            item.classList.toggle("is-open", isOpen);
            const trigger = item.querySelector(
                ":scope > .settings-collapsible-header > .settings-collapsible-trigger",
            );
            if (trigger) {
                trigger.setAttribute(
                    "aria-expanded",
                    isOpen ? "true" : "false",
                );
            }
        });
}

function ensureThemeEditorAccordion() {
    const sectionsRoot = document.querySelector(
        "#settings-theme-editor .theme-editor-sections",
    );
    if (!sectionsRoot || sectionsRoot.dataset.accordionReady === "1") return;

    const nodes = Array.from(sectionsRoot.children);
    const groups = [];
    let currentGroup = null;

    nodes.forEach((node) => {
        if (node.classList.contains("theme-editor-group-header")) {
            currentGroup = {
                title: node.textContent.trim(),
                nodes: [],
            };
            groups.push(currentGroup);
            return;
        }

        if (currentGroup) {
            currentGroup.nodes.push(node);
        }
    });

    sectionsRoot.innerHTML = "";

    groups.forEach((group) => {
        const item = document.createElement("div");
        item.className =
            "settings-collapsible-item theme-editor-accordion-item";
        item.dataset.accordionTitle = group.title;

        const header = document.createElement("div");
        header.className = "settings-collapsible-header";

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className =
            "settings-collapsible-trigger theme-editor-collapsible-trigger";
        trigger.setAttribute("aria-expanded", "false");

        const count = group.nodes.reduce((total, node) => {
            if (!(node instanceof HTMLElement)) return total;
            return total + node.querySelectorAll(".theme-editor-row").length;
        }, 0);

        trigger.innerHTML = `
            <span class="settings-collapsible-title">${group.title}</span>
            <span class="settings-collapsible-spacer"></span>
            <span class="settings-collapsible-count">${count}</span>
            <span class="settings-collapsible-chevron">${createChevronSvg()}</span>
        `;

        const content = document.createElement("div");
        content.className =
            "settings-collapsible-content theme-editor-collapsible-content";
        group.nodes.forEach((node) => content.appendChild(node));

        trigger.addEventListener("click", () => {
            const willOpen = !item.classList.contains("is-open");
            setOpenThemeEditorGroup(sectionsRoot, willOpen ? item : null);
        });

        header.appendChild(trigger);
        item.append(header, content);
        sectionsRoot.appendChild(item);
    });

    sectionsRoot.dataset.accordionReady = "1";
}

export function initThemeEditor() {
    setActiveEditorTheme(getCurrentThemeName());

    const customCssTextarea = document.getElementById("theme-custom-css-input");
    if (customCssTextarea) {
        customCssTextarea.value = getCurrentCustomCss();
        if (!customCssTextarea.dataset.listenerSet) {
            customCssTextarea.dataset.listenerSet = "1";
            customCssTextarea.addEventListener("input", () => {
                const css = customCssTextarea.value;
                setCurrentCustomCss(css);
                applyCustomCss(css);
                void persistCurrentWorkspaceThemeEditorState({
                    customCss: css,
                });
            });
        }
    }

    const saveBtn = document.getElementById("theme-save-btn");
    if (saveBtn && !saveBtn.dataset.listenerSet) {
        saveBtn.dataset.listenerSet = "1";
        saveBtn.addEventListener("click", saveTheme);
    }

    const resetBtn = document.getElementById("theme-reset-btn");
    if (resetBtn && !resetBtn.dataset.listenerSet) {
        resetBtn.dataset.listenerSet = "1";
        resetBtn.addEventListener("click", resetTheme);
    }

    const exportBtn = document.getElementById("theme-export-btn");
    if (exportBtn && !exportBtn.dataset.listenerSet) {
        exportBtn.dataset.listenerSet = "1";
        exportBtn.addEventListener("click", exportThemes);
    }

    const importInput = document.getElementById("theme-import-input");
    if (importInput && !importInput.dataset.listenerSet) {
        importInput.dataset.listenerSet = "1";
        importInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                importThemes(e.target.files[0]);
                e.target.value = "";
            }
        });
    }

    const customCssTrigger = document.querySelector(
        "#theme-editor-custom-css-collapsible .settings-collapsible-trigger",
    );
    if (customCssTrigger && !customCssTrigger.dataset.listenerSet) {
        customCssTrigger.dataset.listenerSet = "1";
        customCssTrigger.addEventListener("click", () => {
            const item = customCssTrigger.closest(".settings-collapsible-item");
            const open = item.classList.toggle("is-open");
            customCssTrigger.setAttribute("aria-expanded", String(open));
        });
    }

    ensureThemeEditorAccordion();

    document
        .querySelectorAll('.settings-tab[data-tab="layout"]')
        .forEach((tab) => {
            if (tab.dataset.listenerSet) return;
            tab.dataset.listenerSet = "1";
            tab.addEventListener("click", () => {
                setActiveEditorTheme(getCurrentThemeName());

                if (customCssTextarea)
                    customCssTextarea.value = getCurrentCustomCss();

                renderSavedThemesStrip({
                    onApplyNamedTheme: applyNamedTheme,
                    onDeleteNamedTheme: deleteNamedTheme,
                    onDeactivateSavedTheme: deactivateSavedTheme,
                });
                buildAllControls();
                ensureThemeEditorAccordion();
            });
        });
}

export function onThemeChanged() {
    const newTheme = getCurrentThemeName();
    setActiveEditorTheme(newTheme);
    applyThemeOverrides(newTheme);
}
