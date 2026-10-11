// Main.js - Entry point for the web application

import { getLocal } from "./storage-local.js";
import { refreshDomElements } from "./variables.js";
import { initEventHandlers } from "./event-handlers/index.js";
import { flushGridState } from "./dom-manager/grid-state.js";
import {
    initWorkspaces,
    initWorkspaceEventHandlers,
} from "./workspaces/workspace-init.js";
import { initClock, syncHeroVisibility, setGreetingVisible, setGreetingName } from "./clock.js";
import { loadThemeEditorState } from "./theme-editor/persistence.js";
import { initSpotlight } from "./spotlight.js";
import { initEmptyWorkspaceOnboarding } from "./empty-workspace-onboarding.js";
import { initI18n, initLanguageSelector } from "./i18n.js";
import { initNotes } from "./notes/notes-button.js";
import { initTodo } from "./todo/todo-button.js";

// Load only global/non-workspace settings from storage.
// Workspace-owned visuals are applied by the workspace system after it loads state.
function loadGlobalSettings() {
    getLocal(
        [
            "general_linkTarget",
            "general_clockShow",
            "general_greetingShow",
            "general_greetingName",
            "general_clockFormat",
            "general_clockSeconds",
            "general_clockDate",
            "general_webSearchEnabled",
            "general_webSearchEngine",
            "general_webSearchNewTab",
            "general_spotlightGroupName",
            "general_spotlightShortcuts",
            "general_spotlightTheme",
            "general_autoGrowGroupsOnItemAdd",
            "general_remoteFavicons",
        ],
        (result) => {
            // Link target
            if (result.general_linkTarget) {
                const select = document.getElementById("link-target-select");
                if (select) select.value = result.general_linkTarget;
                window.linkTarget = result.general_linkTarget;
            }

            // Web Search
            const webSearchEnabled = result.general_webSearchEnabled !== false;
            // "browser" maps to Google on the web build (no browser Search API).
            // An absent value means the user never chose an engine.
            const webSearchEngine =
                result.general_webSearchEngine || "browser";
            const webSearchBar = document.getElementById("web-search-bar");
            if (webSearchBar)
                webSearchBar.style.display = webSearchEnabled ? "" : "none";
            const webSearchToggle =
                document.getElementById("web-search-toggle");
            if (webSearchToggle) webSearchToggle.checked = webSearchEnabled;
            const webSearchEngineSelect =
                document.getElementById("web-search-engine");
            if (webSearchEngineSelect)
                webSearchEngineSelect.value = webSearchEngine;
            window.webSearchEngine = webSearchEngine;
            const webSearchNewTab = result.general_webSearchNewTab || false;
            window.webSearchNewTab = webSearchNewTab;
            const webSearchNewTabToggle = document.getElementById(
                "web-search-new-tab-toggle",
            );
            if (webSearchNewTabToggle)
                webSearchNewTabToggle.checked = webSearchNewTab;
            if (webSearchEnabled) {
                setTimeout(
                    () => {
                        // Do not steal focus from a form opened during startup.
                        if (document.activeElement === document.body) document.getElementById("web-search-input")?.focus();
                    },
                    200,
                );
            }

            syncHeroVisibility();

            // Spotlight search by group name (default off)
            const spotlightGroupNameToggle = document.getElementById(
                "spotlight-group-name-toggle",
            );
            if (spotlightGroupNameToggle)
                spotlightGroupNameToggle.checked =
                    result.general_spotlightGroupName || false;

            // Spotlight shortcut rail (default on)
            const spotlightShortcutsToggle = document.getElementById(
                "spotlight-shortcuts-toggle",
            );
            if (spotlightShortcutsToggle)
                spotlightShortcutsToggle.checked =
                    result.general_spotlightShortcuts !== false;

            // Spotlight appearance (default dark)
            const spotlightThemeSelect = document.getElementById(
                "spotlight-theme-select",
            );
            if (spotlightThemeSelect)
                spotlightThemeSelect.value =
                    result.general_spotlightTheme === "light"
                        ? "light"
                        : "dark";

            const autoGrowGroupsOnItemAdd =
                result.general_autoGrowGroupsOnItemAdd !== false;
            window.autoGrowGroupsOnItemAdd = autoGrowGroupsOnItemAdd;
            const autoGrowGroupsToggle = document.getElementById(
                "auto-grow-groups-toggle",
            );
            if (autoGrowGroupsToggle)
                autoGrowGroupsToggle.checked = autoGrowGroupsOnItemAdd;

            // Remote favicons (default on) — privacy gate for icon requests.
            const remoteAllowed = result.general_remoteFavicons !== false;
            window.remoteFaviconsEnabled = remoteAllowed;
            const remoteFaviconsToggle = document.getElementById(
                "remote-favicons-toggle",
            );
            if (remoteFaviconsToggle)
                remoteFaviconsToggle.checked = remoteAllowed;

            // Clock options
            const clockFormat = result.general_clockFormat || "24h";
            const clockSeconds = result.general_clockSeconds !== false;
            const clockDate = result.general_clockDate !== false;

            const clockFormatSelect = document.getElementById(
                "clock-format-select",
            );
            if (clockFormatSelect) clockFormatSelect.value = clockFormat;
            const clockSecondsToggle = document.getElementById(
                "clock-seconds-toggle",
            );
            if (clockSecondsToggle) clockSecondsToggle.checked = clockSeconds;
            const clockDateToggle =
                document.getElementById("clock-date-toggle");
            if (clockDateToggle) clockDateToggle.checked = clockDate;

            // Clock show/hide
            const showClock = result.general_clockShow !== false;
            if (showClock) {
                const toggle = document.getElementById("clock-toggle");
                if (toggle) toggle.checked = true;
            }
            initClock(showClock, {
                format: clockFormat,
                showSeconds: clockSeconds,
                showDate: clockDate,
            });

            // Greeting show/hide (independent of the clock)
            const showGreeting = result.general_greetingShow !== false;
            const greetingToggle = document.getElementById("greeting-toggle");
            if (greetingToggle) greetingToggle.checked = showGreeting;
            const greetingName = result.general_greetingName || "";
            const greetingNameInput =
                document.getElementById("greeting-name-input");
            if (greetingNameInput) greetingNameInput.value = greetingName;
            setGreetingName(greetingName);
            setGreetingVisible(showGreeting);

            window.dispatchEvent(new CustomEvent("rt:global-settings-loaded"));
        },
    );
}

