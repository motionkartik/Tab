import {
    currentWorkspace,
    workspacesData,
    setCurrentWorkspace,
    setWorkspaceOrder,
    workspaceOrder,
    workspaceNames,
    protectedIds,
    sessionKeys,
    updateWorkspaceVisualSettings,
} from "./workspace-state.js";
import {
    setWorkspaceUpdateCallback,
    setMoveGroupCallback,
    flushGridState,
} from "../dom-manager/grid-state.js";
import {
    updateWorkspaceGroups,
    loadCurrentWorkspace,
} from "./workspace-grid-sync.js";
import {
    handleMoveGroupRequest,
    applyWorkspaceBackground,
    switchWorkspace,
} from "./workspace-actions.js";
import { renderWorkspaceTabs } from "./workspace-tabs-ui.js";
import { loadProtectedIds } from "./workspace-protection.js";
import {
    saveWorkspacesToStorage,
    applyStorageResult,
} from "./workspace-storage.js";
import {
    GRID_COLS,
    GRID_COLS_STORAGE_KEY,
    doubleBoardColumns,
} from "../grid-columns.js";
import { persistWorkspaceVisuals } from "./workspace-visuals.js";
import { ensureWorkspaceMetadataForIds } from "./workspace-metadata.js";
import { getLocal, removeLocal } from "../storage-local.js";

