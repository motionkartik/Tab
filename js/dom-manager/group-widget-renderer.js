import {
    getElements,
    setElements,
    setCurrentGroup,
    setLinkMode,
    setLinkIndex,
    linkBackdrop,
    linkInput,
    urlInput,
    svgInput,
    choosenIconAddLink,
} from "../variables.js";
import { initIconPicker, setGroupIcons } from "../icon-picker.js";
import { showUndoToast } from "../undo-manager.js";
import {
    clearRemindersForList,
    restoreReminders,
} from "../todo/todo-reminders.js";
import { getCurrentWorkspace } from "../workspaces/workspace-state.js";
import { openGroupStyleEditor } from "../group-style-editor.js";
import { openGroupDrawer } from "../event-handlers/workspace-item-handlers.js";
import { renderStoredIcon, isStoredIconUrl } from "../safe-svg.js";
import { closeAllDrawers } from "../drawer-manager.js";
import { getItemRoutineEditor } from "../event-handlers/routine-steps-editor.js";
import { placeFixedPopover } from "../menu-flip.js";
import {
    saveGridState,
    flushGridState,
    getGrid,
    getWorkspaceUpdateCallback,
    getMoveGroupCallback,
    autoGrowGroupToFitItems,
} from "./grid-state.js";
import {
    activatePaintMode,
    deactivatePaintMode,
    getPaintMode,
} from "./paint-mode.js";
import { t } from "../i18n.js";

let createItemsHandler = null;

const ITEM_TYPE_LABELS = {
    link: t("gwr4_type_link"),
    header: t("gwr4_type_header"),
    divider: t("gwr4_type_divider"),
    note: t("gwr4_type_note"),
    text: t("gwr4_type_text"),
    todo: t("gwr4_type_todo"),
    clipboard: t("gwr4_type_clipboard"),
    launcher: t("gwr4_type_launcher"),
    routine: t("gwr4_type_routine"),
};

const STANDARD_GROUP_ADD_TYPE_ITEMS = [
    {
        type: "link",
        label: t("gwr4_type_link"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 263 380 319.5 380s148-56.5 204.5-112.3zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372.1 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>',
    },
    {
        type: "header",
        label: t("gwr4_type_header"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M0 64C0 46.3 14.3 32 32 32l48 0 48 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-16 0 0 112 224 0 0-112-16 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l48 0 48 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-16 0 0 144 0 176 16 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-48 0-48 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l16 0 0-176-224 0 0 176 16 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-48 0-48 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l16 0 0-176L48 96 32 96C14.3 96 0 81.7 0 64z"/></svg>',
    },
    {
        type: "divider",
        label: t("gwr4_type_divider"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M432 256c0 17.7-14.3 32-32 32L48 288c-17.7 0-32-14.3-32-32s14.3-32 32-32l352 0c17.7 0 32 14.3 32 32z"/></svg>',
    },
    {
        type: "text",
        label: t("gwr4_type_text"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l224 0 0-112c0-26.5 21.5-48 48-48l112 0 0-224c0-35.3-28.7-64-64-64L64 32zM448 352l-45.3 0L336 352c-8.8 0-16 7.2-16 16l0 66.7 0 45.3 32-32 64-64 32-32z"/></svg>',
    },
    {
        type: "clipboard",
        label: t("gwr4_type_clipboard"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>',
    },
    {
        type: "launcher",
        label: t("gwr4_type_launcher"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>',
    },
    {
        type: "routine",
        label: t("gwr4_type_routine"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.3-23-41L73 39z"/></svg>',
    },
];

const TODO_GROUP_ADD_TYPE_ITEMS = [
    {
        type: "todo",
        label: t("gwr4_type_todo"),
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M438.6 105.4l-22.6 22.6-214 214c-12.5 12.5-32.8 12.5-45.3 0l-124-124L9.4 195.3c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L179.3 274.7 393.4 60.7c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3z"/></svg>',
    },
    ...STANDARD_GROUP_ADD_TYPE_ITEMS.filter(({ type }) =>
        ["header", "divider", "text"].includes(type),
    ),
];

export const setCreateItemsHandler = (handler) => {
    createItemsHandler = handler;
};

const rerenderGrid = (elements) => {
    if (typeof createItemsHandler === "function") {
        createItemsHandler(elements, true);
    }
};

const todoComposerState = new Map();

const getTodoComposerState = (groupName) =>
    todoComposerState.get(groupName) || { open: false, focus: false };

const setTodoComposerState = (groupName, nextState) => {
    const state = {
        ...getTodoComposerState(groupName),
        ...nextState,
    };

    if (!state.open && !state.focus) {
        todoComposerState.delete(groupName);
        return { open: false, focus: false };
    }

    todoComposerState.set(groupName, state);
    return state;
};

const getTodoGroupData = (groupName) => {
    const localElements = getElements();
    const targetGroup = localElements.find(
        (widget) =>
            widget.name === groupName ||
            (widget.content && widget.content.name === groupName),
    );
    const targetItems =
        targetGroup?.items ||
        (targetGroup?.content ? targetGroup.content.items : null);

    return {
        localElements,
        targetGroup,
        targetItems,
    };
};

const addTodoTaskToGroup = (groupName, taskName) => {
    const normalizedTaskName = taskName.trim();
    if (!normalizedTaskName) return false;

    // Fold any pending debounced DOM save into in-memory state first, so a
    // still-unsaved edit elsewhere (e.g. a section text change made in the last
    // 500ms) isn't discarded when we re-render from getElements() below.
    flushGridState();

    const { localElements, targetItems } = getTodoGroupData(groupName);
    if (!targetItems) return false;

    targetItems.push({
        name: normalizedTaskName,
        type: "todo",
        done: false,
        y: targetItems.length,
    });

    const workspaceUpdateCallback = getWorkspaceUpdateCallback();
    if (workspaceUpdateCallback) workspaceUpdateCallback(localElements);
    rerenderGrid(localElements);
    if (window.autoGrowGroupsOnItemAdd !== false) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                autoGrowGroupToFitItems(groupName);
            });
        });
    }

    return true;
};

export const addLinkItemsToGroup = (groupName, newItems) => {
    if (!Array.isArray(newItems) || newItems.length === 0) return false;

    // Flush pending DOM save so a still-unsaved edit elsewhere isn't dropped
    // when we re-render from getElements() (see addTodoTaskToGroup).
    flushGridState();

    const { localElements, targetItems } = getTodoGroupData(groupName);
    if (!targetItems) return false;

    let nextY = targetItems.length;
    newItems.forEach((entry) => {
        targetItems.push({ ...entry, y: nextY });
        nextY += 1;
    });

    const workspaceUpdateCallback = getWorkspaceUpdateCallback();
    if (workspaceUpdateCallback) workspaceUpdateCallback(localElements);
    rerenderGrid(localElements);
    if (window.autoGrowGroupsOnItemAdd !== false) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                autoGrowGroupToFitItems(groupName);
            });
        });
    }

    return true;
};

