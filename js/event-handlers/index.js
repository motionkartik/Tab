import { initThemeEditor } from "../theme-editor/init.js";

import { initWorkspaceItemHandlers } from "./workspace-item-handlers.js";
import { initSettingsModalHandlers } from "./settings-modal-handlers.js";
import { initSettingsBackgroundHandlers } from "./settings-background-handlers.js";
import { initSettingsLayoutHandlers } from "./settings-layout-handlers.js";
import { initSettingsGeneralHandlers } from "./settings-general-handlers.js";
import { initSettingsSpacesHandlers } from "./settings-spaces-handlers.js";
import { initItemEditorUiHandlers } from "./item-editor-ui-handlers.js";
import { initDataTransferHandlers } from "./data-transfer-handlers.js";
import { initGlobalUiHandlers } from "./global-ui-handlers.js";
import { initStarterSuggestionsHandlers } from "./starter-suggestions-handlers.js";
import { initSettingsHelp } from "../settings-help.js";

export function refreshWorkspaceBgBadge() {
    // Background is now per-workspace for all users — badge no longer needed
}

export const initEventHandlers = () => {
    refreshWorkspaceBgBadge();

    initWorkspaceItemHandlers();
    initSettingsModalHandlers();
    initSettingsBackgroundHandlers();
    initSettingsLayoutHandlers();
    initSettingsGeneralHandlers();
    initSettingsSpacesHandlers();
    initItemEditorUiHandlers();
    initDataTransferHandlers();
    initGlobalUiHandlers();
    initStarterSuggestionsHandlers();
    initSettingsHelp();

    initThemeEditor();
};