export const initWorkspaces = async () => {
    setWorkspaceUpdateCallback(updateWorkspaceGroups);

    setMoveGroupCallback(handleMoveGroupRequest);

    await loadProtectedIds();

    getLocal(
        [
            "workspaces",
            "_icons",
            "workspaceOrder",
            "workspaceNames",
            "activeWorkspace",
            "workspaceVisuals",
            GRID_COLS_STORAGE_KEY,
        ],
        async (result) => {
            // One-shot 12→24 column migration: data written before the
            // `grid_columns` key existed is in 12-column space — double every
            // top-level entry's x/w so it renders pixel-identical on the
            // 24-column grid. Protected workspaces are encrypted sentinels
            // here; their blobs migrate at decrypt time via the blob's own
            // `gridColumns` stamp (workspace-storage/-actions/-protection).
            const needsColumnMigration =
                result[GRID_COLS_STORAGE_KEY] !== GRID_COLS &&
                Boolean(result.workspaces);
            if (needsColumnMigration) {
                if (result.workspaces && typeof result.workspaces === "object") {
                    for (const [wsId, entries] of Object.entries(
                        result.workspaces,
                    )) {
                        if (Array.isArray(entries)) {
                            result.workspaces[wsId] =
                                doubleBoardColumns(entries);
                        }
                    }
                }
            }

            const legacyWorkspaceIds = [
                ...new Set(
                    (Array.isArray(result.workspaceOrder)
                        ? result.workspaceOrder
                        : Object.keys(result.workspaces || {})
                    ).concat("default"),
                ),
            ];
            const styleKeys = legacyWorkspaceIds.map(
                (id) => `workspace_style_${id}`,
            );
            const savedThemeKeys = legacyWorkspaceIds.map(
                (id) => `workspace_saved_theme_${id}`,
            );
            const legacySavedThemeKeys = legacyWorkspaceIds.map(
                (id) => `workspace_pro_theme_${id}`,
            );

            const hydratedResult = result.workspaceVisuals
                ? result
                : await new Promise((resolve) => {
                      getLocal(
                          [
                              "workspaceStyles",
                              "workspaceSavedThemes",
                              "workspaceProThemes",
                              "layout_borderRadius",
                              "layout_cardOpacity",
                              "layout_fontSize",
                              "layout_compactMode",
                              "layout_uiStyle",
                              "layout_tabUnderline",
                              "layout_showDescriptions",
                              "layout_autoFavicon",
                              ...styleKeys,
                              ...savedThemeKeys,
                              ...legacySavedThemeKeys,
                          ],
                          (legacyResult) =>
                              resolve({ ...result, ...legacyResult }),
                      );
                  });

            if (applyStorageResult(hydratedResult)) {
                // Migrate legacy workspace_style_* and saved-theme standalone keys into workspaceVisuals
                if (!hydratedResult.workspaceVisuals) {
                    workspaceOrder.forEach((id) => {
                        const style = hydratedResult[`workspace_style_${id}`];
                        if (style) {
                            updateWorkspaceVisualSettings(id, {
                                theme: style,
                            });
                        }
                        const savedThemeId =
                            hydratedResult[`workspace_saved_theme_${id}`] ||
                            hydratedResult[`workspace_pro_theme_${id}`];
                        if (savedThemeId) {
                            updateWorkspaceVisualSettings(id, {
                                savedThemeId,
                            });
                        }
                    });
                    await persistWorkspaceVisuals();
                    removeLocal([
                        ...styleKeys,
                        ...savedThemeKeys,
                        ...legacySavedThemeKeys,
                    ]);
                }
                // Persist the doubled geometry; saveWorkspacesToStorage
                // stamps `grid_columns` atomically with it, so the migration
                // runs exactly once.
                if (needsColumnMigration) {
                    await saveWorkspacesToStorage();
                }
            } else {
                // NOTE: no `rows` fallback here anymore. The legacy key
                // mirrored the ACTIVE workspace's content, so restoring it
                // into `default` after a transiently failed `workspaces` read
                // could overwrite the default board with another workspace
                // (and drop the rest of the map). Pre-workspace boards are
                // recoverable via the JSON import, which still accepts the
                // old rows-array export format.
                // No saved workspaces: start with an empty default board.
                // (The extension's dev-data seed does not ship in the web build.)
                workspacesData.workspaces = { default: [] };
                workspacesData.activeWorkspace = "default";
                setCurrentWorkspace("default");
                saveWorkspacesToStorage();
            }

            await ensureWorkspaceMetadataForIds(
                Object.keys(workspacesData.workspaces || {}).filter(
                    (workspaceId) => !workspaceId.startsWith("managed_"),
                ),
            );

            const rememberedWorkspace = workspacesData.activeWorkspace;
            const needsProtectedUnlock =
                protectedIds.includes(rememberedWorkspace) &&
                !sessionKeys.has(rememberedWorkspace);
            if (needsProtectedUnlock) {
                // Render a safe board behind the passphrase prompt; a locked
                // workspace must not look like an empty, editable workspace.
                setCurrentWorkspace("default");
                workspacesData.activeWorkspace = "default";
            }

            renderWorkspaceTabs();
            loadCurrentWorkspace();
            applyWorkspaceBackground(currentWorkspace);
            if (needsProtectedUnlock) void switchWorkspace(rememberedWorkspace);
        },
    );
};

export const initWorkspaceEventHandlers = () => {
    document.addEventListener("click", async (e) => {
        const { closeContextMenu } = await import("./workspace-tabs-ui.js");
        if (closeContextMenu && !e.target.closest(".workspace-context-menu")) {
            closeContextMenu();
        }
    });

    const addBtn = document.getElementById("add-workspace-btn");
    if (addBtn) {
        addBtn.onclick = async () => {
            const name = prompt("Enter workspace name:");
            if (name && name.trim()) {
                const { addWorkspace, switchWorkspace } =
                    await import("./workspace-actions.js");
                const newId = addWorkspace(name.trim());
                if (newId) switchWorkspace(newId);
            }
        };
    }

    const floatingAddGroupBtn = document.getElementById(
        "floating-add-group-btn",
    );
    if (floatingAddGroupBtn) {
        floatingAddGroupBtn.onclick = async () => {
            const { openGroupDrawer } =
                await import("../event-handlers/workspace-item-handlers.js");
            openGroupDrawer();
        };
    }
};
