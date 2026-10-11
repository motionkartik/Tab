import { initStartScreen } from "./start-screen.js";
import { registerStorageHandler } from "./workspaces/storage-coordinator.js";

function syncSelectOptions(sourceId, mirrorId) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!source || !mirror) return;

    if (mirror.innerHTML !== source.innerHTML) {
        mirror.innerHTML = source.innerHTML;
    }
    mirror.value = source.value;
}

function syncSelectValue(sourceId, mirrorId) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!source || !mirror) return;
    mirror.value = source.value;
}

function syncChecked(sourceId, mirrorId) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!source || !mirror) return;
    mirror.checked = !!source.checked;
}

export function syncEmptyWorkspaceOnboardingUi() {
    syncSelectValue("link-target-select", "empty-workspace-link-target-select");
    syncChecked("clock-toggle", "empty-workspace-clock-toggle");
    syncChecked("web-search-toggle", "empty-workspace-web-search-toggle");
    syncChecked("auto-favicon-toggle", "empty-workspace-auto-favicon-toggle");
    syncSelectOptions("ui-style-select", "empty-workspace-theme-select");
}

function bindMirrorToggle(mirrorId, sourceId) {
    const mirror = document.getElementById(mirrorId);
    if (!mirror || mirror.dataset.bound === "true") return;
    mirror.dataset.bound = "true";
    mirror.addEventListener("change", () => {
        const source = document.getElementById(sourceId);
        if (!source) return;
        source.checked = mirror.checked;
        source.dispatchEvent(new Event("change", { bubbles: true }));
        syncEmptyWorkspaceOnboardingUi();
    });
}

function bindMirrorSelect(mirrorId, sourceId) {
    const mirror = document.getElementById(mirrorId);
    if (!mirror || mirror.dataset.bound === "true") return;
    mirror.dataset.bound = "true";
    mirror.addEventListener("change", () => {
        const source = document.getElementById(sourceId);
        if (!source) return;
        source.value = mirror.value;
        source.dispatchEvent(new Event("change", { bubbles: true }));
        syncEmptyWorkspaceOnboardingUi();
    });
}

function bindSourceSync(sourceId) {
    const source = document.getElementById(sourceId);
    if (!source || source.dataset.emptyWorkspaceSyncBound === "true") return;
    source.dataset.emptyWorkspaceSyncBound = "true";
    source.addEventListener("change", () => {
        syncEmptyWorkspaceOnboardingUi();
    });
}

let storageBound = false;
let eventBound = false;

export function initEmptyWorkspaceOnboarding() {
    initStartScreen();
    bindMirrorSelect("empty-workspace-link-target-select", "link-target-select");
    bindMirrorToggle("empty-workspace-clock-toggle", "clock-toggle");
    bindMirrorToggle("empty-workspace-web-search-toggle", "web-search-toggle");
    bindMirrorToggle(
        "empty-workspace-auto-favicon-toggle",
        "auto-favicon-toggle",
    );
    bindMirrorSelect("empty-workspace-theme-select", "ui-style-select");

    [
        "link-target-select",
        "clock-toggle",
        "web-search-toggle",
        "auto-favicon-toggle",
        "ui-style-select",
    ].forEach(bindSourceSync);

    if (!storageBound) {
        storageBound = true;
        registerStorageHandler("onboarding", (changes) => {
            if (
                changes.workspaceVisuals ||
                changes.general_linkTarget ||
                changes.general_clockShow ||
                changes.general_webSearchEnabled
            ) {
                syncEmptyWorkspaceOnboardingUi();
            }
        });
    }

    if (!eventBound) {
        eventBound = true;
        window.addEventListener("rt:global-settings-loaded", () => {
            syncEmptyWorkspaceOnboardingUi();
        });
        window.addEventListener("rt:workspace-visual-settings-applied", () => {
            syncEmptyWorkspaceOnboardingUi();
        });
    }

    syncEmptyWorkspaceOnboardingUi();
}
