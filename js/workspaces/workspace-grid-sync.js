import { container, getElements, setElements } from "../variables.js";
import { createItems, isTopZoneWidget, tileCellRows } from "../dom-manager/grid-renderer.js";
import {
    setWorkspaceUpdateCallback,
    setMoveGroupCallback,
    flushGridState,
    cancelPendingGridSave,
    getTopGrid,
} from "../dom-manager/grid-state.js";
import { isReadOnlyManagedBoard } from "./workspace-state.js";
import {
    currentWorkspace,
    workspacesData,
    getWorkspaceGroups,
    setWorkspaceGroups,
    isSwitching,
    isManagedBoardId,
    protectedIds,
    sessionKeys,
} from "./workspace-state.js";
import {
    saveWorkspacesToStorage,
    reloadFromStorage,
} from "./workspace-storage.js";
import { handleMoveGroupRequest } from "./workspace-actions.js";
import { renderWorkspaceTabs } from "./workspace-tabs-ui.js";
import { GRID_COLS } from "../grid-columns.js";

export const loadCurrentWorkspace = () => {
    const groups = getWorkspaceGroups(currentWorkspace);
    const isManaged = isReadOnlyManagedBoard(currentWorkspace);
    setElements(groups);
    createItems(groups, !isManaged);
    updateEmptyWorkspaceMessage(groups.length === 0);
    _hideLoader();

    // Show/hide edit FABs based on whether this is a managed board
    const editFab = document.getElementById("edit");
    const addGroupFab = document.getElementById("floating-add-group-btn");
    if (editFab) editFab.style.display = isManaged ? "none" : "";
    if (addGroupFab) addGroupFab.style.display = isManaged ? "none" : "";

    // Toggle read-only CSS class to suppress all edit controls inside groups/links
    container.classList.toggle("managed-readonly", isManaged);
};

const _hideLoader = () => {
    const el = document.getElementById("rt-loader");
    if (!el || el.classList.contains("rt-loader-hide")) return;
    requestAnimationFrame(() => {
        el.classList.add("rt-loader-hide");
        el.addEventListener("transitionend", () => el.remove(), { once: true });
    });
};

export const updateEmptyWorkspaceMessage = (isEmpty) => {
    const emptyMessage = document.getElementById("empty-workspace-message");
    const container = document.querySelector(".container");

    if (emptyMessage) {
        emptyMessage.style.display = isEmpty ? "flex" : "none";
    }
    if (container) {
        container.style.display = isEmpty ? "none" : "block";
    }
    window.dispatchEvent(new CustomEvent("rt:empty-workspace-changed", { detail: { isEmpty, workspaceId: currentWorkspace } }));
};

// Read-only by contract: this refreshes UI from in-memory elements and must
// never write workspace state. (It once did setWorkspaceGroups(current, ...),
// which let externally-injected elements overwrite the current workspace.)
export const refreshEmptyState = () => {
    const groups = getElements() || [];
    updateEmptyWorkspaceMessage(groups.length === 0);
};

const getNextWidgetY = (groups) => {
    let maxY = 0;
    let maxH = 0;
    groups.forEach((g) => {
        if ((g.y || 0) + (g.h || 12) > maxY + maxH) {
            maxY = g.y || 0;
            maxH = g.h || 12;
        }
    });
    return maxY + maxH;
};

// Fill available board columns without moving existing content. Only main-zone
// widgets occupy board space; the shortcut bar is an independent grid.
const findNewGroupPosition = (groups, width, height) => {
    const occupied = groups.filter(group => !isTopZoneWidget(group)).map(group => ({
        x: group.x || 0, y: group.y || 0, w: group.w || 6, h: group.h || 12,
    }));
    const rows = [...new Set([0, ...occupied.map(group => group.y + group.h)])].sort((a, b) => a - b);
    for (const y of rows) {
        for (let x = 0; x <= GRID_COLS - width; x++) {
            if (occupied.every(group => x + width <= group.x || x >= group.x + group.w ||
                y + height <= group.y || y >= group.y + group.h)) return { x, y };
        }
    }
    return { x: 0, y: getNextWidgetY(occupied) };
};

