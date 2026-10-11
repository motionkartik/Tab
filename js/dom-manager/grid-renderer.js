import { container, getElements } from "../variables.js";
import { GRID_COLS } from "../grid-columns.js";
import {
    createLinkWidgetContent,
    setCreateItemsHandler as setLinkItemCreateItemsHandler,
} from "./link-item-renderer.js";
import {
    createGroupDOM,
    setCreateItemsHandler as setGroupWidgetCreateItemsHandler,
} from "./group-widget-renderer.js";
import {
    createLinkButtonDOM,
    setCreateItemsHandler as setLinkButtonCreateItemsHandler,
} from "./link-button-renderer.js";
import { renderEmptyGroupActions } from "./empty-group-actions.js";
import {
    createSectionDOM,
    isSectionType,
    setSectionRenderHooks,
} from "./section-renderer.js";
import {
    saveGridState,
    getGrid,
    setGrid,
    getTopGrid,
    setTopGrid,
    autoGrowGroupToFitItems,
    autoShrinkGroupToFitItems,
    setRoundTripRenderers,
    scheduleRoundTripAssertion,
} from "./grid-state.js";
// Runtime-only use (drag handlers), so the workspace-grid-sync ↔ grid-renderer
// import cycle is resolved long before either is called.
import { promoteGroupItemToShortcut } from "../workspaces/workspace-grid-sync.js";

// Wire the section renderer's edit hooks to the real grid functions (the module
// itself imports nothing from grid-state so the reader can reuse it standalone).
setSectionRenderHooks({ onChange: saveGridState, getGrid });

const TOP_ZONE_TYPES = [
    "link-button",
    "clipboard-button",
    "launcher-button",
    "routine-button",
];

// Which zone a widget belongs to. Action buttons live in the top bar; everything
// else (groups, sections, todo-lists) lives in the free-placement main grid.
const widgetZoneType = (widget) => {
    const c =
        widget?.content && typeof widget.content === "object" && !Array.isArray(widget.content)
            ? widget.content
            : null;
    return (c?.type || widget?.type) ?? undefined;
};
// Action buttons default to the top bar but can be moved to the board; the chosen
// zone is persisted as `zone` ("top"|"main"). Groups/sections are always board.
export const isTopZoneWidget = (widget) => {
    const type = widgetZoneType(widget);
    if (!TOP_ZONE_TYPES.includes(type)) return false;
    return (widget?.zone ?? widget?.content?.zone) !== "main";
};

// Shift a zone's widgets so the topmost sits at y=0 (relative layout preserved).
// Removes the vertical gap left behind when the two zones are split out of a
// previously-single grid; idempotent once positions are already normalized.
const normalizeZoneY = (widgets) => {
    if (!widgets.length) return;
    const minY = Math.min(...widgets.map((w) => w.y || 0));
    if (!minY) return;
    widgets.forEach((w) => {
        w.y = (w.y || 0) - minY;
    });
};

// Drag affordance: tag <body> so CSS can outline the zones and label them. A
// shortcut (link-button) can land in either zone; other groups/sections only
// on the board.
const beginZoneDragHint = (el) => {
    const isShortcut = !!el?.classList?.contains("link-button-widget");
    document.body.classList.add("is-dragging");
    document.body.classList.toggle("dragging-shortcut", isShortcut);
    document.body.classList.toggle("dragging-block", !isShortcut);
};
const endZoneDragHint = () => {
    document.body.classList.remove(
        "is-dragging",
        "dragging-shortcut",
        "dragging-block",
    );
};

// ── Fixed-square cell sizing (tiles + icon links) ───────────────────────────
// Tile and icon-link cards span their column(s) at a fixed visual height, but
// grid rows are a fixed 10px — so their CELL height is derived from the live
// column width (cell ≈ span × column width, i.e. square) and re-applied when
// the board width changes, making vertical pitch equal horizontal pitch.
// Only the column SPAN is canonical in data (untrusted-input pins w); the
// derived h is serialized as-is so stored y/h stay mutually consistent, and
// the WI-1 round-trip assertion exempts h for squares.
const TILE_FALLBACK_ROWS = 8;
export const tileCellRows = (g, span = 1) => {
    const colW = typeof g?.cellWidth === "function" ? g.cellWidth() : 0;
    return Number.isFinite(colW) && colW > 0
        ? Math.max(3, Math.round((colW * span) / 10))
        : TILE_FALLBACK_ROWS * span;
};

