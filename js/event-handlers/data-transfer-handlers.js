import {
    exportDataBtn,
    importDataBtn,
    importDataInput,
    settingsModal,
} from "../variables.js";

import {
    loadCurrentWorkspace,
} from "../workspaces/workspace-grid-sync.js";
import {
    getWorkspacesData,
    setWorkspacesData,
    protectedIds,
    sessionKeys,
} from "../workspaces/workspace-state.js";
import { renderWorkspaceTabs } from "../workspaces/workspace-tabs-ui.js";
import { saveWorkspacesToStorage } from "../workspaces/workspace-storage.js";

import { t } from "../i18n.js";
import { compactLayout } from "../dom-manager/compact-layout.js";
import { sanitizeWorkspaceMap } from "../untrusted-input.js";
import { GRID_COLS, doubleBoardColumns } from "../grid-columns.js";
import { getLocal, setLocal } from "../storage-local.js";

// Global (non-workspace) settings included in backups alongside the boards.
// Prefix-based so future `general_*` keys are picked up automatically:
//   general_*            all Settings values (greeting name, clock format,
//                        search engine, favicon privacy, language, …)
//   todo_reminders       scheduled task reminders (global, not per-workspace)
//   workspace_notes_*    per-workspace notes hubs
//   workspace_todos_*    per-workspace todo hubs
const SETTINGS_KEY_RE = /^(general_.+|todo_reminders|workspace_notes_.+|workspace_todos_.+)$/;

const collectSettingsBackup = async () => {
    const settings = {};
    try {
        const all = await getLocal(null);
        for (const [key, value] of Object.entries(all || {})) {
            if (!SETTINGS_KEY_RE.test(key) || value === undefined) continue;
            // Plain JSON values only — never functions or class instances.
            if (
                value === null ||
                ["string", "number", "boolean"].includes(typeof value)
            ) {
                settings[key] = value;
            }
        }
    } catch {
        /* backup proceeds without settings */
    }
    return settings;
};

const restoreSettingsBackup = async (settings) => {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return false;
    }
    const clean = {};
    for (const [key, value] of Object.entries(settings)) {
        if (!SETTINGS_KEY_RE.test(key) || value === undefined) continue;
        if (
            value === null ||
            ["string", "number", "boolean"].includes(typeof value)
        ) {
            clean[key] = value;
        }
    }
    if (Object.keys(clean).length === 0) return false;
    await setLocal(clean);
    return true;
};

const migrateLegacyGroups = (groups) =>
    groups.map((group, index) => ({
        ...group,
        id: group.id || group.name || `group-${index}`,
        name: group.name || "Group",
        items: (group.items || []).map((item, itemIndex) => ({
            ...item,
            name: item.name || "",
            url: item.url || "",
            icon: item.icon || "",
            type: item.type || "link",
            y: item.y ?? itemIndex,
        })),
        x: group.x ?? 0,
        y: group.y ?? index * 12,
        w: group.w ?? 4,
        h: group.h ?? 12,
    }));

