import { getElements, setElements } from "../variables.js";
import {
    getOwningGrid,
    getMoveGroupCallback,
    getWorkspaceUpdateCallback,
    saveGridState,
    flushGridState,
} from "./grid-state.js";
import { closeAllDrawers } from "../drawer-manager.js";
import { showToast, showUndoToast } from "../undo-manager.js";
import { executeActionItem } from "../action-executor.js";
import {
    openConvertButtonToGroupModal,
    openGroupDrawer,
} from "../event-handlers/workspace-item-handlers.js";
import { renderTopLevelWidgetIcon } from "./action-icons.js";
import { sanitizeLinkTarget, sanitizeLinkUrl } from "../untrusted-input.js";
import { t } from "../i18n.js";

let createItemsHandler = null;

const LINK_WIDGET_TYPES = [
    "link-button",
    "clipboard-button",
    "launcher-button",
    "routine-button",
];

function parseRoutineStepsAttr(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const WIDGET_TYPE_LABELS = {
    "link-button": t("lbr5_label_link_button"),
    "clipboard-button": t("lbr5_label_clipboard_button"),
    "launcher-button": t("lbr5_label_launcher_button"),
    "routine-button": t("lbr5_label_routine"),
};

export const setCreateItemsHandler = (handler) => {
    createItemsHandler = handler;
};

const rerenderGrid = (elements) => {
    if (typeof createItemsHandler === "function") {
        createItemsHandler(elements, true);
    }
};

const getWidgetEntryName = (entry) => entry?.name || entry?.content?.name || "";

const findWidgetByName = (elements, name) =>
    (elements || []).find((entry) => getWidgetEntryName(entry) === name);

const buildUniqueDuplicateWidgetName = (elements, name) => {
    const existingNames = new Set(
        elements.map(getWidgetEntryName).filter(Boolean),
    );
    let suffix = 1;
    let candidate = t("lbr5_copy_suffix", [name]);
    while (existingNames.has(candidate)) {
        suffix += 1;
        candidate = t("lbr5_copy_suffix_n", [name, suffix]);
    }
    return candidate;
};

const updateElementsAndRerender = (elements) => {
    setElements(elements);
    const workspaceUpdateCallback = getWorkspaceUpdateCallback();
    if (workspaceUpdateCallback) workspaceUpdateCallback(elements);
    rerenderGrid(elements);
};

const getWidgetPrimaryCopyAction = (widget) => {
    if (widget.type === "clipboard-button") {
        return {
            label: t("lbr5_copy_content"),
            value: widget.content || "",
            success: t("lbr5_content_copied"),
        };
    }
    if (widget.type === "launcher-button") {
        return {
            label: t("lbr5_copy_target"),
            value: widget.target || "",
            success: t("lbr5_target_copied"),
        };
    }
    if (widget.type === "routine-button") {
        // A routine has no single URL — copy the URLs of its url-steps.
        // With none to copy, offer no copy action at all (returning the
        // link default here used to "copy" an empty string).
        const urls = (Array.isArray(widget.steps) ? widget.steps : [])
            .filter((step) => step?.kind === "url" && step.url)
            .map((step) => step.url);
        if (!urls.length) return null;
        return {
            label: t("lbr5_copy_urls"),
            value: urls.join("\n"),
            success: t("lbr5_urls_copied"),
        };
    }
    return {
        label: t("lbr5_copy_url"),
        value: widget.url || "",
        success: t("lbr5_url_copied"),
    };
};

const ensureLinkButtonPopover = (popoverState, { widget, item }) => {
    if (popoverState?.popover?.isConnected) return popoverState;

    const popover = document.createElement("div");
    popover.classList.add("group-menu-popover");

    const editItem = document.createElement("button");
    editItem.classList.add("group-menu-item");
    editItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1 0 32c0 8.8 7.2 16 16 16l32 0zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z"/></svg> ' + t("lbr5_edit");
    editItem.addEventListener("click", () => {
        popover.remove();
        const localElements = getElements();
        const widgetEntry = findWidgetByName(localElements, widget.name);
        openGroupDrawer({
            name: widgetEntry?.name || widget.name,
            type: widgetEntry?.type || widget.type,
            url: widgetEntry?.url || widget.url || item.dataset.url || "",
            content:
                widgetEntry?.content ||
                widget.content ||
                item.dataset.content ||
                "",
            launcherKind:
                widgetEntry?.launcherKind ??
                widget.launcherKind ??
                item.dataset.launcherKind ??
                "app",
            target:
                widgetEntry?.target ??
                widget.target ??
                item.dataset.target ??
                "",
            visible:
                widgetEntry?.visible ??
                widget.visible ??
                item.dataset.psVisible === "true",
            steps:
                widgetEntry?.steps ??
                widget.steps ??
                parseRoutineStepsAttr(item.dataset.routineSteps),
            stagger:
                widgetEntry?.stagger ??
                widget.stagger ??
                (Number(item.dataset.routineStagger) || 0),
            icon:
                widgetEntry?.icon ||
                widget.icon ||
                item.dataset.groupIcon ||
                "",
            iconColor:
                widgetEntry?.iconColor ||
                widget.iconColor ||
                item.dataset.groupIconColor ||
                "",
            iconSize:
                widgetEntry?.iconSize ||
                widget.iconSize ||
                item.dataset.groupIconSize ||
                24,
            display:
                widgetEntry?.display ||
                widget.display ||
                item.dataset.display ||
                "",
            style:
                widgetEntry?.style ||
                widget.style ||
                (item.dataset.widgetStyle
                    ? JSON.parse(item.dataset.widgetStyle)
                    : undefined),
        });
    });

    const duplicateItem = document.createElement("button");
    duplicateItem.classList.add("group-menu-item");
    duplicateItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z"/></svg> ' + t("lbr5_duplicate");
    duplicateItem.addEventListener("click", () => {
        popover.remove();
        // Flush any pending debounced DOM save so the duplicate is computed
        // from the freshest widget geometry, not a pre-drag snapshot.
        flushGridState();
        const localElements = getElements();
        const sourceWidget = findWidgetByName(localElements, widget.name);
        if (!sourceWidget) return;

        let maxBottom = 0;
        localElements.forEach((entry) => {
            const bottom = (entry.y || 0) + (entry.h || 12);
            if (bottom > maxBottom) maxBottom = bottom;
        });

        const newName = buildUniqueDuplicateWidgetName(
            localElements,
            widget.name,
        );
        const duplicateWidget = {
            ...JSON.parse(JSON.stringify(sourceWidget)),
            id: crypto.randomUUID(),
            name: newName,
            x: sourceWidget.x,
            y: maxBottom,
        };
        updateElementsAndRerender([...localElements, duplicateWidget]);
    });

    // null = this widget has nothing meaningful to copy (e.g. a routine
    // with no url-steps) — the menu item is omitted below.
    const copyAction = getWidgetPrimaryCopyAction(widget) || {
        label: "",
        value: "",
        success: "",
        hidden: true,
    };
    const copyPrimaryItem = document.createElement("button");
    copyPrimaryItem.classList.add("group-menu-item");
    copyPrimaryItem.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM64 112c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-16 0 0 24c0 13.3-10.7 24-24 24l-88 0-88 0c-13.3 0-24-10.7-24-24l0-24-16 0zm128-64a24 24 0 1 0 0 48 24 24 0 1 0 0-48z"/></svg> ${copyAction.label}`;
    copyPrimaryItem.addEventListener("click", () => {
        popover.remove();
        navigator.clipboard.writeText(copyAction.value).then(
            () => showToast(copyAction.success),
            () => showToast(t("lbr5_copy_failed"), true),
        );
    });

    // Any action widget converts between the four display styles straight
    // from the menu — the same restyle the drawer's Style step does at
    // creation. The current style is excluded.
    const DISPLAY_STYLE_LABELS = {
        "": () => t("grp_display_standard"),
        tile: () => t("wih20_opt_tile_label"),
        tile2: () => t("wih20_opt_tile2_label"),
    };
    const currentDisplay = widget.display || "";
    const displayVariantItems = Object.keys(DISPLAY_STYLE_LABELS)
        .filter((variant) => variant !== currentDisplay)
        .map((variant) => {
            const btn = document.createElement("button");
            btn.classList.add("group-menu-item");
            btn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 224c0 17.7 14.3 32 32 32s32-14.3 32-32c0-53 43-96 96-96l160 0 0 32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64c12.5-12.5 12.5-32.8 0-45.3l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S320 19.1 320 32l0 32L160 64C71.6 64 0 135.6 0 224z" fill="currentColor"/></svg> ' +
                t("lbr5_turn_into", [DISPLAY_STYLE_LABELS[variant]()]);
            btn.addEventListener("click", async () => {
                popover.remove();
                const { setShortcutDisplayVariant } = await import(
                    "../workspaces/workspace-grid-sync.js"
                );
                setShortcutDisplayVariant(widget.name, variant);
            });
            return btn;
        });

    const convertItem = document.createElement("button");
    convertItem.classList.add("group-menu-item");
    convertItem.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 288 448 288c17.7 0 32-14.3 32-32s-14.3-32-32-32L109.3 224l73.4-73.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-128 128z"/></svg> ${t("lbr5_convert_to_group", [widget.type === "clipboard-button" ? t("lbr5_type_clipboard") : widget.type === "launcher-button" ? t("lbr5_type_launcher") : t("lbr5_type_link")])}`;
    convertItem.addEventListener("click", () => {
        popover.remove();
        openConvertButtonToGroupModal(widget.name);
    });

    const moveItem = document.createElement("button");
    moveItem.classList.add("group-menu-item");
    moveItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 109.3 224l73.4-73.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0s-12.5-32.8 0-45.3L109.3 288l293.4 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3l128-128z"/></svg> ' + t("lbr5_move_to_workspace");
    moveItem.addEventListener("click", () => {
        popover.remove();
        const moveGroupCallback = getMoveGroupCallback();
        if (moveGroupCallback) moveGroupCallback(widget.name);
    });

    const deleteItem = document.createElement("button");
    deleteItem.classList.add("group-menu-item", "danger");
    deleteItem.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg> ' + t("lbr5_delete");
    deleteItem.addEventListener("click", () => {
        const widgetLabel =
            WIDGET_TYPE_LABELS[widget.type] || t("lbr5_widget_fallback");
        if (
            !confirm(
                t("lbr5_delete_confirm", [
                    widgetLabel.toLowerCase(),
                    widget.name,
                ]),
            )
        ) {
            return;
        }
        const snapshot = JSON.parse(JSON.stringify(getElements()));
        const widgetName = widget.name;
        const deletedIndex = snapshot.findIndex(
            (entry) => getWidgetEntryName(entry) === widgetName,
        );
        const deletedWidget =
            deletedIndex >= 0
                ? JSON.parse(JSON.stringify(snapshot[deletedIndex]))
                : null;

        popover.remove();
        const widgetEl = item.closest(".grid-stack-item");
        const grid = getOwningGrid(widgetEl);
        if (grid && widgetEl) grid.removeWidget(widgetEl);
        saveGridState();

        showUndoToast(t("lbr5_widget_deleted", [widgetName]), () => {
            if (!deletedWidget) return;

            const visibleNames = new Set(
                Array.from(
                    document.querySelectorAll(".grid-stack-item .item"),
                ).map((entry) => entry.dataset.name),
            );

            const currentElements = snapshot.filter((entry) =>
                visibleNames.has(getWidgetEntryName(entry)),
            );
            const alreadyExists = currentElements.some(
                (entry) => getWidgetEntryName(entry) === widgetName,
            );
            if (alreadyExists) return;

            const insertAt = snapshot
                .slice(0, deletedIndex)
                .filter((entry) =>
                    visibleNames.has(getWidgetEntryName(entry)),
                ).length;
            currentElements.splice(insertAt, 0, deletedWidget);
            updateElementsAndRerender(currentElements);
            saveGridState();
        });
    });

    popover.append(
        editItem,
        duplicateItem,
        ...(copyAction.hidden ? [] : [copyPrimaryItem]),
        ...displayVariantItems,
        convertItem,
        moveItem,
        deleteItem,
    );
    document.body.appendChild(popover);
    return { popover };
};

// ── Long-press drag for 1-column squares (icon links + tiles) ───────────────
// These variants have no hover drag handle. Holding the card ~350ms "arms" a
// full-cover .group-drag-handle surface and replays the press on it as a
// synthetic mousedown, handing the gesture to GridStack's drag system; a
// quick click still opens the link, and moving early keeps the browser's
// native link-drag (as on any anchor).
const LONG_PRESS_MS = 350;
const LONG_PRESS_TOLERANCE_PX = 6;
const attachLongPressDrag = (item, shell) => {
    const surface = document.createElement("div");
    surface.classList.add("group-drag-handle", "tile-drag-surface");
    shell.append(surface);

    let timer = null;
    let armed = false;
    let start = null;

    const disarm = () => {
        armed = false;
        surface.style.pointerEvents = "none";
        item.classList.remove("tile-drag-armed");
        document.removeEventListener("pointerup", disarm, true);
    };
    const cancelWait = () => {
        clearTimeout(timer);
        timer = null;
        document.removeEventListener("pointermove", onWaitMove, true);
        document.removeEventListener("pointerup", cancelWait, true);
    };
    // Compare against the FIXED press origin — comparing move-to-move would
    // let slow drift keep the timer alive and arm the drag far from where
    // the press began (mouse and widget out of sync).
    const onWaitMove = (event) => {
        if (
            Math.abs(event.clientX - start.x) > LONG_PRESS_TOLERANCE_PX ||
            Math.abs(event.clientY - start.y) > LONG_PRESS_TOLERANCE_PX
        ) {
            cancelWait();
        }
    };

    item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || armed) return;
        start = { x: event.clientX, y: event.clientY };
        cancelWait();
        document.addEventListener("pointermove", onWaitMove, true);
        document.addEventListener("pointerup", cancelWait, true);
        timer = setTimeout(() => {
            cancelWait();
            armed = true;
            item.classList.add("tile-drag-armed");
            surface.style.pointerEvents = "auto";
            document.addEventListener("pointerup", disarm, true);
            // Replay the (still held) press on the drag surface so
            // GridStack's mousedown listener picks the gesture up.
            surface.dispatchEvent(
                new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    clientX: start.x,
                    clientY: start.y,
                    button: 0,
                }),
            );
        }, LONG_PRESS_MS);
    });

    // No native HTML5 drags from these squares at all: the anchor AND the
    // favicon <img> are natively draggable, and a native drag ghost (with
    // its "forbidden" cursor) suppresses mouse events, desyncing the
    // long-press handoff to GridStack.
    item.addEventListener("dragstart", (event) => {
        event.preventDefault();
    });
};