// Global safety net: a single unhandled rejection or uncaught error during
// async work should be logged, never leave the page silently half-initialised.
window.addEventListener("unhandledrejection", (event) => {
    console.error("[startup] Unhandled promise rejection:", event.reason);
});
window.addEventListener("error", (event) => {
    console.error("[startup] Uncaught error:", event.error || event.message);
});

// Run a bootstrap step in isolation so one failing step cannot abort the rest
// of initialisation (which would otherwise leave a blank / frozen-looking page).
async function runStep(label, fn) {
    try {
        await fn();
    } catch (err) {
        console.error(`[startup] ${label} failed:`, err);
    }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", async () => {
    // Load locale catalogs and translate static HTML before anything renders,
    // so no English flashes before the user's language is applied.
    await runStep("i18n", initI18n);

    // Load global settings first; workspace visuals are applied after workspace state loads
    await runStep("global settings", loadGlobalSettings);

    // Populate + wire the Settings → General language switcher
    await runStep("language selector", initLanguageSelector);

    // Load saved theme editor overrides for the active workspace/theme state
    await runStep("theme editor state", loadThemeEditorState);

    // Refresh DOM elements references
    await runStep("dom refs", refreshDomElements);

    // Initialize event handlers for all UI elements
    await runStep("event handlers", initEventHandlers);
    await runStep("empty-workspace onboarding", initEmptyWorkspaceOnboarding);

    // Initialize workspaces (this will load the active workspace)
    await runStep("workspaces", initWorkspaces);
    await runStep("workspace event handlers", initWorkspaceEventHandlers);

    // Notes entry button (off-grid, workspace-scoped markdown notes hub).
    // After workspaces so protection state + the active workspace are known.
    await runStep("notes", initNotes);

    // Tasks entry button (workspace-scoped todo hub + reminder poller).
    await runStep("tasks", initTodo);

    // Note: createItems is now called by initWorkspaces after loading workspace data
    // So we don't need to call it here anymore

    // Initialize keyboard spotlight ('/' shortcut)
    await runStep("spotlight", initSpotlight);

    // Flush any debounced grid save before the tab closes/navigates away
    window.addEventListener("beforeunload", () => flushGridState());
});