// The column span of a fixed-square shortcut's rendered element (2 for the
// large tile, 1 for the small tile), or 0 when it isn't one.
const fixedSquareSpanOf = (el) => {
    if (el?.querySelector?.(".link-button-tile-2")) return 2;
    if (el?.querySelector?.(".link-button-tile")) return 1;
    return 0;
};

const refitTileCells = () => {
    [getTopGrid(), getGrid()].forEach((g) => {
        if (!g?.engine?.nodes?.length) return;
        const stale = g.engine.nodes
            .map((node) => {
                const span = fixedSquareSpanOf(node.el);
                return span ? { node, rows: tileCellRows(g, span) } : null;
            })
            .filter((entry) => entry && entry.node.h !== entry.rows);
        if (!stale.length) return;
        g.batchUpdate();
        stale.forEach(({ node, rows }) => g.update(node.el, { h: rows }));
        g.batchUpdate(false);
    });
};

let tileRefitTimer = null;
// While a drag (GridStack widget move/resize or a Sortable link drag) is in
// flight, square refits are DEFERRED: dragging constantly changes the board
// height, and letting the observer's grid.update() calls interleave with the
// drag engine's own layout work causes visible stutter. The one deferred
// refit runs on drag end.
let dragRefitPaused = false;
let refitDeferredByDrag = false;
const pauseRefitForDrag = () => {
    dragRefitPaused = true;
};
const resumeRefitAfterDrag = () => {
    if (!dragRefitPaused) return;
    dragRefitPaused = false;
    if (refitDeferredByDrag) {
        refitDeferredByDrag = false;
        scheduleTileRefit();
    }
};
const scheduleTileRefit = () => {
    if (dragRefitPaused) {
        refitDeferredByDrag = true;
        return;
    }
    clearTimeout(tileRefitTimer);
    tileRefitTimer = setTimeout(() => {
        // A drag may have started inside the debounce window.
        if (dragRefitPaused) {
            refitDeferredByDrag = true;
            return;
        }
        refitTileCells();
    }, 150);
};
// Observe the BODY, not just window resizes: a vertical scrollbar appearing
// (board grew taller) narrows every column by ~15px without firing a window
// resize, which used to leave squares slightly non-square until the next
// real resize. Only WIDTH changes matter to squares — height changes fire
// constantly (any content growth, every drag) and are ignored.
if (typeof ResizeObserver === "function") {
    let lastObservedBodyWidth = null;
    new ResizeObserver((entries) => {
        const width =
            entries[0]?.contentRect?.width ?? document.body.clientWidth;
        if (width === lastObservedBodyWidth) return;
        lastObservedBodyWidth = width;
        scheduleTileRefit();
    }).observe(document.body);
} else {
    window.addEventListener("resize", scheduleTileRefit);
}