// ─── Tasks-hub write-back (group-origin lists) ─────────────────────────────
// The Tasks hub mirrors board groups that contain `type:"todo"` items. Because
// the board serializes DOM-as-truth, every mutation here MUST flush pending DOM
// edits, mutate the in-memory model, persist, THEN re-render — never mutate a
// captured object and hope. Groups are resolved by `id` (not name) so duplicate
// group names are safe (see todo-hub-plan.md §9). `todoIndex` is the position
// among the group's `type:"todo"` items, matching how the hub builds its rows.

const getTodoGroupDataById = (groupId) => {
    const localElements = getElements();
    const targetGroup = localElements.find(
        (widget) =>
            widget.id === groupId ||
            (widget.content && widget.content.id === groupId),
    );
    const targetItems =
        targetGroup?.items ||
        (targetGroup?.content ? targetGroup.content.items : null);
    return { localElements, targetGroup, targetItems };
};

const commitGroupTodoChange = (localElements, groupName) => {
    const workspaceUpdateCallback = getWorkspaceUpdateCallback();
    if (workspaceUpdateCallback) workspaceUpdateCallback(localElements);
    rerenderGrid(localElements);
    if (groupName && window.autoGrowGroupsOnItemAdd !== false) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                autoGrowGroupToFitItems(groupName);
            });
        });
    }
};

export const addTodoTaskToGroupById = (groupId, taskName) => {
    const normalizedTaskName = (taskName || "").trim();
    if (!normalizedTaskName) return false;

    flushGridState();
    const { localElements, targetGroup, targetItems } =
        getTodoGroupDataById(groupId);
    if (!targetItems) return false;

    targetItems.push({
        type: "todo",
        name: normalizedTaskName,
        done: false,
        y: targetItems.length,
    });
    commitGroupTodoChange(localElements, targetGroup?.name || targetGroup?.content?.name);
    return true;
};

export const toggleGroupTodoDone = (groupId, todoIndex) => {
    flushGridState();
    const { localElements, targetItems } = getTodoGroupDataById(groupId);
    if (!targetItems) return false;
    const todo = targetItems.filter((i) => i.type === "todo")[todoIndex];
    if (!todo) return false;
    todo.done = !todo.done;
    commitGroupTodoChange(localElements);
    return true;
};

export const renameGroupTodo = (groupId, todoIndex, newName) => {
    const normalized = (newName || "").trim();
    if (!normalized) return false;
    flushGridState();
    const { localElements, targetItems } = getTodoGroupDataById(groupId);
    if (!targetItems) return false;
    const todo = targetItems.filter((i) => i.type === "todo")[todoIndex];
    if (!todo) return false;
    todo.name = normalized;
    commitGroupTodoChange(localElements);
    return true;
};

export const deleteGroupTodo = (groupId, todoIndex) => {
    flushGridState();
    const { localElements, targetItems } = getTodoGroupDataById(groupId);
    if (!targetItems) return false;
    const todo = targetItems.filter((i) => i.type === "todo")[todoIndex];
    if (!todo) return false;
    const idx = targetItems.indexOf(todo);
    if (idx < 0) return false;
    targetItems.splice(idx, 1);
    commitGroupTodoChange(localElements);
    return true;
};

