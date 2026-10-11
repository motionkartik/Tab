import {
    currentWorkspace,
    isSwitching,
    protectedIds,
    sessionKeys,
    workspaceOrder,
    workspacesData,
    workspaceNames,
    managedBoardIds,
    setCurrentWorkspace,
    setIsSwitching,
    setWorkspaceOrder,
    setProtectedIds,
    getWorkspaceGroups,
    setWorkspaceGroups,
    isManagedBoardId,
    isReadOnlyManagedBoard,
} from "./workspace-state.js";
import { t } from "../i18n.js";
import { decryptData, deriveKey } from "../crypto-utils.js";
import { boardColumnsFromPayload } from "../grid-columns.js";
import {
    saveWorkspacesToStorage,
    persistWorkspaceState,
} from "./workspace-storage.js";
import { showPassphraseModal } from "./workspace-protection.js";
import {
    loadCurrentWorkspace,
    updateEmptyWorkspaceMessage,
} from "./workspace-grid-sync.js";
import { flushGridState } from "../dom-manager/grid-state.js";
import { renderWorkspaceTabs, updateActiveTab } from "./workspace-tabs-ui.js";
import { applyWorkspaceVisualSettings } from "./workspace-visuals.js";
import { closeAllDrawers } from "../drawer-manager.js";
import { getElements } from "../variables.js";
import {
    deleteWorkspaceNotes,
    moveWorkspaceNotes,
} from "../notes/notes-storage.js";
import {
    deleteWorkspaceTodos,
    moveWorkspaceTodos,
} from "../todo/todo-storage.js";
import {
    clearRemindersForWorkspace,
    moveRemindersToWorkspace,
} from "../todo/todo-reminders.js";
import {
    ensureWorkspaceUid,
    removeWorkspaceMetadata,
    renameWorkspaceMetadata,
} from "./workspace-metadata.js";
import { getLocal } from "../storage-local.js";

const moveWorkspaceBackgroundStorage = (fromWorkspaceId, toWorkspaceId) => {
    getLocal([`workspace_bg_${fromWorkspaceId}`], (result) => {
        const bg = result[`workspace_bg_${fromWorkspaceId}`];
        if (!bg) return;
        // Write-then-remove: the choke point orders it so the background is
        // never absent under both ids.
        void persistWorkspaceState(
            { [`workspace_bg_${toWorkspaceId}`]: bg },
            { removeKeys: [`workspace_bg_${fromWorkspaceId}`] },
        );
    });
};

const removeWorkspaceBackgroundStorage = (workspaceId) => {
    void persistWorkspaceState(
        {},
        { removeKeys: [`workspace_bg_${workspaceId}`] },
    );
};

export const applyWorkspaceBackground = (workspaceId) => {
    void applyWorkspaceVisualSettings(workspaceId);
};