const buildGroupWidget = (
    groups,
    groupName,
    initialItems = [],
    options = {},
) => {
    // Empty standard groups start a little taller so the inline quick-fill
    // buttons (import bookmarks / add link / clipboard / launcher) are visible.
    const isEmptyStandard =
        initialItems.length === 0 && options.type !== "todo-list";
    const estimatedH = isEmptyStandard
        ? 20
        : Math.max(12, 4 + initialItems.length * 4);

    return {
        name: groupName,
        type: options.type === "todo-list" ? options.type : undefined,
        items: initialItems,
        ...findNewGroupPosition(groups, 6, estimatedH),
        w: 6,
        h: estimatedH,
        id: groupName,
        icon: options.icon || undefined,
        iconColor: options.iconColor || undefined,
        iconSize: options.iconSize || undefined,
    };
};

const buildTopLevelActionWidget = (groups, name, type, options = {}) => {
    const width = Math.max(1, Math.min(GRID_COLS, parseInt(options.w, 10) || 6));
    const height = Math.max(1, parseInt(options.h, 10) || 8);

    return {
        name,
        type,
        url: options.url || undefined,
        content: options.content || undefined,
        launcherKind: options.launcherKind || undefined,
        target: options.target || undefined,
        visible: options.visible || undefined,
        steps: Array.isArray(options.steps) ? options.steps : undefined,
        stagger: options.stagger || undefined,
        x: Number.isFinite(options.x) ? options.x : 0,
        y: Number.isFinite(options.y) ? options.y : getNextWidgetY(groups),
        w: width,
        h: height,
        id: name,
        icon: options.icon || undefined,
        iconColor: options.iconColor || undefined,
        iconSize: options.iconSize || undefined,
        targetOverride: options.targetOverride || undefined,
        style: options.style || undefined,
        display: options.display || undefined,
        zone: options.zone || undefined,
    };
};