export const createItems = (elements, canEdit) => {
    document
        .querySelectorAll(".link-overflow-popover, .group-menu-popover")
        .forEach((el) => el.remove());

    const localElements = elements || getElements();

    let widgets = [];
    let isMigrated = false;

    if (
        Array.isArray(localElements) &&
        localElements.length > 0 &&
        Array.isArray(localElements[0])
    ) {
        localElements.forEach((row, rowIndex) => {
            row.forEach((group, colIndex) => {
                widgets.push({
                    x: colIndex * 6,
                    y: rowIndex * 4,
                    w: 6,
                    h: 4,
                    content: group,
                    id: group.name,
                });
            });
        });
        isMigrated = true;
    } else {
        widgets = Array.isArray(localElements) ? localElements : [];
    }

    let grid = getGrid();
    let topGrid = getTopGrid();
    if (!grid) {
        if (typeof GridStack === "undefined") {
            console.error("GridStack is not loaded!");
            return;
        }
        container.innerHTML =
            '<div class="grid-stack grid-zone grid-zone-top"></div>' +
            '<div class="grid-stack grid-zone grid-zone-main"></div>';

        const common = {
            column: GRID_COLS,
            cellHeight: 10,
            animate: true,
            // v10 replaced oneColumnMode with columnOpts. Never pass the
            // legacy `disableOneColumnMode` here: its compat shim builds a
            // columnOpts whose columnMax DEFAULTS TO 12, and
            // checkDynamicColumn() then clamps the grid to 12 columns on any
            // container wider than 768px (this clamp is what broke the
            // earlier dynamic-column attempt). columnMax must equal
            // GRID_COLS; the breakpoints step the grid down on narrow
            // screens (sizing rules for .gs-2/.gs-6 live in
            // css/gridstack-24.css; .gs-12 ships with the GridStack bundle).
            columnOpts: {
                columnMax: GRID_COLS,
                breakpoints: [
                    { w: 520, c: 2 },
                    { w: 900, c: 6 },
                    { w: 1200, c: 12 },
                ],
            },
            staticGrid: false,
            margin: 10,
            draggable: {
                handle: ".group-drag-handle",
                scroll: true,
                appendTo: "body",
            },
        };

        // Top zone: prominent link-buttons. float:true = free placement, same
        // as the main board — no auto-packing gravity, widgets stay exactly
        // where the user drops them (existing boards keep their stored,
        // already-packed coordinates; nothing moves on upgrade).
        topGrid = GridStack.init(
            {
                ...common,
                float: true,
                acceptWidgets: ".link-button-widget",
            },
            container.querySelector(".grid-zone-top"),
        );

        // Main zone: groups + sections, free placement.
        grid = GridStack.init(
            {
                ...common,
                float: true,
                acceptWidgets:
                    ".group-widget, .section-widget, .link-button-widget, .new-widget",
                dragIn: ".new-widget",
            },
            container.querySelector(".grid-zone-main"),
        );

        setTopGrid(topGrid);
        setGrid(grid);

        [topGrid, grid].forEach((g) => {
            g.on("dragstop", () => {
                endZoneDragHint();
                resumeRefitAfterDrag();
                saveGridState();
            });
            g.on("resizestop", () => {
                resumeRefitAfterDrag();
                saveGridState();
            });
            // Cross-grid moves (e.g. a shortcut dragged from the bar to the board)
            // fire `dropped` on the receiving grid, not `dragstop` on the source.
            g.on("dropped", () => {
                resumeRefitAfterDrag();
                saveGridState();
            });
            // While dragging, light up the zones so the user sees where a widget
            // can land (both zones for shortcuts, board-only for groups/sections)
            // and pause square refits so the observer can't interleave
            // grid.update() layout work with the live drag.
            g.on("dragstart", (_event, el) => {
                pauseRefitForDrag();
                beginZoneDragHint(el);
            });
            g.on("resizestart", () => {
                pauseRefitForDrag();
            });
        });

        if (isMigrated) {
            saveGridState(widgets);
        }
    } else {
        grid.removeAll();
        grid.setStatic(false);
        if (topGrid) {
            topGrid.removeAll();
            topGrid.setStatic(false);
        }
    }

    if (!grid || !topGrid) return;

    // Preserve saved coordinates, including intentional space above a board.
    // Only old nested-row migrations need their newly split origins normalized.
    const topWidgets = widgets.filter(isTopZoneWidget);
    const mainWidgets = widgets.filter((w) => !isTopZoneWidget(w));
    if (isMigrated) {
        normalizeZoneY(topWidgets);
        normalizeZoneY(mainWidgets);
    }

    [topGrid, grid].forEach((g) => g.el.classList.remove("grid-stack-animate"));

    topGrid.batchUpdate(true);
    topWidgets.forEach((widget) => {
        const entry = addWidgetToGrid(widget, canEdit, topGrid);
        // Icon zones are the only group type allowed in the top bar; their
        // items (like main-grid groups) need initGroupItems to render.
        if (entry)
            initGroupItems(entry.itemsContainer, entry.groupData, canEdit);
    });
    topGrid.batchUpdate(false);

    grid.batchUpdate(true);
    mainWidgets.forEach((widget) => {
        const entry = addWidgetToGrid(widget, canEdit, grid);
        if (entry)
            initGroupItems(entry.itemsContainer, entry.groupData, canEdit);
    });
    grid.batchUpdate(false);

    // Only lock the grids for managed (read-only) workspaces.
    if (!canEdit) {
        grid.setStatic(true);
        topGrid.setStatic(true);
    }

    // WI-1: freshly loaded, non-legacy data must survive render → serialize
    // unchanged — this anchor (storage data, not DOM-derived data) is what
    // catches a renderer dropping a field or the serializer misreading one.
    // Legacy shapes (nested rows, content-object widgets) are normalized by
    // this very render, so they can't round-trip by definition and are
    // exempt; the next save rewrites them canonically anyway.
    const hasLegacyShapes =
        isMigrated ||
        widgets.some((w) => w && w.content && typeof w.content === "object");
    if (!hasLegacyShapes) scheduleRoundTripAssertion(widgets);

    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            [topGrid, grid].forEach((g) =>
                g.el.classList.add("grid-stack-animate"),
            );
            // Layout is settled — correct tile cell heights measured off a
            // pre-layout column width.
            refitTileCells();
        }),
    );
};