export const clearCompletedGroupTodos = (groupId) => {
    flushGridState();
    const { localElements, targetItems } = getTodoGroupDataById(groupId);
    if (!targetItems) return false;
    const kept = targetItems.filter((i) => !(i.type === "todo" && i.done));
    if (kept.length === targetItems.length) return false;
    // Mutate in place so the group keeps its same items-array reference.
    targetItems.length = 0;
    targetItems.push(...kept);
    commitGroupTodoChange(localElements);
    return true;
};

const renderGroupHeaderIcon = (
    container,
    iconMarkup,
    iconColor = "",
    iconSize = "",
) => {
    if (!container) return false;

    const normalizedSize = Math.max(12, parseInt(iconSize, 10) || 16);
    const sizePx = `${normalizedSize}px`;

    container.replaceChildren();
    container.style.display = "none";
    container.style.setProperty("--group-icon-size", sizePx);

    if (!iconMarkup) return false;

    const rendered = renderStoredIcon(container, iconMarkup, {
        imgWidth: normalizedSize,
        imgHeight: normalizedSize,
    });
    if (!rendered) return false;

    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.flexShrink = "0";

    const svg = container.querySelector("svg");
    if (svg) {
        svg.style.width = "100%";
        svg.style.height = "100%";
        if (iconColor && !isStoredIconUrl(iconMarkup)) {
            svg.style.fill = iconColor;
            svg.style.color = iconColor;
        }
    }

    const img = container.querySelector("img");
    if (img) {
        img.style.width = "100%";
        img.style.height = "100%";
    }

    return true;
};

export const openAddItemModal = (group, type) => {
    setCurrentGroup(group.name);
    setLinkMode("new");
    setLinkIndex(0);
    if (linkInput) linkInput.value = "";
    if (urlInput) urlInput.value = "";
    if (svgInput) svgInput.value = "";
    if (choosenIconAddLink)
        choosenIconAddLink.innerHTML = t("gwr4_no_icon_chosen");

    const iconColorInput = document.getElementById("icon-color-value");
    if (iconColorInput) iconColorInput.value = "";
    const iconColorPicker = document.getElementById("icon-color-picker");
    if (iconColorPicker) iconColorPicker.value = "#888888";
    document
        .querySelectorAll(".icon-color-swatch")
        .forEach((sw) => sw.classList.remove("selected"));

    const linkStyleTextValue = document.getElementById("link-style-text-value");
    if (linkStyleTextValue) linkStyleTextValue.value = "";
    const linkStyleColorPicker = document.getElementById(
        "link-style-text-color",
    );
    if (linkStyleColorPicker) linkStyleColorPicker.value = "#888888";

    const descInputReset = document.getElementById("linkDescription");
    if (descInputReset) descInputReset.value = "";

    document
        .querySelectorAll(".text-style-btn")
        .forEach((b) =>
            b.classList.toggle("active", b.dataset.style === "normal"),
        );

    const clipboardContentReset = document.getElementById("clipboard-content");
    if (clipboardContentReset) clipboardContentReset.value = "";

    const todoCompletedReset = document.getElementById("todo-completed-toggle");
    if (todoCompletedReset) todoCompletedReset.checked = false;

    const launcherKindReset = document.getElementById("launcher-kind");
    if (launcherKindReset) {
        launcherKindReset.value = "app";
        launcherKindReset.dispatchEvent(new Event("change"));
    }
    const launcherTargetReset = document.getElementById("launcher-target");
    if (launcherTargetReset) launcherTargetReset.value = "";
    const launcherExamplesReset = document.querySelector(".launcher-examples");
    if (launcherExamplesReset) launcherExamplesReset.removeAttribute("open");
    const launcherPsVisibleReset = document.getElementById(
        "launcher-ps-visible",
    );
    if (launcherPsVisibleReset) launcherPsVisibleReset.checked = false;

    const itemRoutineEditorReset = getItemRoutineEditor();
    if (itemRoutineEditorReset) {
        itemRoutineEditorReset.setSteps([]);
        itemRoutineEditorReset.setStagger(0);
    }

    const linkAutofetchIconToggle = document.getElementById(
        "link-autofetch-icon-toggle",
    );
    if (linkAutofetchIconToggle) {
        linkAutofetchIconToggle.checked = !!window.autoFaviconEnabled;
    }

    const typeSelect = document.getElementById("item-type");
    if (typeSelect) {
        typeSelect.value = type;
        typeSelect.dispatchEvent(new Event("change"));
    }
    const drawerTitle2 = document.getElementById("link-drawer-title");
    if (drawerTitle2)
        drawerTitle2.textContent = t("gwr4_add_item_title", [
            ITEM_TYPE_LABELS[type] || t("gwr4_type_item_fallback"),
        ]);
    closeAllDrawers();
    linkBackdrop.classList.add("active");
    initIconPicker();
    const allWorkspaceItems = (getElements() || []).flatMap(
        (w) => w.items || w.content?.items || [],
    );
    setGroupIcons(allWorkspaceItems);
};