// Top-level section element (heading / text / divider). The visible text lives in
// `text`/`content`; `name`/`id` is a stable uid so dedup & delete stay name-keyed.
const buildSectionWidget = (groups, type, text = "", options = {}) => {
    const uid = `§${type}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
    const isHeader = type === "section-header";
    const isStepheader = type === "section-stepheader";
    const isDivider = type === "section-divider";
    const isArrow = type === "section-arrow";
    const usesContent = [
        "section-text",
        "section-callout",
        "section-code",
        "section-steps",
    ].includes(type);
    const heights = {
        "section-header": 5,
        "section-stepheader": 6,
        "section-divider": 2,
        "section-arrow": 5,
        "section-text": 6,
        "section-callout": 8,
        "section-code": 11,
        "section-steps": 8,
        "section-image": 18,
        "section-profile": 10,
        "section-linkcard": 30,
        "section-file": 11,
    };
    // Dummy seed text so a freshly-added element renders something (and shows
    // markdown working) instead of an empty box.
    const dummy = {
        "section-header": "Title",
        "section-stepheader": "Step title",
        "section-text": "Some paragraph.",
        "section-callout": "Callout text.",
        "section-code": "code",
        "section-steps": "First step\nSecond step",
    };
    const seed = text || dummy[type] || "";
    const sectionSrc = String(options.src || "").trim();
    const sectionUrl = String(options.url || "").trim();
    const sectionAvatar = String(options.avatar || "").trim();
    const sectionText =
        typeof options.text === "string" ? options.text.trim() : undefined;
    const sectionContent =
        typeof options.content === "string" ? options.content : undefined;
    // Step headers auto-number: next number after the existing ones (overridable).
    const nextStepNumber =
        (Array.isArray(groups)
            ? groups.filter((g) => g && g.type === "section-stepheader").length
            : 0) + 1;
    return {
        type,
        name: uid,
        id: uid,
        text:
            type === "section-profile"
                ? sectionText || ""
                : type === "section-linkcard"
                  ? sectionText || ""
                  : isHeader || isStepheader
                    ? seed
                    : undefined,
        content:
            type === "section-profile"
                ? sectionContent || ""
                : type === "section-linkcard"
                  ? sectionContent || ""
                  : usesContent
                    ? seed
                    : undefined,
        number: isStepheader ? nextStepNumber : undefined,
        direction: isArrow ? "down" : undefined,
        level: isHeader ? "h2" : undefined,
        variant: type === "section-callout" ? "info" : undefined,
        thickness: isDivider ? 2 : undefined,
        avatar:
            type === "section-profile"
                ? sectionAvatar || "preset:a1"
                : undefined,
        fit: type === "section-image" ? "cover" : undefined,
        src:
            type === "section-image" || type === "section-linkcard"
                ? sectionSrc || undefined
                : undefined,
        url:
            type === "section-file" || type === "section-linkcard"
                ? sectionUrl || undefined
                : undefined,
        align: isDivider || isArrow ? undefined : "left",
        x: 0,
        y: getNextWidgetY(groups),
        w:
            type === "section-arrow"
                ? 4
                : type === "section-steps"
                  ? 8
                  : type === "section-callout" ||
                      type === "section-image" ||
                      type === "section-linkcard" ||
                      type === "section-file"
                    ? 12
                    : GRID_COLS,
        h: heights[type] || 6,
    };
};

export const addGroupToNamedWorkspace = async (
    workspaceId,
    groupName,
    initialItems = [],
    options = {},
) => {
    const targetWorkspaceId = workspaceId || currentWorkspace;
    if (isReadOnlyManagedBoard(targetWorkspaceId)) return false;

    flushGridState();
    const targetGroups = getWorkspaceGroups(targetWorkspaceId);
    const newWidget = buildGroupWidget(
        targetGroups,
        groupName,
        initialItems,
        options,
    );

    setWorkspaceGroups(targetWorkspaceId, [...targetGroups, newWidget]);

    if (targetWorkspaceId === currentWorkspace) {
        setElements(getWorkspaceGroups(currentWorkspace));
        createItems(getElements(), true);
        refreshEmptyState();
    }

    await saveWorkspacesToStorage();
    return true;
};

/** Commit a bookmark preview as one batch. Names are unique because group
 * editing and DOM serialization identify groups by name in existing boards.
 */
export const importBookmarkGroups = async (entries) => {
    flushGridState();
    const snapshots = new Map();
    const staged = new Map();
    const layouts = new Map();
    const imported = new Map();
    for (const entry of entries) {
        const id = entry.workspaceId;
        if (!Object.hasOwn(workspacesData.workspaces, id) ||
            isManagedBoardId(id) || (protectedIds.includes(id) && !sessionKeys.has(id)) ||
            !Array.isArray(getWorkspaceGroups(id))) {
            throw new Error("bookmark_destination_unavailable");
        }
        if (!staged.has(id)) {
            snapshots.set(id, getWorkspaceGroups(id));
            staged.set(id, [...getWorkspaceGroups(id)]);
            layouts.set(id, { count: 0, y: getNextWidgetY(getWorkspaceGroups(id)), height: 0 });
            imported.set(id, new Set());
        }
        const groups = staged.get(id);
        let name = entry.name;
        let suffix = 2;
        while (groups.some(group => group.name === name || group.id === name)) name = `${entry.name} (${suffix++})`;
        const layout = layouts.get(id);
        if (layout.count > 0 && layout.count % 4 === 0) {
            layout.y += layout.height;
            layout.height = 0;
        }
        const widget = buildGroupWidget(groups, name, entry.items);
        // Four groups per row, in preview reading order, below existing
        // content. Never move or resize the user's existing widgets.
        widget.w = GRID_COLS / 4;
        widget.x = (layout.count % 4) * widget.w;
        widget.y = layout.y;
        layout.height = Math.max(layout.height, widget.h);
        layout.count++;
        groups.push(widget);
        imported.get(id).add(name);
    }
    for (const [id, groups] of staged) setWorkspaceGroups(id, groups);
    try {
        const result = await saveWorkspacesToStorage({ atomic: true });
        if (result?.error) throw new Error("bookmark_save_failed");
    } catch (error) {
        for (const [id, groups] of snapshots) setWorkspaceGroups(id, groups);
        throw error;
    }
    // Render after persistence so a failed save cannot leak a staged import
    // through a later DOM serialization or accidentally duplicate it on retry.
    if (staged.has(currentWorkspace)) loadCurrentWorkspace();
    return imported;
};

/** Fit newly added groups in each destination's actual rendered theme. */
export const compactAddedGroups = async (added) => {
    const { compactLayout } = await import("../dom-manager/compact-layout.js");
    const { switchWorkspace } = await import("./workspace-actions.js");
    for (const [workspaceId, groupNames] of added) {
        await switchWorkspace(workspaceId);
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const geometry = compactLayout({ groupNames, fitHeight: true, silent: true, persist: false }) || [];
        cancelPendingGridSave();
        const byName = new Map(geometry.map(widget => [widget.name, widget]));
        setWorkspaceGroups(workspaceId, getWorkspaceGroups(workspaceId).map(group => {
            const fitted = byName.get(group.name);
            return fitted ? { ...group, ...fitted } : group;
        }));
        setElements(getWorkspaceGroups(workspaceId));
        const result = await saveWorkspacesToStorage({ atomic: true });
        if (result?.error) throw new Error("group_layout_save_failed");
    }
};

export const addTopLevelActionWidgetToNamedWorkspace = async (
    workspaceId,
    name,
    type,
    options = {},
) => {
    const targetWorkspaceId = workspaceId || currentWorkspace;
    if (isReadOnlyManagedBoard(targetWorkspaceId)) return false;

    const targetGroups = getWorkspaceGroups(targetWorkspaceId);
    const newWidget = buildTopLevelActionWidget(
        targetGroups,
        name,
        type,
        options,
    );

    setWorkspaceGroups(targetWorkspaceId, [...targetGroups, newWidget]);

    if (targetWorkspaceId === currentWorkspace) {
        setElements(getWorkspaceGroups(currentWorkspace));
        createItems(getElements(), true);
        refreshEmptyState();
    }

    await saveWorkspacesToStorage();
    return true;
};

export const addTopLevelActionWidgetsToNamedWorkspace = async (
    workspaceId,
    widgetDefinitions = [],
) => {
    const targetWorkspaceId = workspaceId || currentWorkspace;
    if (isReadOnlyManagedBoard(targetWorkspaceId)) return false;
    if (!Array.isArray(widgetDefinitions) || widgetDefinitions.length === 0) {
        return true;
    }

    const targetGroups = getWorkspaceGroups(targetWorkspaceId);
    const newWidgets = [];
    let cursorX = 0;
    let cursorY = getNextWidgetY(targetGroups);
    let rowHeight = 0;

    widgetDefinitions.forEach((definition) => {
        if (!definition?.name || !definition?.type) return;

        const width = Math.max(
            1,
            Math.min(GRID_COLS, parseInt(definition.options?.w, 10) || 6),
        );
        const height = Math.max(1, parseInt(definition.options?.h, 10) || 8);

        if (cursorX > 0 && cursorX + width > GRID_COLS) {
            cursorX = 0;
            cursorY += rowHeight;
            rowHeight = 0;
        }

        newWidgets.push(
            buildTopLevelActionWidget(
                targetGroups,
                definition.name,
                definition.type,
                {
                    ...(definition.options || {}),
                    x: cursorX,
                    y: cursorY,
                    w: width,
                    h: height,
                },
            ),
        );

        rowHeight = Math.max(rowHeight, height);
        cursorX += width;

        if (cursorX >= GRID_COLS) {
            cursorX = 0;
            cursorY += rowHeight;
            rowHeight = 0;
        }
    });

    if (newWidgets.length === 0) return true;

    setWorkspaceGroups(targetWorkspaceId, [...targetGroups, ...newWidgets]);

    if (targetWorkspaceId === currentWorkspace) {
        setElements(getWorkspaceGroups(currentWorkspace));
        createItems(getElements(), true);
        refreshEmptyState();
    }

    await saveWorkspacesToStorage();
    return true;
};

export const addGroupToWorkspace = (
    groupName,
    initialItems = [],
    options = {},
) =>
    addGroupToNamedWorkspace(
        currentWorkspace,
        groupName,
        initialItems,
        options,
    );

export const addSectionToNamedWorkspace = async (
    workspaceId,
    type,
    text = "",
    options = {},
) => {
    const targetWorkspaceId = workspaceId || currentWorkspace;
    if (isReadOnlyManagedBoard(targetWorkspaceId)) return false;

    const targetGroups = getWorkspaceGroups(targetWorkspaceId);
    const newWidget = buildSectionWidget(targetGroups, type, text, options);

    setWorkspaceGroups(targetWorkspaceId, [...targetGroups, newWidget]);

    if (targetWorkspaceId === currentWorkspace) {
        setElements(getWorkspaceGroups(currentWorkspace));
        createItems(getElements(), true);
        refreshEmptyState();
    }

    await saveWorkspacesToStorage();
    return true;
};

export const addSectionToWorkspace = (type, text = "", options = {}) =>
    addSectionToNamedWorkspace(currentWorkspace, type, text, options);

export const addLinkButtonToNamedWorkspace = async (
    workspaceId,
    name,
    url,
    options = {},
) =>
    addTopLevelActionWidgetToNamedWorkspace(workspaceId, name, "link-button", {
        ...options,
        url,
    });

export const addClipboardButtonToNamedWorkspace = async (
    workspaceId,
    name,
    content,
    options = {},
) =>
    addTopLevelActionWidgetToNamedWorkspace(
        workspaceId,
        name,
        "clipboard-button",
        {
            ...options,
            content,
        },
    );

export const addLauncherButtonToNamedWorkspace = async (
    workspaceId,
    name,
    launcherOptions = {},
) =>
    addTopLevelActionWidgetToNamedWorkspace(
        workspaceId,
        name,
        "launcher-button",
        launcherOptions,
    );

export const addLinkButtonToWorkspace = (name, url, options = {}) =>
    addLinkButtonToNamedWorkspace(currentWorkspace, name, url, options);

const widgetEntryName = (entry) => entry?.name || entry?.content?.name || "";

// Switch a top-level button between the display styles the UI exposes
// (standard "" / icon / tile / large tile), pinning the matching canonical
// cell. Used by the widget context menu's one-click conversions.
export const setShortcutDisplayVariant = async (widgetName, display) => {
    if (!["", "tile", "tile2"].includes(display)) return false;
    const ws = currentWorkspace;
    if (isReadOnlyManagedBoard(ws)) return false;
    const groups = getWorkspaceGroups(ws);
    const widget = groups.find(
        (entry) => widgetEntryName(entry) === widgetName,
    );
    if (!widget) return false;

    const wasSquare = ["tile", "tile2"].includes(widget.display);

    if (display) widget.display = display;
    else delete widget.display;
    // labelHidden is retired; scrub it off anything this touches.
    delete widget.labelHidden;

    if (display === "tile2") {
        widget.w = 2;
        widget.h = 16;
    } else if (display === "tile") {
        widget.w = 1;
        widget.h = 8;
    } else if (wasSquare) {
        // Square → standard: restore the factory size.
        widget.w = 6;
        widget.h = 8;
    }

    setWorkspaceGroups(ws, groups);
    setElements(getWorkspaceGroups(ws));
    await saveWorkspacesToStorage();
    createItems(getElements(), true);
    return true;
};

// Promote a group's link item into a top-level icon Shortcut on the board,
// used when an item tile is dragged OUT of a group onto the empty board.
// Carries name/url/icon/iconColor over. Returns true if the item was
// promoted. Pure/verifiable; the Sortable drag wiring supplies the two names.
// Which in-group item types can be dragged out to a top-level widget, and how
// each maps to its board widget type + carried fields. Mirrors the reverse
// direction in absorbShortcutIntoTileGroup.
// Each promotable item type keeps its behavior fields; all land as a 1×1
// TILE (display:"tile", caption hidden) so any link type gets the same
// compact square look on the board, not a labeled button.
const PROMOTABLE_ITEM_TYPES = {
    link: {
        widgetType: "link-button",
        fields: (item) => ({
            url: item.url || "",
            ...(item.targetOverride
                ? { targetOverride: item.targetOverride }
                : {}),
        }),
    },
    clipboard: {
        widgetType: "clipboard-button",
        fields: (item) => ({ content: item.content || "" }),
    },
    launcher: {
        widgetType: "launcher-button",
        fields: (item) => ({
            launcherKind: item.launcherKind,
            target: item.target,
            visible: item.visible,
        }),
    },
    routine: {
        widgetType: "routine-button",
        fields: (item) => ({ steps: item.steps, stagger: item.stagger }),
    },
};

export const promoteGroupItemToShortcut = async (
    sourceGroupName,
    itemName,
    targetZone = "main",
    position = null,
) => {
    const ws = currentWorkspace;
    if (isReadOnlyManagedBoard(ws)) return false;
    const groups = getWorkspaceGroups(ws);
    const source = groups.find(
        (entry) => widgetEntryName(entry) === sourceGroupName,
    );
    if (!source || !Array.isArray(source.items)) return false;
    // Any promotable item kind (link / clipboard / launcher / routine) becomes
    // its matching top-level button; headers/dividers/text/todo can't.
    const itemIndex = source.items.findIndex(
        (item) =>
            (item.name || "") === itemName &&
            PROMOTABLE_ITEM_TYPES[item.type || "link"],
    );
    if (itemIndex < 0) return false;
    const item = source.items[itemIndex];
    const mapping = PROMOTABLE_ITEM_TYPES[item.type || "link"];

    // A widget is identified by name — keep it unique across the board.
    const existingNames = new Set(groups.map(widgetEntryName).filter(Boolean));
    let name = item.name || item.url || "Item";
    let suffix = 1;
    while (existingNames.has(name)) {
        suffix += 1;
        name = `${item.name || "Item"} ${suffix}`;
    }

    source.items.splice(itemIndex, 1);
    const shortcut = buildTopLevelActionWidget(groups, name, mapping.widgetType, {
        ...mapping.fields(item),
        icon: item.icon || "",
        iconColor: item.iconColor || "",
        // Every promoted item lands as a compact 1×1 tile, whatever its
        // type (icon-only by design; the tooltip carries the name).
        display: "tile",
        // Land where the tile was released: "main" = free layout (explicit),
        // "top" = shortcut bar (the default, so leave zone unset).
        zone: targetZone === "top" ? undefined : "main",
        w: 1,
        h: 8,
        // Drop at the released grid cell if one was supplied; otherwise
        // buildTopLevelActionWidget falls back to the next free row.
        ...(Number.isFinite(position?.x) ? { x: position.x } : {}),
        ...(Number.isFinite(position?.y) ? { y: position.y } : {}),
    });
    groups.push(shortcut);
    setWorkspaceGroups(ws, groups);
    setElements(getWorkspaceGroups(ws));
    await saveWorkspacesToStorage();
    createItems(getElements(), true);
    return true;
};

export const addTopLevelActionWidgetsToWorkspace = (widgetDefinitions = []) =>
    addTopLevelActionWidgetsToNamedWorkspace(
        currentWorkspace,
        widgetDefinitions,
    );

export const addClipboardButtonToWorkspace = (name, content, options = {}) =>
    addClipboardButtonToNamedWorkspace(
        currentWorkspace,
        name,
        content,
        options,
    );

export const addLauncherButtonToWorkspace = (name, launcherOptions = {}) =>
    addLauncherButtonToNamedWorkspace(currentWorkspace, name, launcherOptions);

export const addRoutineButtonToNamedWorkspace = async (
    workspaceId,
    name,
    routineOptions = {},
) =>
    addTopLevelActionWidgetToNamedWorkspace(
        workspaceId,
        name,
        "routine-button",
        routineOptions,
    );

export const addRoutineButtonToWorkspace = (name, routineOptions = {}) =>
    addRoutineButtonToNamedWorkspace(currentWorkspace, name, routineOptions);

export const updateWorkspaceGroups = (groups) => {
    if (isReadOnlyManagedBoard(currentWorkspace)) return;
    setWorkspaceGroups(currentWorkspace, groups);
    setElements(groups);
    updateEmptyWorkspaceMessage(groups.length === 0);
    if (!isSwitching) saveWorkspacesToStorage();
};

export { currentWorkspace };
export { reloadFromStorage };

// First-run creation is one storage transaction, so retries cannot leave half
// of a selection on the board. Reuse the existing persisted widget shapes.
export async function addStartScreenContent(workspaceId, { groups = [], shortcuts = [] }) {
    flushGridState();
    assertStartScreenDestination(workspaceId);
    const before = getWorkspaceGroups(workspaceId);
    const next = [...before];
    const names = new Set();
    const uniqueName = base => {
        let name = base, suffix = 2;
        while (next.some(g => g.name === name || g.id === name)) name = `${base} (${suffix++})`;
        names.add(name);
        return name;
    };
    for (const group of groups) next.push(buildGroupWidget(next, uniqueName(group.name), group.items));
    const shortcutHeight = tileCellRows(workspaceId === currentWorkspace ? getTopGrid() : null, 2);
    shortcuts.forEach((site, index) => next.push(buildTopLevelActionWidget(next, uniqueName(site.name), "link-button", {
        url: site.url, icon: site.icon, display: "tile2", zone: "top", w: 2, h: shortcutHeight,
        x: (index * 2) % GRID_COLS, y: Math.floor(index * 2 / GRID_COLS) * shortcutHeight,
    })));
    if (!names.size) return new Map();
    setWorkspaceGroups(workspaceId, next);
    try {
        const result = await saveWorkspacesToStorage({ atomic: true });
        if (result?.error) throw new Error("start_save_failed");
    } catch (error) {
        setWorkspaceGroups(workspaceId, before);
        throw error;
    }
    if (currentWorkspace === workspaceId) loadCurrentWorkspace();
    return new Map([[workspaceId, names]]);
}

function assertStartScreenDestination(id) {
    if (!Object.hasOwn(workspacesData.workspaces, id) || isReadOnlyManagedBoard(id) ||
        (protectedIds.includes(id) && !sessionKeys.has(id)) || !Array.isArray(getWorkspaceGroups(id))) {
        throw new Error("start_destination_unavailable");
    }
}

export async function undoStartScreenContent(created) {
    flushGridState();
    const snapshots = new Map();
    // Validate every destination before touching any of them.
    for (const id of created.keys()) assertStartScreenDestination(id);
    for (const [id, names] of created) {
        snapshots.set(id, getWorkspaceGroups(id));
        setWorkspaceGroups(id, getWorkspaceGroups(id).filter(group => !names.has(group.name)));
    }
    try {
        const result = await saveWorkspacesToStorage({ atomic: true });
        if (result?.error) throw new Error("start_undo_failed");
    } catch (error) {
        for (const [id, groups] of snapshots) setWorkspaceGroups(id, groups);
        throw error;
    }
    if (created.has(currentWorkspace)) loadCurrentWorkspace();
}