export const initGroupItems = (itemsContainer, groupData, canEdit = true) => {
    if (!itemsContainer) return;

    const sortedItems = [...groupData.items].sort(
        (a, b) => (a.y ?? 0) - (b.y ?? 0),
    );

    // Normalize each item's y to its sorted position. Item identity in
    // add/edit/delete is resolved by y (findItemIndexByY), so a missing or
    // duplicated y lets one item's y collide with another's implicit index —
    // editing then targets the wrong item. Rendering is the one place every
    // group's items are walked in order, so we heal the invariant here (the
    // same y = index contract the full serializer enforces). Mutating the
    // shared item objects fixes the in-memory data immediately, so the next
    // edit is reliable even before a save persists it.
    sortedItems.forEach((item, index) => {
        item.y = index;
    });

    // Empty standard groups get inline quick-fill buttons instead of dead
    // space. We still fall through to Sortable.create below so the empty group
    // stays a valid drop target for links dragged in from other groups; the
    // CTA buttons are cleared in onAdd once the first item lands.
    if (
        canEdit &&
        sortedItems.length === 0 &&
        (groupData.type || "standard") !== "todo-list"
    ) {
        renderEmptyGroupActions(itemsContainer, groupData);
    }


    sortedItems.forEach((item, index) => {
        const linkItem = document.createElement("div");
        linkItem.classList.add("link-item");

        const linkWidgetContent = createLinkWidgetContent(
            item,
            index,
            groupData.name,
            canEdit,
        );
        linkItem.appendChild(linkWidgetContent);

        itemsContainer.appendChild(linkItem);
    });

    if (canEdit) {
        // Re-fit a group after a drag changed its item count. Waits past
        // Sortable's 150ms move animation (which transforms items and would
        // skew getBoundingClientRect measurements) before measuring, and is
        // gated by the same setting as add/delete auto-sizing.
        const refitGroupFromContainer = (container, shrink) => {
            if (window.autoGrowGroupsOnItemAdd === false) return;
            const groupName = container?.closest(".item")?.dataset.name;
            if (!groupName) return;
            setTimeout(() => {
                if (shrink) autoShrinkGroupToFitItems(groupName);
                else autoGrowGroupToFitItems(groupName);
            }, 200);
        };

        Sortable.create(itemsContainer, {
            group: "shared-items",
            animation: 150,
            handle: ".dragHandle",
            // Use Sortable's own pointer-driven drag, not native HTML5 DnD.
            // Native DnD fires `dragover` (not `pointermove`), so the
            // drag-out-to-board pointer tracking below would never see the
            // cursor. Fallback mode fires pointer events, which also makes the
            // gesture driveable in tests.
            forceFallback: true,
            fallbackTolerance: 4,
            // Append the drag clone to <body> so its fixed positioning is
            // relative to the viewport. Left in the source container it tracks
            // fine until the item crosses into another list, then that
            // container's layout shifts under it and the clone jumps to 0,0.
            fallbackOnBody: true,
            // Only real items are sortable — keeps the empty-group CTA wrap
            // from being treated as a draggable/positionable list entry.
            draggable: ".link-item",
            ghostClass: "sortable-ghost",
            chosenClass: "sortable-chosen",
            dragClass: "sortable-drag",
            onStart: function (evt) {
                // In-group drags also move the board height (group refits on
                // add/remove), so square refits pause here too.
                pauseRefitForDrag();
                sortableDragPointer = null;
                sortableDragItem = evt.item;
                document.addEventListener(
                    "pointermove",
                    trackSortableDragPointer,
                );
            },
            // Item dropped into this group from another → grow to fit it.
            onAdd: function (evt) {
                // First drop into a previously-empty group: drop the quick-fill
                // CTAs so they don't sit alongside the new item.
                evt.to.querySelector(".empty-group-actions")?.remove();
                evt.to.classList.remove("has-empty-actions");
                refitGroupFromContainer(evt.to, false);
            },
            // Item dragged out of this group into another → shrink to reclaim
            // the freed space and pull the widgets below it up.
            onRemove: function (evt) {
                // Last item left a standard group → bring back the empty-group
                // quick-fill CTAs (mirror of the onAdd removal above).
                if (
                    (groupData.type || "standard") !== "todo-list" &&
                    !evt.from.querySelector(".link-item")
                ) {
                    renderEmptyGroupActions(evt.from, groupData);
                }
                refitGroupFromContainer(evt.from, true);
            },
            onEnd: function (evt) {
                document.removeEventListener(
                    "pointermove",
                    trackSortableDragPointer,
                );
                if (dropPlaceholderRaf !== null) {
                    cancelAnimationFrame(dropPlaceholderRaf);
                    dropPlaceholderRaf = null;
                }
                hideDropPlaceholder();
                resumeRefitAfterDrag();
                sortableDragItem = null;
                const pointer = sortableDragPointer;
                sortableDragPointer = null;
                // A link tile dropped on the empty board (not on any group)
                // becomes a top-level icon Shortcut — the drag-out gesture.
                if (pointer && tryPromoteTileToBoard(evt, pointer)) return;
                saveGridState();
            },
        });
    }
};