export const handleMoveGroupRequest = (groupName) => {
    if (isReadOnlyManagedBoard(currentWorkspace)) return;
    const targets = workspaceOrder.filter((id) => id !== currentWorkspace && !isReadOnlyManagedBoard(id));
    if (targets.length === 0) {
        alert(t("wa37_no_other_ws"));
        return;
    }

    const modal = document.getElementById("move-group-modal");
    const nameEl = document.getElementById("move-group-modal-name");
    const select = document.getElementById("move-group-modal-select");
    const errorEl = document.getElementById("move-group-modal-error");
    if (!modal) return;

    nameEl.textContent = groupName;
    errorEl.textContent = "";
    select.innerHTML = "";

    targets.forEach((id) => {
        const displayName = id === "default" ? t("wa37_start") : id.replace(/-/g, " ");
        const isLocked = protectedIds.includes(id) && !sessionKeys.has(id);
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = displayName + (isLocked ? " 🔒" : "");
        select.appendChild(opt);
    });

    modal.style.display = "flex";

    const okBtn = document.getElementById("move-group-modal-ok");
    const cancelBtn = document.getElementById("move-group-modal-cancel");

    const close = () => {
        modal.style.display = "none";
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modal.onclick = null;
    };

    cancelBtn.onclick = close;
    modal.onclick = (e) => {
        if (e.target === modal) close();
    };

    okBtn.onclick = async () => {
        const targetId = select.value;
        if (isReadOnlyManagedBoard(currentWorkspace) || isReadOnlyManagedBoard(targetId)) return;
        const isLocked =
            protectedIds.includes(targetId) && !sessionKeys.has(targetId);
        if (isLocked) {
            errorEl.textContent = t("wa37_ws_locked_switch");
            return;
        }

        flushGridState();

        const currentGroups = getWorkspaceGroups(currentWorkspace);
        const idx = currentGroups.findIndex((g) => g.name === groupName);
        if (idx === -1) {
            close();
            return;
        }

        const [group] = currentGroups.splice(idx, 1);
        setWorkspaceGroups(currentWorkspace, currentGroups);

        if (!getWorkspaceGroups(targetId)) setWorkspaceGroups(targetId, []);

        const targetGroups = getWorkspaceGroups(targetId);
        const maxBottom = targetGroups.reduce(
            (max, w) => Math.max(max, (w.y || 0) + (w.h || 12)),
            0,
        );
        setWorkspaceGroups(targetId, [
            ...targetGroups,
            { ...group, x: 0, y: maxBottom },
        ]);

        await saveWorkspacesToStorage();
        loadCurrentWorkspace();
        close();
    };
};

export const switchWorkspace = async (workspaceId) => {
    if (isSwitching) return;
    if (!workspacesData.workspaces.hasOwnProperty(workspaceId)) {
        console.warn(`Workspace "${workspaceId}" not found`);
        return;
    }

    setIsSwitching(true);
    document
        .querySelectorAll(".workspace-tab, .workspace-overflow-trigger")
        .forEach((t) => {
            t.style.pointerEvents = "none";
            t.classList.add("switching");
        });

    try {
        flushGridState();

        if (protectedIds.includes(workspaceId)) {
            const existingKey = sessionKeys.get(workspaceId);
            if (!existingKey) {
                const passphrase = await showPassphraseModal({
                    title: t("wa37_protected_ws_title"),
                    desc: t("wa37_passphrase_desc", [workspaceId.replace(/-/g, " ")]),
                });
                if (!passphrase) return;

                try {
                    const stored = await new Promise((r) =>
                        getLocal(
                            [`workspace_protected_${workspaceId}`],
                            r,
                        ),
                    );
                    const meta = stored[`workspace_protected_${workspaceId}`];
                    if (!meta) throw new Error("No encrypted data found.");
                    const key = await deriveKey(passphrase, meta.salt);
                    const plaintext = await decryptData(
                        key,
                        meta.iv,
                        meta.data,
                    );
                    sessionKeys.set(workspaceId, key);
                    // 12-column-era blobs (no gridColumns stamp) double here.
                    setWorkspaceGroups(
                        workspaceId,
                        boardColumnsFromPayload(meta, JSON.parse(plaintext)),
                    );
                } catch (e) {
                    alert(t("wa37_incorrect_passphrase"));
                    return;
                }
            } else {
                try {
                    const stored = await new Promise((r) =>
                        getLocal(
                            [`workspace_protected_${workspaceId}`],
                            r,
                        ),
                    );
                    const meta = stored[`workspace_protected_${workspaceId}`];
                    if (meta) {
                        const plaintext = await decryptData(
                            existingKey,
                            meta.iv,
                            meta.data,
                        );
                        setWorkspaceGroups(
                            workspaceId,
                            boardColumnsFromPayload(
                                meta,
                                JSON.parse(plaintext),
                            ),
                        );
                    }
                } catch (e) {
                    console.error(
                        "[switchWorkspace] Failed to re-decrypt protected workspace:",
                        workspaceId,
                        e,
                    );
                }
            }
        }

        // Restore branding if leaving a managed board
        setCurrentWorkspace(workspaceId);
        workspacesData.activeWorkspace = workspaceId;

        closeAllDrawers();
        updateActiveTab(workspaceId);
        loadCurrentWorkspace();
        applyWorkspaceBackground(workspaceId);

        await saveWorkspacesToStorage();

        // Let off-grid, workspace-scoped features (e.g. the Notes hub) react to
        // the active workspace changing.
        window.dispatchEvent(
            new CustomEvent("rt:workspace-switched", {
                detail: { workspaceId },
            }),
        );
    } finally {
        setIsSwitching(false);
        document
            .querySelectorAll(".workspace-tab, .workspace-overflow-trigger")
            .forEach((t) => {
                t.style.pointerEvents = "";
                t.classList.remove("switching");
            });
    }
};