export const ensureAddTypePopover = (addTypePopover, group) => {
    if (addTypePopover?.isConnected) return addTypePopover;
    const popover = document.createElement("div");
    popover.classList.add("group-menu-popover");
    const addTypeItems =
        (group.type || "standard") === "todo-list"
            ? TODO_GROUP_ADD_TYPE_ITEMS
            : STANDARD_GROUP_ADD_TYPE_ITEMS;
    addTypeItems.forEach(({ type, label, icon }) => {
        const btn = document.createElement("button");
        btn.classList.add("group-menu-item");
        btn.innerHTML = `${icon} ${label}`;
        btn.addEventListener("click", () => openAddItemModal(group, type));
        popover.appendChild(btn);
    });
    document.body.appendChild(popover);
    return popover;
};

const getGroupEntryName = (entry) => entry?.name || entry?.content?.name || "";

const findGroupEntryByName = (elements, groupName) =>
    elements.find((entry) => getGroupEntryName(entry) === groupName);

const buildUniqueDuplicateGroupName = (elements, groupName) => {
    const existingNames = new Set(
        elements.map(getGroupEntryName).filter(Boolean),
    );
    let suffix = 1;
    let candidate = t("gwr4_copy_suffix", [groupName]);
    while (existingNames.has(candidate)) {
        suffix += 1;
        candidate = t("gwr4_copy_suffix_n", [groupName, suffix]);
    }
    return candidate;
};