const normaliseParsed = (parsed) => {
    if (
        parsed &&
        parsed.workspaces &&
        typeof parsed.workspaces === "object" &&
        !Array.isArray(parsed.workspaces)
    ) {
        // Coerce every workspace value to an array and drop hostile/unknown
        // keys. Without this, a hand-edited or truncated backup such as
        // {"workspaces":{"default":null}} imported "successfully" and then
        // crashed every new tab in the renderers (which assume arrays).
        const workspaces = sanitizeWorkspaceMap(parsed.workspaces);
        if (Object.keys(workspaces).length === 0) {
            throw new Error(t("dth10_no_valid_workspaces"));
        }

        // Backups from the 12-column era (no gridColumns field) get their
        // top-level x/w doubled into the 24-column grid — once, never twice
        // (current exports carry the stamp).
        if (parsed.gridColumns !== GRID_COLS) {
            for (const workspaceId of Object.keys(workspaces)) {
                if (Array.isArray(workspaces[workspaceId])) {
                    workspaces[workspaceId] = doubleBoardColumns(
                        workspaces[workspaceId],
                    );
                }
            }
        }

        // Make sure activeWorkspace points at a workspace that actually exists.
        const activeWorkspace =
            typeof parsed.activeWorkspace === "string" &&
            workspaces[parsed.activeWorkspace]
                ? parsed.activeWorkspace
                : workspaces.default
                  ? "default"
                  : Object.keys(workspaces)[0];

        // Keep the remaining metadata (order/names/visuals/styles) — it flows
        // through setWorkspacesData's own normalizers, which tolerate garbage.
        return { ...parsed, workspaces, activeWorkspace };
    }

    // Bare-array formats predate the 24-column grid — always double.
    if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        !Array.isArray(parsed[0])
    ) {
        return {
            workspaces: {
                default: doubleBoardColumns(migrateLegacyGroups(parsed)),
            },
            activeWorkspace: "default",
        };
    }

    if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        Array.isArray(parsed[0])
    ) {
        const allGroups = parsed.flat();
        return {
            workspaces: {
                default: doubleBoardColumns(migrateLegacyGroups(allGroups)),
            },
            activeWorkspace: "default",
        };
    }

    throw new Error(
        "Unrecognised format — expected a workspaces export or a legacy groups array.",
    );
};

const runImport = (file) => {
    if (
        !confirm(t("dth10_replace_confirm"))
    ) {
        importDataInput.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
        alert(t("dth10_read_failed"));
    };
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            const data = normaliseParsed(parsed);
            setWorkspacesData(data);
            saveWorkspacesToStorage();
            renderWorkspaceTabs();
            loadCurrentWorkspace();
            importDataInput.value = "";
            // Backups also carry global settings (greeting name, clock
            // format, search engine, …). They only take effect on a fresh
            // boot, so reload instead of just closing the modal.
            restoreSettingsBackup(parsed.settings).then((restored) => {
                if (restored) {
                    location.reload();
                    return;
                }
                settingsModal.classList.remove("active");
                alert(t("dth10_import_success"));
            });
        } catch (error) {
            alert(t("dth10_import_failed", [error.message]));
        }
    };
    reader.readAsText(file);
};

export const initDataTransferHandlers = () => {
    if (exportDataBtn) {
        exportDataBtn.addEventListener("click", async () => {
            const data = getWorkspacesData();

            // Exclude workspaces that are protected and currently locked (not unlocked this session).
            // A locked protected workspace has no data in memory anyway (stored encrypted),
            // so exporting it would only emit an empty array — confusing and potentially misleading.
            const lockedIds = protectedIds.filter((id) => !sessionKeys.has(id));
            const exportWorkspaces = { ...data.workspaces };
            lockedIds.forEach((id) => delete exportWorkspaces[id]);

            if (lockedIds.length > 0) {
                const names = lockedIds
                    .map((id) => id.replace(/-/g, " "))
                    .join(", ");
                alert(t("dth10_locked_excluded", [lockedIds.length, names]));
            }

            const exportData = {
                ...data,
                workspaces: exportWorkspaces,
                gridColumns: GRID_COLS,
                settings: await collectSettingsBackup(),
            };
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `startpage-backup-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
        });
    }

    if (importDataBtn && importDataInput) {
        importDataBtn.addEventListener("click", () => {
            const file = importDataInput.files[0];
            if (!file) {
                importDataInput.click();
                return;
            }
            runImport(file);
        });

        importDataInput.addEventListener("change", () => {
            const file = importDataInput.files[0];
            if (file) runImport(file);
        });
    }

    const importBookmarksBtn = document.getElementById("import-bookmarks-btn");
    importBookmarksBtn?.addEventListener("click", async () => {
        const { openBookmarkImport } = await import("../bookmark-import.js");
        await openBookmarkImport();
    });

    document.getElementById("sharing-hub-open-btn")?.addEventListener("click", async () => {
        const { openSharingHub } = await import("../sharing-hub.js");
        await openSharingHub();
    });

    const compactLayoutBtn = document.getElementById("compact-layout-btn");
    if (compactLayoutBtn) {
        compactLayoutBtn.addEventListener("click", () => compactLayout());
    }


};
