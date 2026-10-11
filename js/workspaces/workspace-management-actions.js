import {
    managedBoardIds,
    protectedIds,
} from "./workspace-state.js";
import {
    deleteWorkspace,
    renameWorkspace,
} from "./workspace-actions.js";
import {
    protectWorkspace,
    unprotectWorkspace,
} from "./workspace-protection.js";
import { t } from "../i18n.js";

/**
 * Resolve a workspace display name using the same fallback rules as the tabs UI.
 */
export const getWorkspaceDisplayName = (
    workspaceId,
    defaultName = t("wma38_default_workspace_name"),
    workspaceNames = {},
) =>
    workspaceId === "default"
        ? defaultName
        : workspaceNames[workspaceId] || workspaceId.replace(/-/g, " ");

/**
 * Default rename flow used by the workspace tab context menu.
 * Consumers such as the Spaces settings tab can inject their own rename handler.
 */
export const defaultRenameWorkspaceHandler = async ({
    workspaceId,
    displayName,
}) => {
    const nextName = prompt(t("wma38_rename_prompt"), displayName);
    if (!nextName || !nextName.trim()) return;
    renameWorkspace(workspaceId, nextName.trim());
};

const createAction = ({
    id,
    label,
    icon,
    section,
    className = "",
    handler,
}) => ({
    id,
    label,
    icon,
    section,
    className,
    handler,
});

/**
 * Build the shared workspace-management action list for a workspace.
 *
 * The returned structure is intentionally UI-agnostic so it can be used by:
 * - the top tab right-click context menu
 * - the Spaces settings tab inline action buttons
 *
 * Each action has:
 * - id
 * - label
 * - icon
 * - section: used by consumers to add separators/grouping
 * - className: e.g. "danger"
 * - handler: async/sync function to execute
 *
 * Web build: all features are free (no license gates), and cloud features
 * (managed-board subscriptions, workspace sharing, public boards) do not
 * exist. `managedBoardIds` is therefore always empty, but the guard is kept
 * for safety.
 */
export const getWorkspaceManagementActions = ({
    workspaceId,
    displayName,
    onRename = defaultRenameWorkspaceHandler,
} = {}) => {
    if (!workspaceId) return [];

    const isManaged = managedBoardIds.has(workspaceId);
    const isProtected = protectedIds.includes(workspaceId);

    if (isManaged) {
        return [];
    }

    const actions = [
        createAction({
            id: "rename",
            label: t("wma38_label_rename"),
            icon: "✏️",
            section: "main",
            handler: () => onRename({ workspaceId, displayName }),
        }),
    ];

    // Local passphrase protection is free for everyone in the web build.
    actions.push(
        isProtected
            ? createAction({
                  id: "unprotect",
                  label: t("wma38_label_unprotect"),
                  icon: "🔓",
                  section: "security",
                  handler: () => unprotectWorkspace(workspaceId),
              })
            : createAction({
                  id: "protect",
                  label: t("wma38_label_protect"),
                  icon: "🔒",
                  section: "security",
                  handler: () => protectWorkspace(workspaceId),
              }),
    );

    if (workspaceId !== "default") {
        actions.push(
            createAction({
                id: "delete",
                label: t("wma38_label_delete"),
                icon: "🗑️",
                section: "danger",
                className: "danger",
                handler: () => deleteWorkspace(workspaceId),
            }),
        );
    }

    return actions;
};