export const ensureGroupPopover = (
    groupPopoverState,
    { group, item, title, getAddTypePopover },
) => {
    if (groupPopoverState?.popover?.isConnected) return groupPopoverState;
    const groupPopover = document.createElement("div");
    groupPopover.classList.add("group-menu-popover");

    const renameItem = document.createElement("button");
    renameItem.classList.add("group-menu-item");
    renameItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1 0 32c0 8.8 7.2 16 16 16l32 0zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z"/></svg> ' + t("gwr4_menu_edit");
    renameItem.addEventListener("click", () => {
        groupPopover.remove();
        const localElements = getElements();
        const groupItem = localElements.find(
            (w) =>
                w.name === group.name ||
                (w.content && w.content.name === group.name),
        );
        openGroupDrawer({
            name: groupItem?.name || group.name,
            icon:
                groupItem?.icon ||
                groupItem?.content?.icon ||
                item.dataset.groupIcon ||
                "",
            iconColor:
                groupItem?.iconColor ||
                groupItem?.content?.iconColor ||
                item.dataset.groupIconColor ||
                "",
            iconSize:
                groupItem?.iconSize ||
                groupItem?.content?.iconSize ||
                group.iconSize ||
                item.dataset.groupIconSize ||
                "",
            items:
                groupItem?.items ||
                groupItem?.content?.items ||
                group.items ||
                [],
            type:
                groupItem?.type ||
                groupItem?.content?.type ||
                group.type ||
                "standard",
        });
    });

    const duplicateItem = document.createElement("button");
    duplicateItem.classList.add("group-menu-item");
    duplicateItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z"/></svg> ' + t("gwr4_menu_duplicate");
    duplicateItem.addEventListener("click", () => {
        groupPopover.remove();
        const localElements = getElements();
        const gd = findGroupEntryByName(localElements, group.name);
        if (!gd) return;
        const clonedItems = JSON.parse(
            JSON.stringify(gd.items || gd.content?.items || []),
        );
        const newName = buildUniqueDuplicateGroupName(
            localElements,
            group.name,
        );
        let maxBottom = 0;
        localElements.forEach((w) => {
            const bottom = (w.y || 0) + (w.h || 12);
            if (bottom > maxBottom) maxBottom = bottom;
        });
        const newWidget = {
            name: newName,
            type: gd.type || gd.content?.type || group.type || undefined,
            items: clonedItems,
            x: gd.x,
            y: maxBottom,
            w: gd.w,
            h: gd.h,
            id: crypto.randomUUID(),
            icon:
                gd.icon ||
                gd.content?.icon ||
                item.dataset.groupIcon ||
                undefined,
            iconColor:
                gd.iconColor ||
                gd.content?.iconColor ||
                item.dataset.groupIconColor ||
                undefined,
            iconSize:
                gd.iconSize ||
                gd.content?.iconSize ||
                group.iconSize ||
                item.dataset.groupIconSize ||
                undefined,
        };
        const updatedElements = [...localElements, newWidget];
        setElements(updatedElements);
        const workspaceUpdateCallback = getWorkspaceUpdateCallback();
        if (workspaceUpdateCallback) workspaceUpdateCallback(updatedElements);
        rerenderGrid(updatedElements);
    });

    const openAllLinksItem = document.createElement("button");
    openAllLinksItem.classList.add("group-menu-item");
    openAllLinksItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3 448 192c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 128c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16L64 112c0-8.8 7.2-16 16-16l128 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg> ' + t("gwr4_menu_open_all");
    openAllLinksItem.addEventListener("click", async () => {
        groupPopover.remove();
        const localElements = getElements();
        const gd = localElements.find(
            (w) =>
                w.name === group.name ||
                (w.content && w.content.name === group.name),
        );
        const groupItems = [
            ...(gd?.items || gd?.content?.items || group.items || []),
        ].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
        const links = groupItems.filter(
            (entry) =>
                (entry.type || "link") === "link" &&
                /^https?:\/\//i.test(entry.url || ""),
        );

        if (!links.length) {
            alert(t("gwr4_no_valid_links", [group.name]));
            return;
        }

        for (const link of links) {
            window.open(link.url, "_blank", "noopener,noreferrer");
        }
    });

    const moveItem = document.createElement("button");
    moveItem.classList.add("group-menu-item");
    moveItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 109.3 224l73.4-73.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 288l293.4 0-73.4 73.4c-12.5 12.5-32.8 12.5-45.3 0l128-128z"/></svg> ' + t("gwr4_menu_move_workspace");
    moveItem.addEventListener("click", () => {
        groupPopover.remove();
        const moveGroupCallback = getMoveGroupCallback();
        if (moveGroupCallback) moveGroupCallback(group.name);
    });

    const styleItem = document.createElement("button");
    styleItem.classList.add("group-menu-item");
    styleItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M512 256c0 .9 0 1.8 0 2.7c-.4 36.5-33.6 61.3-70.1 61.3H344c-26.5 0-48 21.5-48 48c0 3.4 .4 6.7 1 9.9c2.1 10.2 6.5 20 10.1 29.7c2.1 5.7 3.9 11.5 5.4 17.5c4.2 17.4 3.1 35.3-5.7 51.1C300.3 502.8 271.6 512 240 512C163.3 512 96.5 468.7 55.7 405.5c-9.3-14.4-17.8-29.4-24.9-45.2C9.1 315.5 .7 272.8 0 228.8C-.2 218 0 207 0 196c0-34.4 11.5-66 30.8-91.3L49.4 88C77.1 46.1 127.6 25.5 175.2 39.7c24.8 7.3 46.6 19.7 64.9 36.3C264.4 54.9 296.4 40 330 40h4c12.3 0 24.3 2 35.7 5.5C418.5 56.5 448 94.2 448 138.9V176h17.7c17.9 0 35.5 6.5 49.2 18.2C526.8 204.8 512 230.4 512 256z"/></svg> ' + t("gwr4_menu_style");
    styleItem.addEventListener("click", () => {
        groupPopover.remove();
        const localElements = getElements();
        const gd = localElements.find(
            (w) =>
                w.name === group.name ||
                (w.content && w.content.name === group.name),
        );
        if (gd) {
            openGroupStyleEditor(
                gd,
                item.closest(".grid-stack-item"),
                saveGridState,
            );
        }
    });

    const deleteItem = document.createElement("button");
    deleteItem.classList.add("group-menu-item", "danger");
    deleteItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg> ' + t("gwr4_menu_delete");
    deleteItem.addEventListener("click", () => {
        if (!confirm(t("gwr4_confirm_delete_group", [group.name]))) return;
        const snapshot = JSON.parse(JSON.stringify(getElements()));
        const groupName = group.name;
        const deletedIndex = snapshot.findIndex(
            (entry) => getGroupEntryName(entry) === groupName,
        );
        const deletedGroup =
            deletedIndex >= 0
                ? JSON.parse(JSON.stringify(snapshot[deletedIndex]))
                : null;
        // A group's todo list can carry a list-level reminder — clear it with
        // the group, keeping the records so Undo can bring them back too.
        const reminderRestore = group.id
            ? clearRemindersForList(
                  getCurrentWorkspace(),
                  "group",
                  `group:${group.id}`,
              )
            : Promise.resolve([]);
        groupPopover.remove();
        const addTypePopover = getAddTypePopover();
        if (addTypePopover) addTypePopover.remove();
        const grid = getGrid();
        const widgetEl = item.closest(".grid-stack-item");
        if (grid && widgetEl) grid.removeWidget(widgetEl);
        saveGridState();
        showUndoToast(t("gwr4_group_deleted", [groupName]), () => {
            if (!deletedGroup) return;
            void reminderRestore.then(restoreReminders);

            const visibleGroupNames = new Set(
                Array.from(
                    document.querySelectorAll(".grid-stack-item .item"),
                ).map((entry) => entry.dataset.name),
            );

            const currentElements = snapshot.filter((entry) =>
                visibleGroupNames.has(getGroupEntryName(entry)),
            );
            const alreadyExists = currentElements.some(
                (entry) => getGroupEntryName(entry) === groupName,
            );
            if (alreadyExists) return;

            const insertAt = snapshot
                .slice(0, deletedIndex)
                .filter((entry) =>
                    visibleGroupNames.has(getGroupEntryName(entry)),
                ).length;
            currentElements.splice(insertAt, 0, deletedGroup);

            setElements(currentElements);
            const workspaceUpdateCallback = getWorkspaceUpdateCallback();
            if (workspaceUpdateCallback)
                workspaceUpdateCallback(currentElements);
            rerenderGrid(currentElements);
            saveGridState();
        });
    });

    const copyStyleGroupItem = document.createElement("button");
    copyStyleGroupItem.classList.add("group-menu-item");
    copyStyleGroupItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M339.3 367.1c27.3-3.9 51.9-19.4 67.2-42.9L568.2 74.1c12.6-19.5 9.4-45.3-7.6-61.2S516.7.5 499.1 9.2L200.9 215.3c-20.8 12.8-33.4 35.9-33.4 60.7V360c0-1.3-.1-2.6-.1-3.9 0 0 0 0 0 0L120 360.2c-17.7 0-32 14.3-32 32l0 .2 0 72.2c0 17.7 14.3 32 32 32s32-14.3 32-32l0-72.1c.1-17.7 14.3-32 31.9-32c.1 0 .2 0 .3 0l166.7-.3c2.5 0 4.9.1 7.4.2zM512 384c0 35.3-28.7 64-64 64c-17.7 0-32 14.3-32 32s14.3 32 32 32c70.7 0 128-57.3 128-128c0-17.7-14.3-32-32-32s-32 14.3-32 32z"/></svg> ' + t("gwr4_menu_copy_style");
    copyStyleGroupItem.addEventListener("click", () => {
        groupPopover.remove();
        let groupStyle = {};
        if (item.dataset.groupStyle) {
            try {
                groupStyle = JSON.parse(item.dataset.groupStyle);
            } catch (e) {
                console.warn(
                    "[dom-manager] Invalid groupStyle JSON:",
                    e.message,
                );
            }
        }
        activatePaintMode("group", groupStyle);
    });

    const groupMenuSeparator = document.createElement("div");
    groupMenuSeparator.classList.add("group-menu-separator");
    groupMenuSeparator.style.display = "none";

    const pasteStyleGroupItem = document.createElement("button");
    pasteStyleGroupItem.classList.add("group-menu-item");
    pasteStyleGroupItem.style.display = "none";
    pasteStyleGroupItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M41.4 9.4C53.9-3.1 74.1-3.1 86.6 9.4L168 90.7l53.1-53.1c28.1-28.1 73.7-28.1 101.8 0L474.3 189c28.1 28.1 28.1 73.7 0 101.8L283.9 481.4c-37.5 37.5-98.3 37.5-135.8 0L30.6 363.9c-37.5-37.5-37.5-98.3 0-135.8L122.7 136 41.4 54.6C28.9 42.1 28.9 21.9 41.4 9.4zM161.5 172.3l-93.5 93.4c-4.8 4.8-7.1 11.2-6.6 17.7H192c26.5 0 48 21.5 48 48v56h1.8c6.5 0 12.8-2.6 17.5-7.2l41.3-41.3-139-166.6z"/></svg> ' + t("gwr4_menu_paste_style");
    pasteStyleGroupItem.addEventListener("click", () => {
        groupPopover.remove();
        const paintMode = getPaintMode();
        if (!paintMode || paintMode.type !== "group") return;
        const styleObj = paintMode.style;
        item.dataset.groupStyle = JSON.stringify(styleObj);
        Object.entries(styleObj).forEach(([prop, val]) => {
            if (val) item.style.setProperty(prop, val);
        });
        const contentEl = item.parentElement;
        if (contentEl) {
            Object.entries(styleObj).forEach(([prop, val]) => {
                if (val) contentEl.style.setProperty(prop, val);
            });
        }
        saveGridState();
    });

    groupPopover.append(
        renameItem,
        duplicateItem,
        openAllLinksItem,
        styleItem,
        copyStyleGroupItem,
        groupMenuSeparator,
        pasteStyleGroupItem,
        moveItem,
        deleteItem,
    );
    document.body.appendChild(groupPopover);
    return {
        popover: groupPopover,
        pasteStyleGroupItem,
        groupMenuSeparator,
    };
};