// ── Dragging a group/tile item OUT onto the board ──────────────────────────
// Group items are Sortable; the board is GridStack. Sortable reverts an item
// dropped outside any list, so we detect "dropped over empty board" and
// promote the (link) item to a top-level icon Shortcut via the verified core.
// In-group item kinds that can be dragged out to a top-level board widget
// (link→link-button, clipboard→clipboard-button, launcher→launcher-button,
// routine→routine-button). Others (header/divider/text/todo) can't promote.
const PROMOTABLE_TILE_TYPES = new Set([
    "link",
    "clipboard",
    "launcher",
    "routine",
]);

let sortableDragPointer = null;
// The tile being Sortable-dragged (set in onStart) so the synthetic placeholder
// knows whether it is a promotable item.
let sortableDragItem = null;

// A Sortable drag draws no GridStack placeholder on the board, so when a link
// tile is dragged over the empty board (where it would promote to an icon
// Shortcut) draw our own box, snapped to the same 24-column / 10px-row cell the
// tile will land in. Hidden over lists, where Sortable's own gap already shows.
let dropPlaceholderEl = null;
const ensureDropPlaceholder = () => {
    if (!dropPlaceholderEl) {
        dropPlaceholderEl = document.createElement("div");
        dropPlaceholderEl.className = "rt-drop-placeholder";
        dropPlaceholderEl.style.display = "none";
        document.body.appendChild(dropPlaceholderEl);
    }
    return dropPlaceholderEl;
};
const hideDropPlaceholder = () => {
    if (dropPlaceholderEl) dropPlaceholderEl.style.display = "none";
};
const updateDropPlaceholder = (pointer) => {
    const content = sortableDragItem?.querySelector?.(".link-widget-content");
    if (!content || !PROMOTABLE_TILE_TYPES.has(content.dataset.type || "link")) {
        hideDropPlaceholder();
        return;
    }
    const under = document.elementFromPoint(pointer.x, pointer.y);
    const grid = under?.closest?.(".grid-stack");
    // Over a list (zone/group) or off the board → Sortable's own gap applies.
    if (!grid || under.closest(".items-container")) {
        hideDropPlaceholder();
        return;
    }
    const rect = grid.getBoundingClientRect();
    const colW = rect.width / GRID_COLS;
    // Every promoted tile is a 1-column icon link, whatever its type.
    const col = Math.min(
        GRID_COLS - 1,
        Math.max(0, Math.floor((pointer.x - rect.left) / colW)),
    );
    const row = Math.max(0, Math.round((pointer.y - rect.top) / 10));
    const el = ensureDropPlaceholder();
    el.style.display = "block";
    el.style.left = `${rect.left + col * colW}px`;
    el.style.top = `${rect.top + row * 10}px`;
    el.style.width = `${colW}px`;
    // Preview the square the promoted icon link will actually occupy: its
    // cell height is derived from the column width (same rounding as
    // tileCellRows), not a fixed 8 rows — a hard-coded 80px previewed a
    // squat rectangle on wide boards and rows below shifted on drop.
    el.style.height = `${Math.max(3, Math.round(colW / 10)) * 10}px`;
};
let dropPlaceholderRaf = null;
const trackSortableDragPointer = (event) => {
    sortableDragPointer = { x: event.clientX, y: event.clientY };
    // Coalesce placeholder updates to one per frame. pointermove can fire
    // several times per frame (and >60Hz on high-refresh mice); each update
    // interleaves layout READS (elementFromPoint, getBoundingClientRect)
    // with style WRITES on the placeholder, so running it per event forced
    // a synchronous layout every event, on top of Sortable's own fallback
    // per-move work. One rAF per frame reads once, writes once.
    if (dropPlaceholderRaf !== null) return;
    dropPlaceholderRaf = requestAnimationFrame(() => {
        dropPlaceholderRaf = null;
        if (sortableDragPointer) updateDropPlaceholder(sortableDragPointer);
    });
};