export const saveCurrentWorkspaceState = () => {
    setWorkspaceGroups(currentWorkspace, getElements());
};

export const addWorkspace = (name) => {
    const id = name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    if (!id) {
        alert(t("setspc_rename_error"));
        return null;
    }

    if (workspacesData.workspaces[id]) {
        alert(t("wa37_ws_exists", [name]));
        return null;
    }

    setWorkspaceGroups(id, []);
    setWorkspaceOrder([...workspaceOrder, id]);
    workspaceNames[id] = name;

    void ensureWorkspaceUid(id);
    saveWorkspacesToStorage();
    renderWorkspaceTabs();

    return id;
};

export const clearWorkspaceGroups = async (workspaceId) => {
    if (!workspaceId || !workspacesData.workspaces[workspaceId]) {
        return false;
    }

    if (isManagedBoardId(workspaceId)) {
        alert(t("wa37_managed_no_clear"));
        return false;
    }

    if (protectedIds.includes(workspaceId) && !sessionKeys.has(workspaceId)) {
        alert(t("wa37_protected_locked_switch"));
        return false;
    }

    const displayName =
        workspaceId === "default"
            ? workspaceNames[workspaceId] || t("wa37_start")
            : workspaceNames[workspaceId] || workspaceId.replace(/-/g, " ");

    if (
        !confirm(
            t("wa37_clear_board_confirm", [displayName]),
        )
    ) {
        return false;
    }

    if (workspaceId === currentWorkspace) {
        flushGridState();
    }

    setWorkspaceGroups(workspaceId, []);
    await saveWorkspacesToStorage();

    if (workspaceId === currentWorkspace) {
        loadCurrentWorkspace();
    }

    return true;
};

export const deleteWorkspace = async (workspaceId) => {
    if (workspaceId === "default") {
        alert(t("wa37_no_delete_default"));
        return false;
    }

    if (!workspacesData.workspaces[workspaceId]) {
        return false;
    }

    const {
        getPublisherRecordsForWorkspaceId,
        markPublisherSourceMissingByWorkspaceId,
    } = await import("../managed-boards.js");
    const linkedBoards = await getPublisherRecordsForWorkspaceId(workspaceId);
    const deleteMessage = linkedBoards.length
        ? t("wa37_delete_ws_managed", [workspaceId, linkedBoards.length, linkedBoards.length === 1 ? "" : "s"])
        : t("wa37_delete_ws_confirm", [workspaceId]);

    if (!confirm(deleteMessage)) {
        return false;
    }

    if (linkedBoards.length) {
        await markPublisherSourceMissingByWorkspaceId(workspaceId);
    }

    delete workspacesData.workspaces[workspaceId];
    delete workspaceNames[workspaceId];
    delete workspacesData.workspaceVisuals?.[workspaceId];
    removeWorkspaceBackgroundStorage(workspaceId);
    void deleteWorkspaceNotes(workspaceId);
    void deleteWorkspaceTodos(workspaceId);
    void clearRemindersForWorkspace(workspaceId);
    setWorkspaceOrder(workspaceOrder.filter((id) => id !== workspaceId));

    if (protectedIds.includes(workspaceId)) {
        const newProtectedIds = protectedIds.filter((id) => id !== workspaceId);
        setProtectedIds(newProtectedIds);
        void persistWorkspaceState(
            { workspace_protected_ids: newProtectedIds },
            { removeKeys: [`workspace_protected_${workspaceId}`] },
        );
        sessionKeys.delete(workspaceId);
    }

    if (currentWorkspace === workspaceId) {
        await switchWorkspace("default");
    }
    await removeWorkspaceMetadata(workspaceId);
    saveWorkspacesToStorage();
    renderWorkspaceTabs();

    return true;
};