export const createGroupDOM = (group) => {
    const item = document.createElement("div");
    item.classList.add("item");
    item.dataset.name = group.name;
    item.dataset.groupType = group.type || "standard";
    item.classList.toggle(
        "group-type-todo-list",
        (group.type || "standard") === "todo-list",
    );
    item.style.height = "100%";
    item.style.display = "flex";
    item.style.flexDirection = "column";

    item.addEventListener("mousedown", (e) => {
        if (e.target.closest(".group-drag-handle")) return;
        e.stopPropagation();
    });

    const titleContainer = document.createElement("div");
    titleContainer.classList.add("title-container");

    const leftTitleContainer = document.createElement("div");
    leftTitleContainer.classList.add("left-title-container");

    const collapseButton = document.createElement("button");
    collapseButton.classList.add("collapse-group-button");
    collapseButton.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>';
    collapseButton.title = t("gwr4_collapse");
    collapseButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const widgetEl = item.closest(".grid-stack-item");
        const wasHoverExpanded = !!widgetEl?.dataset.hoverExpanded;
        if (widgetEl) delete widgetEl.dataset.hoverExpanded;

        let isCollapsed;
        if (wasHoverExpanded) {
            isCollapsed = false;
        } else {
            isCollapsed = item.classList.toggle("is-collapsed");
        }

        const grid = getGrid();
        if (isCollapsed) {
            const currentH = widgetEl?.gridstackNode?.h || 12;
            collapseButton.dataset.prevH = currentH;
            const itemsContainer = item.querySelector(".items-container");
            const todoFooter = item.querySelector(".todo-group-footer");
            if (itemsContainer) itemsContainer.style.display = "none";
            if (todoFooter) todoFooter.style.display = "none";
            if (widgetEl && grid) grid.update(widgetEl, { h: 9, minH: 9 });
        } else {
            const prevH = parseInt(collapseButton.dataset.prevH) || 12;
            const itemsContainer = item.querySelector(".items-container");
            const todoFooter = item.querySelector(".todo-group-footer");
            if (itemsContainer) itemsContainer.style.display = "";
            if (todoFooter) todoFooter.style.display = "";
            if (widgetEl && grid) grid.update(widgetEl, { h: prevH, minH: 12 });
        }
        saveGridState();
    });

    const groupDragHandle = document.createElement("div");
    groupDragHandle.classList.add("group-drag-handle");
    groupDragHandle.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2h4v4H2V2zm8 0h4v4h-4V2zM2 10h4v4H2v-4zm8 0h4v4h-4v-4z" fill="currentColor"/></svg>';

    const title = document.createElement("span");
    title.classList.add("group-title");
    title.textContent = group.name;

    item.dataset.groupIcon = group.icon || "";
    item.dataset.groupIconColor = group.iconColor || "";
    // Unset stays "" (readers fall back to the default size) so the default
    // is never baked into the serialized data — data → render → serialize
    // must round-trip unchanged (WI-1).
    item.dataset.groupIconSize = group.iconSize || "";

    const groupIcon = document.createElement("span");
    groupIcon.className = "group-header-icon";
    groupIcon.setAttribute("aria-hidden", "true");
    if (
        renderGroupHeaderIcon(
            groupIcon,
            group.icon,
            group.iconColor,
            group.iconSize,
        )
    ) {
        leftTitleContainer.append(groupIcon);
    }

    leftTitleContainer.append(title);
    titleContainer.append(leftTitleContainer);

    titleContainer.addEventListener("click", (e) => {
        const paintMode = getPaintMode();
        if (!paintMode || paintMode.type !== "group") return;
        if (e.target.closest(".button-group-container")) return;
        e.stopPropagation();
        const styleObj = paintMode.style;
        item.dataset.groupStyle = JSON.stringify(styleObj);
        Object.entries(styleObj).forEach(([prop, val]) => {
            if (val) item.style.setProperty(prop, val);
        });
        const contentEl = item.parentElement;
        if (contentEl) {
            Object.entries(styleObj).forEach(([prop, val]) => {
                if (val) contentEl.style.setProperty(prop, val);
            });
        }
        titleContainer.classList.add("paint-applied");
        setTimeout(() => titleContainer.classList.remove("paint-applied"), 600);
        saveGridState();
    });

    const addLinkToGroupButton = document.createElement("button");
    addLinkToGroupButton.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/></svg>';
    addLinkToGroupButton.classList.add("add-link-to-group-button");
    addLinkToGroupButton.title =
        (group.type || "standard") === "todo-list"
            ? t("gwr4_add_task_or_section")
            : t("gwr4_add_item");
    addLinkToGroupButton.dataset.name = group.name;

    let addTypePopover = null;
    addLinkToGroupButton.addEventListener("click", (e) => {
        e.stopPropagation();
        addTypePopover = ensureAddTypePopover(addTypePopover, group);
        const isOpen = addTypePopover.classList.contains("open");
        document
            .querySelectorAll(
                ".link-overflow-popover.open, .group-menu-popover.open",
            )
            .forEach((el) => el.remove());
        if (!isOpen) {
            addTypePopover.classList.add("open");
            placeFixedPopover(addTypePopover, addLinkToGroupButton);
        }
    });

    const menuBtn = document.createElement("button");
    menuBtn.classList.add("group-menu-btn");
    menuBtn.title = t("gwr4_group_options");
    menuBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 512"><path d="M64 360a56 56 0 1 0 0 112A56 56 0 1 0 64 360zm0-160a56 56 0 1 0 0 112A56 56 0 1 0 64 200zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/></svg>';

    let groupPopoverState = null;
    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        groupPopoverState = ensureGroupPopover(groupPopoverState, {
            group,
            item,
            title,
            getAddTypePopover: () => addTypePopover,
        });
        const { popover, pasteStyleGroupItem, groupMenuSeparator } =
            groupPopoverState;
        const isOpen = popover.classList.contains("open");
        document
            .querySelectorAll(
                ".link-overflow-popover.open, .group-menu-popover.open",
            )
            .forEach((el) => el.remove());
        if (!isOpen) {
            const isPainting = getPaintMode()?.type === "group";
            if (pasteStyleGroupItem)
                pasteStyleGroupItem.style.display = isPainting ? "" : "none";
            if (groupMenuSeparator)
                groupMenuSeparator.style.display = isPainting ? "" : "none";
            popover.classList.add("open");
            placeFixedPopover(popover, menuBtn);
        }
    });

    const buttonGroupContainer = document.createElement("div");
    buttonGroupContainer.classList.add("button-group-container");
    buttonGroupContainer.append(addLinkToGroupButton);
    buttonGroupContainer.append(groupDragHandle);
    buttonGroupContainer.append(menuBtn);
    buttonGroupContainer.append(collapseButton);
    titleContainer.append(buttonGroupContainer);

    const itemsContainer = document.createElement("div");
    itemsContainer.classList.add("items-container");

    item.append(titleContainer);
    item.append(itemsContainer);

    if ((group.type || "standard") === "todo-list") {
        const footer = document.createElement("div");
        footer.classList.add("todo-group-footer");

        const actions = document.createElement("div");
        actions.classList.add("todo-group-footer-actions");

        const renderTodoComposer = () => {
            actions.replaceChildren();

            const composerState = getTodoComposerState(group.name);
            if (composerState.open) {
                const form = document.createElement("form");
                form.classList.add("todo-group-inline-form");

                const input = document.createElement("input");
                input.type = "text";
                input.maxLength = 160;
                input.placeholder = t("gwr4_todo_placeholder");
                input.classList.add("todo-group-inline-input");
                input.setAttribute("aria-label", t("gwr4_add_task_aria", [group.name]));
                input.autocomplete = "off";
                input.spellcheck = false;

                const closeBtn = document.createElement("button");
                closeBtn.type = "button";
                closeBtn.classList.add("todo-group-inline-cancel-btn");
                closeBtn.setAttribute("aria-label", t("gwr4_close_add_task"));
                closeBtn.textContent = "✕";

                const closeComposer = () => {
                    setTodoComposerState(group.name, {
                        open: false,
                        focus: false,
                    });
                    renderTodoComposer();
                };

                const setInvalid = (invalid) => {
                    form.classList.toggle("is-invalid", invalid);
                    input.setAttribute(
                        "aria-invalid",
                        invalid ? "true" : "false",
                    );
                };

                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const taskName = input.value.trim();
                    if (!taskName) {
                        setInvalid(true);
                        input.focus();
                        return;
                    }

                    setTodoComposerState(group.name, {
                        open: true,
                        focus: true,
                    });
                    addTodoTaskToGroup(group.name, taskName);
                });

                form.addEventListener("click", (event) => {
                    event.stopPropagation();
                });

                input.addEventListener("input", () => {
                    setInvalid(false);
                });

                input.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeComposer();
                    }
                });

                closeBtn.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeComposer();
                });

                form.append(input, closeBtn);
                actions.append(form);

                if (composerState.focus) {
                    setTodoComposerState(group.name, { focus: false });
                    requestAnimationFrame(() => {
                        input.focus();
                        input.select();
                    });
                }
            } else {
                const addTaskBtn = document.createElement("button");
                addTaskBtn.type = "button";
                addTaskBtn.classList.add("todo-group-add-task-btn");
                addTaskBtn.textContent = t("gwr4_add_task_btn");
                addTaskBtn.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTodoComposerState(group.name, {
                        open: true,
                        focus: true,
                    });
                    renderTodoComposer();
                });
                actions.append(addTaskBtn);
            }

            actions.append(clearTasksBtn);
        };

        const clearTasksBtn = document.createElement("button");
        clearTasksBtn.type = "button";
        clearTasksBtn.classList.add("todo-group-clear-btn");
        clearTasksBtn.title = t("gwr4_delete_all_tasks");
        clearTasksBtn.setAttribute("aria-label", t("gwr4_delete_all_tasks"));
        clearTasksBtn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg>';
        clearTasksBtn.addEventListener("click", (event) => {
            event.stopPropagation();

            const localElements = getElements();
            const targetGroup = localElements.find(
                (widget) =>
                    widget.name === group.name ||
                    (widget.content && widget.content.name === group.name),
            );
            if (!targetGroup) return;

            const targetItems =
                targetGroup.items ||
                (targetGroup.content ? targetGroup.content.items : null);
            if (!targetItems) return;

            const todoCount = targetItems.filter(
                (entry) => entry.type === "todo",
            ).length;
            if (todoCount === 0) return;

            if (
                !confirm(t("gwr4_confirm_delete_all_tasks", [todoCount, group.name]))
            ) {
                return;
            }

            const remainingItems = targetItems
                .filter((entry) => entry.type !== "todo")
                .map((entry, index) => ({
                    ...entry,
                    y: index,
                }));

            if (targetGroup.items) {
                targetGroup.items = remainingItems;
            }
            if (targetGroup.content) {
                targetGroup.content.items = remainingItems;
            }

            const workspaceUpdateCallback = getWorkspaceUpdateCallback();
            if (workspaceUpdateCallback) workspaceUpdateCallback(localElements);
            rerenderGrid(localElements);
        });

        renderTodoComposer();
        footer.append(actions);
        item.append(footer);
    }

    return item;
};