export const createLinkButtonDOM = (widget, canEdit = true) => {
    const widgetType = LINK_WIDGET_TYPES.includes(widget.type)
        ? widget.type
        : "link-button";

    const item = document.createElement("div");
    item.classList.add("item", "link-button-item");
    item.dataset.name = widget.name || "";
    item.dataset.groupType = widgetType;
    item.dataset.url = widget.url || "";
    item.dataset.content = widget.content || "";
    item.dataset.launcherKind = widget.launcherKind || "";
    item.dataset.target = widget.target || "";
    item.dataset.psVisible = widget.visible ? "true" : "false";
    if (widgetType === "routine-button") {
        item.dataset.routineSteps = JSON.stringify(
            Array.isArray(widget.steps) ? widget.steps : [],
        );
        item.dataset.routineStagger =
            widget.stagger != null ? String(widget.stagger) : "";
    }
    item.dataset.groupIcon = widget.icon || "";
    item.dataset.groupIconColor = widget.iconColor || "";
    // Unset stays "" (readers fall back to the default size) so the default
    // is never baked into the serialized data — data → render → serialize
    // must round-trip unchanged (WI-1).
    item.dataset.groupIconSize = widget.iconSize || "";
    if (widget.targetOverride) {
        item.dataset.targetOverride = widget.targetOverride;
    }
    if (widget.display === "tile" || widget.display === "tile2") {
        // Tile = a square icon card. Not resizable; "tile2" spans 2 columns
        // and shows its caption in-card; the 1×1 tile shows icon only — at
        // one column wide a caption is unreadable, the tooltip carries the
        // name. (The former bare-favicon "icon" variant folded into "tile";
        // the sanitizer migrates stored data.)
        item.classList.add("link-button-tile");
        if (widget.display === "tile2") {
            item.classList.add("link-button-tile-2");
        }
        item.dataset.display = widget.display;
    }

    item.addEventListener("mousedown", (event) => {
        if (event.target.closest(".group-drag-handle, .group-menu-btn")) return;
        event.stopPropagation();
    });

    const shell = document.createElement("div");
    shell.classList.add("link-button-shell");

    const clickable =
        widgetType === "link-button"
            ? document.createElement("a")
            : document.createElement("button");
    clickable.classList.add("link-button-anchor");

    if (widgetType === "link-button") {
        const safeUrl = sanitizeLinkUrl(widget.url);
        clickable.href = safeUrl || "#";
        clickable.target =
            sanitizeLinkTarget(widget.targetOverride) ||
            sanitizeLinkTarget(window.linkTarget) ||
            "_self";
    } else {
        clickable.type = "button";
        clickable.classList.add("link-button-button");
    }

    const iconWrap = document.createElement("span");
    iconWrap.classList.add("icon", "link-button-icon");
    renderTopLevelWidgetIcon(iconWrap, widget);

    const text = document.createElement("span");
    text.classList.add("link-button-text");
    text.textContent = widget.name || "";

    // Tiles show no label — the name lives in the hover tooltip instead.
    if (
        (widget.display === "tile" || widget.display === "tile2") &&
        widget.name
    ) {
        clickable.title = widget.name;
    }

    clickable.append(iconWrap, text);

    if (widgetType === "routine-button") {
        const stepCount = Array.isArray(widget.steps) ? widget.steps.length : 0;
        const stepText =
            stepCount === 1
                ? t("lbr5_step_one", [stepCount])
                : t("lbr5_step_many", [stepCount]);
        if (widget.display === "tile2") {
            // Big routine tile: show the step count as its label text (the
            // name lives in the tooltip).
            text.textContent = stepText;
        } else if (widget.display !== "tile") {
            // Standard routine button: name + a step-count badge. The small
            // tile shows no count — it would push the icon up and clutter
            // the tile.
            const badge = document.createElement("span");
            badge.classList.add("routine-step-badge");
            badge.textContent = stepText;
            clickable.append(badge);
        }
    }

    shell.append(clickable);

    if (canEdit) {
        let popoverState = null;
        const openWidgetPopover = (anchorRect) => {
            popoverState = ensureLinkButtonPopover(popoverState, {
                widget,
                item,
            });
            const { popover } = popoverState;
            const isOpen = popover.classList.contains("open");
            document
                .querySelectorAll(
                    ".link-overflow-popover.open, .group-menu-popover.open",
                )
                .forEach((el) => el.remove());
            if (!isOpen) {
                popover.style.top = anchorRect.bottom + 4 + "px";
                popover.style.right =
                    window.innerWidth - anchorRect.right + "px";
                popover.classList.add("open");
            }
        };

        // 1-column tiles keep a clean face: no hover buttons —
        // right-click opens the menu, long-press drags.
        const isCompactSquare = widget.display === "tile";

        if (isCompactSquare) {
            item.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openWidgetPopover({
                    bottom: event.clientY,
                    right: event.clientX + 2,
                });
            });
            attachLongPressDrag(item, shell);
        } else {
            const controls = document.createElement("div");
            controls.classList.add(
                "button-group-container",
                "link-button-controls",
            );

            const dragHandle = document.createElement("div");
            dragHandle.classList.add("group-drag-handle");
            dragHandle.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2h4v4H2V2zm8 0h4v4h-4V2zM2 10h4v4H2v-4zm8 0h4v4h-4v-4z" fill="currentColor"/></svg>';

            const menuBtn = document.createElement("button");
            menuBtn.classList.add("group-menu-btn");
            menuBtn.title = t("lbr5_widget_options", [
                WIDGET_TYPE_LABELS[widgetType] || t("lbr5_widget_cap"),
            ]);
            menuBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 512"><path d="M64 360a56 56 0 1 0 0 112A56 56 0 1 0 64 360zm0-160a56 56 0 1 0 0 112A56 56 0 1 0 64 200zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/></svg>';

            menuBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                openWidgetPopover(menuBtn.getBoundingClientRect());
            });

            controls.append(dragHandle, menuBtn);
            shell.append(controls);
        }
    }

    item.append(shell);

    clickable.addEventListener("click", (event) => {
        if (widgetType !== "link-button") {
            event.preventDefault();
            executeActionItem(widget);
            return;
        }
        closeAllDrawers();
    });

    return item;
};