export const renameWorkspace = (workspaceId, newName) => {
    if (!workspacesData.workspaces[workspaceId]) {
        return false;
    }

    if (workspaceId === "default") {
        void persistWorkspaceState({ defaultWorkspaceName: newName });
    } else {
        const newId = newName
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
        if (!newId) {
            alert(t("setspc_rename_error"));
            return false;
        }
        if (newId !== workspaceId && workspacesData.workspaces[newId]) {
            alert(t("wa37_ws_exists", [newName]));
            return false;
        }
        workspaceNames[newId] = newName;
        if (newId !== workspaceId) delete workspaceNames[workspaceId];
        if (newId !== workspaceId) {
            workspacesData.workspaces[newId] =
                workspacesData.workspaces[workspaceId];
            delete workspacesData.workspaces[workspaceId];

            if (workspacesData.workspaceVisuals?.[workspaceId]) {
                workspacesData.workspaceVisuals[newId] =
                    workspacesData.workspaceVisuals[workspaceId];
                delete workspacesData.workspaceVisuals[workspaceId];
            }

            moveWorkspaceBackgroundStorage(workspaceId, newId);
            void renameWorkspaceMetadata(workspaceId, newId);
            // Notes / todos / reminders are keyed by workspace id too — move
            // them or they'd silently vanish under the old key after a rename.
            void moveWorkspaceNotes(workspaceId, newId);
            void moveWorkspaceTodos(workspaceId, newId);
            void moveRemindersToWorkspace(workspaceId, newId);

            import("../managed-boards.js").then(
                ({ updatePublisherSourceWorkspaceId }) =>
                    updatePublisherSourceWorkspaceId(workspaceId, newId),
            );

            const idx = workspaceOrder.indexOf(workspaceId);
            if (idx !== -1) {
                const newOrder = [...workspaceOrder];
                newOrder[idx] = newId;
                setWorkspaceOrder(newOrder);
            }
            if (currentWorkspace === workspaceId) {
                setCurrentWorkspace(newId);
                workspacesData.activeWorkspace = newId;
            }

            if (protectedIds.includes(workspaceId)) {
                const newProtectedIds = protectedIds.map((id) =>
                    id === workspaceId ? newId : id,
                );
                setProtectedIds(newProtectedIds);
                void persistWorkspaceState({
                    workspace_protected_ids: newProtectedIds,
                });
                if (sessionKeys.has(workspaceId)) {
                    sessionKeys.set(newId, sessionKeys.get(workspaceId));
                    sessionKeys.delete(workspaceId);
                }
                getLocal(
                    [`workspace_protected_${workspaceId}`],
                    (result) => {
                        if (result[`workspace_protected_${workspaceId}`]) {
                            void persistWorkspaceState(
                                {
                                    [`workspace_protected_${newId}`]:
                                        result[
                                            `workspace_protected_${workspaceId}`
                                        ],
                                },
                                {
                                    removeKeys: [
                                        `workspace_protected_${workspaceId}`,
                                    ],
                                },
                            );
                        }
                        saveWorkspacesToStorage();
                        renderWorkspaceTabs();
                    },
                );
                return true;
            }
        }
    }

    saveWorkspacesToStorage();
    renderWorkspaceTabs();
    return true;
};