const tryPromoteTileToBoard = (evt, pointer) => {
    const content = evt.item?.querySelector?.(".link-widget-content");
    if (!content || !PROMOTABLE_TILE_TYPES.has(content.dataset.type || "link"))
        return false;
    const under = document.elementFromPoint(pointer.x, pointer.y);
    if (!under) return false;
    // If the drop landed inside a group's item list, Sortable already handled
    // it (reorder or cross-group move) — leave it alone.
    if (under.closest(".items-container")) return false;
    // Must be over a board grid zone to count as a board drop.
    if (!under.closest(".grid-stack")) return false;
    const sourceGroupName = evt.from?.closest?.(".item")?.dataset.name;
    const itemName = content.dataset.name;
    if (!sourceGroupName || !itemName) return false;
    // Land where it was released: shortcut bar vs free layout.
    const targetZone = under.closest(".grid-zone-top") ? "top" : "main";
    // Convert the drop point into a grid cell so the new Shortcut lands under
    // the cursor instead of at the bottom (24 columns; 10px cellHeight).
    const grid = under.closest(".grid-stack");
    const rect = grid.getBoundingClientRect();
    const colW = rect.width / GRID_COLS;
    const position = {
        x: Math.min(
            GRID_COLS - 1,
            Math.max(0, Math.floor((pointer.x - rect.left) / colW)),
        ),
        y: Math.max(0, Math.round((pointer.y - rect.top) / 10)),
    };
    promoteGroupItemToShortcut(sourceGroupName, itemName, targetZone, position);
    return true;
};

