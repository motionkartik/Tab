import {
    currentWorkspace,
    managedBoardIds,
    setWorkspaceOrder,
    workspaceNames,
    workspaceOrder,
    workspacesData,
} from "../workspaces/workspace-state.js";
import {
    clearWorkspaceGroups,
    renameWorkspace,
} from "../workspaces/workspace-actions.js";
import { getWorkspaceManagementActions } from "../workspaces/workspace-management-actions.js";
import { saveWorkspacesToStorage } from "../workspaces/workspace-storage.js";
import { renderWorkspaceTabs } from "../workspaces/workspace-tabs-ui.js";
import { settingsBtn } from "../variables.js";
import { t } from "../i18n.js";

let sortableInstance = null;
let pendingRenameWorkspaceId = null;

const HANDLE_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
        <path d="M2 2h4v4H2V2zm8 0h4v4h-4V2zM2 10h4v4H2v-4zm8 0h4v4h-4v-4z" fill="currentColor"/>
    </svg>
`;

const ACTION_ICON_MAP = {
    rename: '<span style="font-size: 14px; line-height: 1;">✏️</span>',
    protect: '<span style="font-size: 14px; line-height: 1;">🔒</span>',
    unprotect: '<span style="font-size: 14px; line-height: 1;">🔓</span>',
    "clear-groups": '<span style="font-size: 14px; line-height: 1;">🧹</span>',
    delete: '<span style="font-size: 14px; line-height: 1;">🗑️</span>',
};

const getSpacesList = () => document.getElementById("spaces-list");
const getRenameModal = () => document.getElementById("spaces-rename-modal");
const getRenameInput = () => document.getElementById("spaces-rename-input");
const getRenameError = () => document.getElementById("spaces-rename-error");
const getSpacesSectionTitle = () =>
    document.querySelector("#settings-spaces .settings-section h3");

const normalizeWorkspaceId = (name) =>
    name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

const getWorkspaceDisplayName = (workspaceId) =>
    workspaceId === "default"
        ? workspaceNames[workspaceId] || t("ssh18_default_start_name")
        : workspaceNames[workspaceId] || workspaceId.replace(/-/g, " ");

const getOrderedWorkspaceIds = () => {
    const orderedIds = [];
    const seen = new Set();

    const appendWorkspaceId = (workspaceId) => {
        if (!workspaceId || seen.has(workspaceId)) return;
        if (
            workspaceId !== "default" &&
            !managedBoardIds.has(workspaceId) &&
            !Object.prototype.hasOwnProperty.call(
                workspacesData.workspaces || {},
                workspaceId,
            )
        ) {
            return;
        }

        orderedIds.push(workspaceId);
        seen.add(workspaceId);
    };

    workspaceOrder.forEach(appendWorkspaceId);
    appendWorkspaceId("default");

    return orderedIds;
};

const showRenameError = (message) => {
    const errorEl = getRenameError();
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = "block";
};

const hideRenameError = () => {
    const errorEl = getRenameError();
    if (!errorEl) return;
    errorEl.textContent = "";
    errorEl.style.display = "none";
};

const closeRenameModal = () => {
    const modal = getRenameModal();
    const input = getRenameInput();

    pendingRenameWorkspaceId = null;
    hideRenameError();

    if (input) input.value = "";
    if (modal) modal.style.display = "none";
};

const openRenameModal = (workspaceId) => {
    if (!workspaceId || managedBoardIds.has(workspaceId)) return;

    const modal = getRenameModal();
    const input = getRenameInput();
    if (!modal || !input) return;

    pendingRenameWorkspaceId = workspaceId;
    hideRenameError();
    input.value = getWorkspaceDisplayName(workspaceId);
    modal.style.display = "flex";

    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
};

const destroySortable = () => {
    if (sortableInstance && typeof sortableInstance.destroy === "function") {
        sortableInstance.destroy();
    }
    sortableInstance = null;
};

const buildBadge = (label, className = "") => {
    const badge = document.createElement("span");
    badge.className = `spaces-item-badge${className ? ` ${className}` : ""}`;
    badge.textContent = label;
    return badge;
};

const createActionButton = (action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `spaces-action-btn settings-btn-secondary${action.className ? ` ${action.className}` : ""}`;
    button.innerHTML = ACTION_ICON_MAP[action.id] || "";
    button.title = action.label;
    button.setAttribute("aria-label", action.label);

    button.addEventListener("click", async () => {
        await action.handler();

        if (action.id !== "rename") {
            renderSpacesSettings();
        }
    });

    return button;
};

const injectClearGroupsAction = (actions, workspaceId) => {
    if (!workspaceId || managedBoardIds.has(workspaceId)) return actions;

    const clearAction = {
        id: "clear-groups",
        label: t("ssh18_clear_board"),
        className: "danger",
        handler: () => clearWorkspaceGroups(workspaceId),
    };

    const deleteIndex = actions.findIndex((action) => action.id === "delete");
    if (deleteIndex === -1) {
        return [...actions, clearAction];
    }

    return [
        ...actions.slice(0, deleteIndex),
        clearAction,
        ...actions.slice(deleteIndex),
    ];
};

const createSpaceRow = (workspaceId) => {
    const isDefault = workspaceId === "default";

    const row = document.createElement("div");
    row.className = `spaces-item${isDefault ? " is-default" : ""}`;
    row.dataset.workspace = workspaceId;

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "spaces-item-handle settings-btn-secondary";
    handle.title = t("ssh18_drag_to_reorder");
    handle.setAttribute(
        "aria-label",
        t("ssh18_aria_reorder", [getWorkspaceDisplayName(workspaceId)]),
    );
    handle.innerHTML = HANDLE_ICON;

    const content = document.createElement("div");
    content.className = "spaces-item-content";

    const titleRow = document.createElement("div");
    titleRow.className = "spaces-item-title-row";

    const name = document.createElement("span");
    name.className = "spaces-item-name";
    name.textContent = getWorkspaceDisplayName(workspaceId);
    titleRow.appendChild(name);

    if (workspaceId === currentWorkspace) {
        titleRow.appendChild(buildBadge(t("ssh18_badge_current"), "is-current"));
    }

    if (managedBoardIds.has(workspaceId)) {
        titleRow.appendChild(buildBadge(t("ssh18_badge_managed"), "is-managed"));
    }

    const subtitle = document.createElement("div");
    subtitle.className = "spaces-item-subtitle";
    subtitle.textContent = isDefault
        ? t("ssh18_subtitle_default")
        : managedBoardIds.has(workspaceId)
          ? t("ssh18_subtitle_managed", [workspaceId])
          : workspaceId;

    content.append(titleRow, subtitle);

    const actions = document.createElement("div");
    actions.className = "spaces-item-actions";

    const displayName = getWorkspaceDisplayName(workspaceId);
    const workspaceActions = injectClearGroupsAction(
        getWorkspaceManagementActions({
            workspaceId,
            displayName,
            onRename: ({ workspaceId: targetWorkspaceId }) =>
                openRenameModal(targetWorkspaceId),
        }),
        workspaceId,
    );

    workspaceActions.forEach((action) => {
        actions.appendChild(createActionButton(action));
    });

    row.append(handle, content, actions);
    return row;
};

const initSortable = (list) => {
    destroySortable();

    if (!list || getOrderedWorkspaceIds().length <= 1) return;
    if (!window.Sortable) return;

    sortableInstance = new window.Sortable(list, {
        animation: 150,
        handle: ".spaces-item-handle",
        draggable: ".spaces-item",
        ghostClass: "spaces-item-ghost",
        chosenClass: "spaces-item-chosen",
        dragClass: "spaces-item-dragging",
        onEnd: async () => {
            const orderedIds = [...list.querySelectorAll(".spaces-item")].map(
                (item) => item.dataset.workspace,
            );
            const remainingIds = workspaceOrder.filter(
                (workspaceId) => !orderedIds.includes(workspaceId),
            );

            setWorkspaceOrder([...orderedIds, ...remainingIds]);
            await saveWorkspacesToStorage();
            renderWorkspaceTabs();
            renderSpacesSettings();
        },
    });
};

const validateRename = (workspaceId, nextName) => {
    if (!workspaceId) return t("ssh18_err_no_space");
    if (managedBoardIds.has(workspaceId)) {
        return t("ssh18_err_managed_no_rename");
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) return t("ssh18_err_enter_name");

    const nextId = normalizeWorkspaceId(trimmedName);
    if (!nextId) return t("ssh18_err_invalid_name");

    if (
        nextId !== workspaceId &&
        Object.prototype.hasOwnProperty.call(
            workspacesData.workspaces || {},
            nextId,
        )
    ) {
        return t("ssh18_err_name_exists");
    }

    return "";
};

const submitRename = () => {
    const workspaceId = pendingRenameWorkspaceId;
    const input = getRenameInput();
    if (!input) return;

    const nextName = input.value.trim();
    const error = validateRename(workspaceId, nextName);

    if (error) {
        showRenameError(error);
        return;
    }

    if (workspaceId === "default") {
        workspaceNames.default = nextName;
    }

    renameWorkspace(workspaceId, nextName);
    closeRenameModal();
    renderSpacesSettings();
};

export const renderSpacesSettings = () => {
    const list = getSpacesList();
    const title = getSpacesSectionTitle();
    if (!list) return;

    // Web build: no license tiers or hosted boards — hide any legacy note.
    const proNote = document.getElementById("spaces-pro-note");
    if (proNote) proNote.hidden = true;

    if (title) {
        const titleLabel = title.querySelector("span");
        if (titleLabel) {
            titleLabel.textContent = t("ssh18_title_workspaces");
        } else {
            title.textContent = t("ssh18_title_workspaces");
        }
    }

    destroySortable();
    list.innerHTML = "";

    const workspaceIds = getOrderedWorkspaceIds();

    workspaceIds.forEach((workspaceId) => {
        list.appendChild(createSpaceRow(workspaceId));
    });

    initSortable(list);

};

export const initSettingsSpacesHandlers = () => {
    const spacesTab = document.querySelector(
        '.settings-tab[data-tab="spaces"]',
    );
    const renameCancelBtn = document.getElementById("spaces-rename-cancel");
    const renameSaveBtn = document.getElementById("spaces-rename-save");
    const renameInput = getRenameInput();
    const renameModal = getRenameModal();

    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            renderSpacesSettings();
            closeRenameModal();
        });
    }

    if (spacesTab) {
        spacesTab.addEventListener("click", () => {
            renderSpacesSettings();
            closeRenameModal();
        });
    }

    if (renameCancelBtn) {
        renameCancelBtn.addEventListener("click", closeRenameModal);
    }

    if (renameSaveBtn) {
        renameSaveBtn.addEventListener("click", submitRename);
    }

    if (renameInput) {
        renameInput.addEventListener("input", hideRenameError);
        renameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
            } else if (event.key === "Escape") {
                event.preventDefault();
                closeRenameModal();
            }
        });
    }

    if (renameModal) {
        renameModal.addEventListener("click", (event) => {
            if (event.target === renameModal) {
                closeRenameModal();
            }
        });
    }

    renderSpacesSettings();
};
