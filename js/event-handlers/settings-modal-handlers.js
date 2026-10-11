import {
    settingsBtn,
    settingsClose,
    settingsModal,
    settingsPanels,
    settingsTabs,
} from "../variables.js";
import { closeAllDrawers } from "../drawer-manager.js";

const pingCompanion = () => {
    // Web build: no desktop companion app exists. The companion status UI
    // lived in the (removed) Account tab, so this is a no-op.
};

const activateSettingsTab = (targetTab) => {
    if (!targetTab || !settingsTabs || !settingsPanels) return;

    const targetButton = Array.from(settingsTabs).find(
        (tab) => tab.dataset.tab === targetTab,
    );

    if (targetButton) {
        targetButton.click();
    }
};

// Collapse every collapsible card across all settings tabs, so the drawer
// always opens in a clean, fully-closed state (the open/closed state otherwise
// persists in the DOM between opens).
const closeAllSettingsCollapsibles = () => {
    if (!settingsModal) return;
    settingsModal
        .querySelectorAll(".settings-collapsible-item.is-open")
        .forEach((item) => item.classList.remove("is-open"));
    settingsModal
        .querySelectorAll(
            '.settings-collapsible-trigger[aria-expanded="true"]',
        )
        .forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
};

export const openSettingsModal = (targetTab = null) => {
    closeAllDrawers();
    closeAllSettingsCollapsibles();
    settingsModal?.classList.add("active");
    pingCompanion();
    if (targetTab) activateSettingsTab(targetTab);
    window.dispatchEvent(new CustomEvent("rt:settings-opened"));
};

export const initSettingsModalHandlers = () => {
    const companionRetryBtn = document.getElementById("companion-retry-btn");
    if (companionRetryBtn) {
        companionRetryBtn.addEventListener("click", pingCompanion);
    }

    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            openSettingsModal();
        });
    }

    if (settingsClose) {
        settingsClose.addEventListener("click", () => {
            settingsModal.classList.remove("active");
        });
    }

    if (settingsModal) {
        settingsModal.addEventListener("click", (event) => {
            if (event.target === settingsModal) {
                settingsModal.classList.remove("active");
            }
        });

        // Close on Escape. Defer to the settings help popover if it's open so
        // one Escape closes the popover first, not the whole modal.
        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            if (!settingsModal.classList.contains("active")) return;
            const helpPopover = document.querySelector(
                ".settings-help-popover",
            );
            if (helpPopover && !helpPopover.hidden) return;
            settingsModal.classList.remove("active");
        });
    }

    if (settingsTabs) {
        settingsTabs.forEach((tab) => {
            tab.addEventListener("click", function onSettingsTabClick() {
                const targetTab = this.dataset.tab;
                const mergeThemeEditorIntoLayout = targetTab === "layout";
                const targetPanel = document.getElementById(
                    `settings-${targetTab}`,
                );
                const themeEditorPanel =
                    document.getElementById("settings-theme-editor");

                settingsTabs.forEach((t) => t.classList.remove("active"));
                this.classList.add("active");

                settingsPanels.forEach((panel) => {
                    panel.classList.remove("active");
                });

                if (targetPanel) {
                    targetPanel.classList.add("active");
                }

                if (themeEditorPanel) {
                    themeEditorPanel.classList.toggle(
                        "active",
                        mergeThemeEditorIntoLayout,
                    );
                }
            });
        });
    }
};