export const addWidgetToGrid = (widgetData, canEdit = true, targetGrid) => {
    const group =
        widgetData.content &&
        typeof widgetData.content === "object" &&
        !Array.isArray(widgetData.content)
            ? widgetData.content
            : widgetData;
    const widgetType = group.type || widgetData.type;
    const isTopLevelActionWidget = [
        "link-button",
        "clipboard-button",
        "launcher-button",
        "routine-button",
    ].includes(widgetType);
    const isSectionWidget = isSectionType(widgetType);

    const groupData = {
        name: group.name || widgetData.name,
        type: widgetType || "standard",
        items: group.items || widgetData.items || [],
        icon: group.icon || widgetData.icon || "",
        iconColor: group.iconColor || widgetData.iconColor || "",
        iconSize: group.iconSize || widgetData.iconSize || "",
        url: group.url || widgetData.url || "",
        content: group.content || widgetData.content || "",
        launcherKind: group.launcherKind || widgetData.launcherKind || "",
        target: group.target || widgetData.target || "",
        visible: group.visible || widgetData.visible || false,
        steps: group.steps || widgetData.steps || undefined,
        stagger: group.stagger ?? widgetData.stagger ?? undefined,
        targetOverride: group.targetOverride || widgetData.targetOverride || "",
        style: group.style || widgetData.style || undefined,
        display: group.display || widgetData.display || undefined,
        // section fields
        text: group.text ?? widgetData.text ?? "",
        level: group.level || widgetData.level || undefined,
        align: group.align || widgetData.align || undefined,
        surface: group.surface || widgetData.surface || undefined,
        variant: group.variant || widgetData.variant || undefined,
        thickness: group.thickness ?? widgetData.thickness ?? undefined,
        src: group.src || widgetData.src || undefined,
        avatar: group.avatar || widgetData.avatar || undefined,
        fit: group.fit || widgetData.fit || undefined,
        filekind: group.filekind || widgetData.filekind || undefined,
        number: group.number ?? widgetData.number ?? undefined,
        direction: group.direction || widgetData.direction || undefined,
    };

    const contentNode = isTopLevelActionWidget
        ? createLinkButtonDOM(groupData, canEdit)
        : isSectionWidget
          ? createSectionDOM(groupData, canEdit)
          : createGroupDOM(groupData);

    const grid = targetGrid || getGrid();
    if (!grid) return null;

    // Square tiles have a fixed size — no resize handle; their cell height
    // is computed square from the live column width (tileCellRows) and the
    // derived value is serialized as-is (only the column span is pinned).
    // Any action widget (link / clipboard / launcher / routine) in a square
    // style is fixed-size — keyed off display, NOT the widget type.
    const isFixedSizeShortcut =
        isTopLevelActionWidget &&
        (groupData.display === "tile" || groupData.display === "tile2");
    const fixedSquareSpan = groupData.display === "tile2" ? 2 : 1;

    const widget = grid.addWidget({
        x: widgetData.x,
        y: widgetData.y,
        w: isFixedSizeShortcut ? fixedSquareSpan : widgetData.w,
        h: isFixedSizeShortcut
            ? tileCellRows(grid, fixedSquareSpan)
            : widgetData.h,
        minH: isTopLevelActionWidget
            ? isFixedSizeShortcut
                ? 2
                : 6
            : isSectionWidget
              ? ["section-callout", "section-code"].includes(widgetType)
                  ? 5
                  : widgetType === "section-file"
                    ? 11
                    : widgetType === "section-linkcard"
                      ? 8
                      : widgetType === "section-stepheader"
                        ? 4
                        : 2
              : 12,
        noResize: isFixedSizeShortcut || undefined,
        content: "",
        id: widgetData.id || groupData.name,
    });

    widget.classList.add(
        isTopLevelActionWidget
            ? "link-button-widget"
            : isSectionWidget
              ? "section-widget"
              : "group-widget",
    );
    const contentContainer = widget.querySelector(".grid-stack-item-content");
    if (contentContainer) {
        contentContainer.appendChild(contentNode);
    } else {
        widget.appendChild(contentNode);
    }

    if (isTopLevelActionWidget || isSectionWidget) {
        if (widgetData.style && Object.keys(widgetData.style).length) {
            contentNode.dataset.widgetStyle = JSON.stringify(widgetData.style);
            Object.entries(widgetData.style).forEach(([prop, val]) => {
                if (val) {
                    contentNode.style.setProperty(prop, val);
                    if (contentContainer) {
                        contentContainer.style.setProperty(prop, val);
                    }
                }
            });
        }
        return null;
    }

    const itemsContainer = contentNode.querySelector(".items-container");

    if (widgetData.collapsed) {
        const itemEl = contentNode;
        const itemsToHide = contentNode.querySelector(".items-container");
        const todoFooterToHide =
            contentNode.querySelector(".todo-group-footer");
        const collapseBtn = contentNode.querySelector(".collapse-group-button");
        itemEl.classList.add("is-collapsed");
        if (itemsToHide) itemsToHide.style.display = "none";
        if (todoFooterToHide) todoFooterToHide.style.display = "none";
        if (collapseBtn) collapseBtn.dataset.prevH = widgetData.h || 12;
        grid.update(widget, { h: 9, minH: 9 });
    }

    if (widgetData.style && Object.keys(widgetData.style).length) {
        contentNode.dataset.groupStyle = JSON.stringify(widgetData.style);
        Object.entries(widgetData.style).forEach(([prop, val]) => {
            if (val) {
                contentNode.style.setProperty(prop, val);
                if (contentContainer)
                    contentContainer.style.setProperty(prop, val);
            }
        });
    }

    let hoverTimer = null;

    widget.addEventListener("mouseenter", () => {
        if (!contentNode.classList.contains("is-collapsed")) return;
        hoverTimer = setTimeout(() => {
            if (!contentNode.classList.contains("is-collapsed")) return;
            const collapseBtn = contentNode.querySelector(
                ".collapse-group-button",
            );
            const subGridEl2 = contentNode.querySelector(".grid-stack");
            const prevH = parseInt(collapseBtn?.dataset.prevH) || 12;
            contentNode.classList.remove("is-collapsed");
            if (subGridEl2) subGridEl2.style.display = "";
            const itemsContainerEl =
                contentNode.querySelector(".items-container");
            const todoFooterEl =
                contentNode.querySelector(".todo-group-footer");
            if (itemsContainerEl) itemsContainerEl.style.display = "";
            if (todoFooterEl) todoFooterEl.style.display = "";
            const currentGrid = getGrid();
            if (currentGrid) currentGrid.update(widget, { h: prevH, minH: 12 });
            widget.dataset.hoverExpanded = "1";
        }, 200);
    });

    widget.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        if (!widget.dataset.hoverExpanded) return;
        delete widget.dataset.hoverExpanded;
        const collapseBtn = contentNode.querySelector(".collapse-group-button");
        const itemsContainer2 = contentNode.querySelector(".items-container");
        const todoFooter2 = contentNode.querySelector(".todo-group-footer");
        const currentH = widget?.gridstackNode?.h || 12;
        if (collapseBtn) collapseBtn.dataset.prevH = currentH;
        contentNode.classList.add("is-collapsed");
        if (itemsContainer2) itemsContainer2.style.display = "none";
        if (todoFooter2) todoFooter2.style.display = "none";
        const currentGrid = getGrid();
        if (currentGrid) currentGrid.update(widget, { h: 9, minH: 9 });
    });

    return itemsContainer ? { itemsContainer, groupData } : null;
};

setLinkItemCreateItemsHandler(createItems);
setGroupWidgetCreateItemsHandler(createItems);
setLinkButtonCreateItemsHandler(createItems);
// WI-1: hand the real render entry points (and the real zone predicate) to
// the DEV round-trip assertion so it re-renders through exactly the code the
// live board uses.
setRoundTripRenderers({ addWidgetToGrid, initGroupItems, isTopZoneWidget });
