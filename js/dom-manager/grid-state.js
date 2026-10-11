import { setElements } from "../variables.js";
// Web build: ship build — dev-only round-trip assertions stay off.
const DEV_MODE = false;

// Routine steps are stored as a JSON string in a data attribute so the
// structured steps[] array survives the DOM-as-truth serialization model.
function parseRoutineSteps(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// GridStack omits gs-w/gs-h from the DOM when the span is 1 (like gs-x/gs-y at
// 0). A missing width/height therefore means 1 — reading it as the old 12/3/8
// "creation default" snapped any widget a user resized down to a single
// column/row back to full size on the next reload.
function readGridSpan(node, attr) {
    const parsed = parseInt(node.getAttribute(attr), 10);
    return Number.isNaN(parsed) ? 1 : parsed;
}

let grid = null; // main (bottom) grid — free placement, float:true
let topGrid = null; // top action-bar grid — link-buttons, float:true (free placement)
let workspaceUpdateCallback = null;
let moveGroupCallback = null;
let saveTimeout = null;

export const setGrid = (nextGrid) => {
    grid = nextGrid;
};

export const getGrid = () => grid;

export const setTopGrid = (nextGrid) => {
    topGrid = nextGrid;
};

export const getTopGrid = () => topGrid;

// Returns the GridStack instance that actually owns a DOM element (works across
// both zones), falling back to the main grid.
export const getOwningGrid = (el) =>
    el?.closest?.(".grid-stack-item")?.gridstackNode?.grid || grid;

export const setWorkspaceUpdateCallback = (callback) => {
    workspaceUpdateCallback = callback;
};

export const getWorkspaceUpdateCallback = () => workspaceUpdateCallback;

export const setMoveGroupCallback = (fn) => {
    moveGroupCallback = fn;
};

export const getMoveGroupCallback = () => moveGroupCallback;

/**
 * Measure how many grid rows a group needs to exactly contain its items — by
 * reading real rendered heights, not by guessing a pixels-per-cell formula.
 *
 * GridStack always lays a widget out as a whole number of rows, so the widget's
 * rendered height divided by its current row count gives the true per-row pixel
 * size for this grid/theme/zoom. The fixed "chrome" (group header, paddings,
 * GridStack's margin insets) is just the gap between the widget and its scroll
 * container, and is constant as rows change. The content height is measured from
 * the items themselves (their box plus the leading/trailing margins that
 * getBoundingClientRect leaves out). The smallest row count whose container is
 * tall enough for that content is then exact.
 *
 * Returns the current row count when it can't measure (so callers no-op).
 */
export const measureFitRows = (widgetEl, itemsContainer, node) => {
    const currentRows = node.h || 1;
    const outerH = widgetEl.getBoundingClientRect().height;
    if (outerH <= 0) return currentRows;

    const pxPerRow = outerH / currentRows; // measured, not assumed
    const chrome = outerH - itemsContainer.clientHeight; // header + insets

    const children = itemsContainer.children;
    if (!children.length) return currentRows;
    const firstEl = children[0];
    const lastEl = children[children.length - 1];
    const cs = getComputedStyle(itemsContainer);
    const contentH =
        lastEl.getBoundingClientRect().bottom -
        firstEl.getBoundingClientRect().top +
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(getComputedStyle(firstEl).marginTop) +
        parseFloat(getComputedStyle(lastEl).marginBottom);

    // +2px absorbs sub-pixel rounding (clientHeight is integer, contentH is
    // fractional) so an "exact" fit can't leave a 1px overflow scrollbar.
    return Math.max(1, Math.ceil((contentH + chrome + 2) / pxPerRow));
};

export const saveGridState = (manualWidgets) => {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
        performSaveGridState(manualWidgets);
    }, 500);
};

export const flushGridState = () => {
    if (!grid || !saveTimeout) return;
    clearTimeout(saveTimeout);
    saveTimeout = null;
    performSaveGridState();
};

/**
 * Cancel any pending debounced grid save WITHOUT persisting it.
 *
 * This must be called before re-rendering the grid from freshly reloaded
 * storage (e.g. cross-tab sync). Otherwise a debounce timer scheduled against
 * the OLD DOM can fire after the reload and serialize the stale DOM back into
 * `workspacesData`, overwriting the whole map for every workspace.
 */
export const cancelPendingGridSave = () => {
    if (!saveTimeout) return;
    clearTimeout(saveTimeout);
    saveTimeout = null;
};

export const autoGrowGroupToFitItems = (groupName) => {
    if (!grid || !groupName) return;

    const widgetEl = grid.getGridItems().find((gridItem) => {
        const content = gridItem.querySelector(".item");
        return content?.dataset.name === groupName;
    });
    if (!widgetEl) return;

    const content = widgetEl.querySelector(".item");
    if (content?.classList.contains("is-collapsed")) return;

    const itemsContainer = widgetEl.querySelector(".items-container");
    if (!itemsContainer) return;

    const node = widgetEl.gridstackNode;
    if (!node) return;

    const targetRows = measureFitRows(widgetEl, itemsContainer, node);
    if (targetRows <= (node.h || 1)) return; // grow only

    grid.update(widgetEl, { h: targetRows });
    saveGridState();
};

/**
 * After a group shrinks by `delta` cells, slide widgets that sit below it
 * (sharing at least one column) upward by up to `delta` cells, stopping each
 * one before it would collide with whatever is above it. The main grid uses
 * float:true and never compacts on its own, so we do it by hand.
 */
const pullWidgetsBelowUp = (gNode, delta) => {
    if (!grid || delta <= 0) return;

    const nodes = grid
        .getGridItems()
        .map((el) => el.gridstackNode)
        .filter(Boolean);

    const overlapsCols = (n, x1, x2) => n.x < x2 && n.x + n.w > x1;
    const gBottom = gNode.y + gNode.h; // h already updated to the new value

    const movable = nodes
        .filter(
            (n) =>
                n !== gNode &&
                n.y >= gBottom &&
                overlapsCols(n, gNode.x, gNode.x + gNode.w),
        )
        .sort((a, b) => a.y - b.y);

    for (const n of movable) {
        // Default: rise by the freed space, preserving any pre-existing gap.
        let targetY = Math.max(0, n.y - delta);
        // Never overlap a widget already occupying this one's columns above it.
        // Processing top-to-bottom means already-moved widgets are blockers too,
        // so a column of stacked widgets slides up together.
        for (const other of nodes) {
            if (other === n) continue;
            if (!overlapsCols(other, n.x, n.x + n.w)) continue;
            const otherBottom = other.y + other.h;
            if (otherBottom <= n.y) targetY = Math.max(targetY, otherBottom);
        }
        if (targetY < n.y) grid.update(n.el, { y: targetY });
    }
};

/**
 * Shrink a group so it no longer reserves empty space below its content, then
 * pull the widgets beneath it up to close the gap. Mirrors
 * `autoGrowGroupToFitItems` and is gated by the same setting at the call site.
 */
export const autoShrinkGroupToFitItems = (groupName) => {
    if (!grid || !groupName) return;

    const widgetEl = grid.getGridItems().find((gridItem) => {
        const content = gridItem.querySelector(".item");
        return content?.dataset.name === groupName;
    });
    if (!widgetEl) return;

    const content = widgetEl.querySelector(".item");
    if (content?.classList.contains("is-collapsed")) return;

    const itemsContainer = widgetEl.querySelector(".items-container");
    if (!itemsContainer) return;

    const node = widgetEl.gridstackNode;
    if (!node) return;

    const oldH = node.h || 1;
    const minH = node.minH || 1;
    const newH = Math.max(minH, measureFitRows(widgetEl, itemsContainer, node));
    const delta = oldH - newH;
    if (delta <= 0) return; // shrink only

    grid.update(widgetEl, { h: newH });
    pullWidgetsBelowUp(node, delta);
    saveGridState();
};

// Serialize one rendered grid-stack item back into its persisted widget shape.
// Shared by the live save and the DEV round-trip assertion so both read the
// DOM with exactly the same code. Returns null for nodes without content.
const serializeWidgetNode = (itemNode, inTopZone) => {
    const contentDiv = itemNode.querySelector(".item");
    if (!contentDiv) return null;

    const name = contentDiv.dataset.name;

    if (
        [
            "section-header",
            "section-stepheader",
            "section-text",
            "section-divider",
            "section-arrow",
            "section-callout",
            "section-code",
            "section-steps",
            "section-image",
            "section-profile",
            "section-linkcard",
            "section-file",
        ].includes(contentDiv.dataset.groupType)
    ) {
        const sType = contentDiv.dataset.groupType;
        const widgetData = {
            name,
            type: sType,
            x: parseInt(itemNode.getAttribute("gs-x")) || 0,
            y: parseInt(itemNode.getAttribute("gs-y")) || 0,
            w: readGridSpan(itemNode, "gs-w"),
            h: readGridSpan(itemNode, "gs-h"),
            id: itemNode.getAttribute("gs-id") || name,
            align: contentDiv.dataset.align || undefined,
            surface:
                contentDiv.dataset.surface === "panel"
                    ? "panel"
                    : undefined,
        };
        if (sType === "section-header") {
            widgetData.text = contentDiv.dataset.text || "";
            widgetData.level = contentDiv.dataset.level || undefined;
        } else if (sType === "section-stepheader") {
            widgetData.text = contentDiv.dataset.text || "";
            widgetData.number =
                parseInt(contentDiv.dataset.number, 10) || 1;
        } else if (sType === "section-arrow") {
            widgetData.direction =
                contentDiv.dataset.direction || undefined;
        } else if (
            sType === "section-text" ||
            sType === "section-code" ||
            sType === "section-steps"
        ) {
            widgetData.content = contentDiv.dataset.content || "";
        } else if (sType === "section-callout") {
            widgetData.content = contentDiv.dataset.content || "";
            widgetData.variant = contentDiv.dataset.variant || undefined;
        } else if (sType === "section-divider") {
            widgetData.thickness =
                parseInt(contentDiv.dataset.thickness, 10) || undefined;
        } else if (sType === "section-image") {
            widgetData.src = contentDiv.dataset.src || "";
            widgetData.fit = contentDiv.dataset.fit || undefined;
        } else if (sType === "section-profile") {
            widgetData.avatar = contentDiv.dataset.avatar || undefined;
            widgetData.text = contentDiv.dataset.text || "";
            widgetData.content = contentDiv.dataset.content || "";
        } else if (sType === "section-linkcard") {
            widgetData.src = contentDiv.dataset.src || "";
            widgetData.url = contentDiv.dataset.url || "";
            widgetData.text = contentDiv.dataset.text || "";
            widgetData.content = contentDiv.dataset.content || "";
        } else if (sType === "section-file") {
            widgetData.url = contentDiv.dataset.url || "";
            widgetData.text = contentDiv.dataset.text || "";
            widgetData.filekind = contentDiv.dataset.filekind || undefined;
        }
        return widgetData;
    }

    if (
        [
            "link-button",
            "clipboard-button",
            "launcher-button",
            "routine-button",
        ].includes(contentDiv.dataset.groupType)
    ) {
        let widgetStyle = undefined;
        if (contentDiv.dataset.widgetStyle) {
            try {
                widgetStyle = JSON.parse(
                    contentDiv.dataset.widgetStyle,
                );
            } catch (e) {
                console.warn(
                    "[dom-manager] Invalid widgetStyle JSON:",
                    e.message,
                );
            }
        }

        const widgetData = {
            name,
            x: parseInt(itemNode.getAttribute("gs-x")) || 0,
            y: parseInt(itemNode.getAttribute("gs-y")) || 0,
            w: readGridSpan(itemNode, "gs-w"),
            h: readGridSpan(itemNode, "gs-h"),
            id: itemNode.getAttribute("gs-id") || name,
            type: contentDiv.dataset.groupType,
            icon: contentDiv.dataset.groupIcon || undefined,
            iconColor: contentDiv.dataset.groupIconColor || undefined,
            iconSize: contentDiv.dataset.groupIconSize || undefined,
            targetOverride:
                contentDiv.dataset.targetOverride || undefined,
            style: widgetStyle || undefined,
        };

        if (contentDiv.dataset.groupType === "link-button") {
            widgetData.url = contentDiv.dataset.url || "";
        }
        if (contentDiv.dataset.groupType === "clipboard-button") {
            widgetData.content = contentDiv.dataset.content || "";
        }
        if (contentDiv.dataset.groupType === "launcher-button") {
            widgetData.launcherKind =
                contentDiv.dataset.launcherKind || undefined;
            widgetData.target = contentDiv.dataset.target || "";
            if (contentDiv.dataset.launcherKind === "powershell") {
                widgetData.visible =
                    contentDiv.dataset.psVisible === "true";
            }
        }
        if (contentDiv.dataset.groupType === "routine-button") {
            widgetData.steps = parseRoutineSteps(
                contentDiv.dataset.routineSteps,
            );
            const stagger = parseInt(
                contentDiv.dataset.routineStagger,
                10,
            );
            if (!Number.isNaN(stagger)) widgetData.stagger = stagger;
        }

        // Persist which zone the action button currently lives in, so a
        // shortcut moved onto the board stays there across reloads. "top" is
        // the default and is omitted: the sanitizer already strips it on
        // write, and a single canonical form is what lets the WI-1 round-trip
        // assertion anchor on loaded data.
        if (!inTopZone) widgetData.zone = "main";
        if (
            contentDiv.dataset.display === "tile" ||
            contentDiv.dataset.display === "tile2"
        ) {
            widgetData.display = contentDiv.dataset.display;
        }
        // Fixed-square shortcuts render a cell height derived from the live
        // column width (grid-renderer's tileCellRows). We persist that ACTUAL
        // rendered geometry (already read from gs-w/gs-h above) rather than a
        // canonical size — pinning a fixed h while the cell renders shorter
        // made stored y and h disagree, so stacked tiles overlapped in storage
        // and GridStack repacked them on reload (lost placement). w is already
        // the column span (1 or 2); h is the square's row height at this width.

        return widgetData;
    }

    const items = [];

    const itemsContainer = contentDiv.querySelector(".items-container");
    if (itemsContainer) {
        const linkNodes = Array.from(
            itemsContainer.querySelectorAll(".link-item"),
        );
        // Item rows are Sortable, so DOM order is visual order — no position
        // sort needed.
        let yIndex = 0;
        linkNodes.forEach((linkNode) => {
            const linkContent = linkNode.querySelector(
                ".link-widget-content",
            );
            if (linkContent) {
                const itemData = {
                    name: linkContent.dataset.name,
                    url: linkContent.dataset.url,
                    icon: linkContent.dataset.icon,
                    type: linkContent.dataset.type || "link",
                    y: yIndex++,
                };
                if (linkContent.dataset.iconColor) {
                    itemData.iconColor = linkContent.dataset.iconColor;
                }
                if (linkContent.dataset.description) {
                    itemData.description =
                        linkContent.dataset.description;
                }
                if (linkContent.dataset.targetOverride) {
                    itemData.targetOverride =
                        linkContent.dataset.targetOverride;
                }
                if (linkContent.dataset.linkStyle) {
                    try {
                        itemData.style = JSON.parse(
                            linkContent.dataset.linkStyle,
                        );
                    } catch (e) {
                        console.warn(
                            "[dom-manager] Invalid linkStyle JSON:",
                            e.message,
                        );
                    }
                }
                if (itemData.type === "header") {
                    itemData.align =
                        linkContent.dataset.align || "center";
                    itemData.separator =
                        linkContent.dataset.separator !== "false";
                }
                if (
                    itemData.type === "text" ||
                    itemData.type === "note"
                ) {
                    if (linkContent.dataset.textStyle)
                        itemData.textStyle =
                            linkContent.dataset.textStyle;
                }
                if (itemData.type === "clipboard") {
                    if (linkContent.dataset.content !== undefined)
                        itemData.content = linkContent.dataset.content;
                }
                if (itemData.type === "todo") {
                    itemData.done = linkContent.dataset.done === "true";
                }
                if (itemData.type === "launcher") {
                    if (linkContent.dataset.launcherKind)
                        itemData.launcherKind =
                            linkContent.dataset.launcherKind;
                    if (linkContent.dataset.target !== undefined)
                        itemData.target = linkContent.dataset.target;
                    if (
                        linkContent.dataset.launcherKind ===
                        "powershell"
                    ) {
                        itemData.visible =
                            linkContent.dataset.psVisible === "true";
                    }
                }
                if (itemData.type === "routine") {
                    itemData.steps = parseRoutineSteps(
                        linkContent.dataset.routineSteps,
                    );
                    const stagger = parseInt(
                        linkContent.dataset.routineStagger,
                        10,
                    );
                    if (!Number.isNaN(stagger))
                        itemData.stagger = stagger;
                }
                items.push(itemData);
            }
        });
        items.forEach((item, idx) => {
            item.y = idx;
        });
    }

    const isCollapsed = contentDiv.classList.contains("is-collapsed");
    const collapseBtn = contentDiv.querySelector(
        ".collapse-group-button",
    );
    const savedH = isCollapsed
        ? parseInt(collapseBtn?.dataset.prevH) || 12
        : readGridSpan(itemNode, "gs-h");

    let groupStyle = undefined;
    if (contentDiv.dataset.groupStyle) {
        try {
            groupStyle = JSON.parse(contentDiv.dataset.groupStyle);
        } catch (e) {
            console.warn(
                "[dom-manager] Invalid groupStyle JSON:",
                e.message,
            );
        }
    }

    return {
        name: name,
        items: items,
        x: parseInt(itemNode.getAttribute("gs-x")) || 0,
        y: parseInt(itemNode.getAttribute("gs-y")) || 0,
        w: readGridSpan(itemNode, "gs-w"),
        h: savedH,
        id: itemNode.getAttribute("gs-id") || name,
        type:
            contentDiv.dataset.groupType === "todo-list"
                ? contentDiv.dataset.groupType
                : undefined,
        collapsed: isCollapsed || undefined,
        icon: contentDiv.dataset.groupIcon || undefined,
        iconColor: contentDiv.dataset.groupIconColor || undefined,
        iconSize: contentDiv.dataset.groupIconSize || undefined,
        style: groupStyle || undefined,
    };
};

export const performSaveGridState = (manualWidgets) => {
    let newWidgets = [];
    let serializedFromGrid = false;
    if (manualWidgets) {
        newWidgets = manualWidgets;
    } else if (grid) {
        // Serialize the top action-bar zone first, then the main zone. Item type
        // (read from the DOM) determines the shape, so order across zones is cosmetic.
        const topNodes = new Set(topGrid ? topGrid.getGridItems() : []);
        const gridItems = [...topNodes, ...grid.getGridItems()];
        newWidgets = gridItems
            .map((itemNode) =>
                serializeWidgetNode(itemNode, topNodes.has(itemNode)),
            )
            .filter(Boolean);
        serializedFromGrid = true;
    }

    setElements(newWidgets);

    if (workspaceUpdateCallback) {
        workspaceUpdateCallback(newWidgets);
    } else {
        // initWorkspaces registers the callback before the grid exists, so
        // this should be unreachable; losing a save silently is worse than
        // failing loud. (The old fallback sent legacy rows to the background,
        // which is retired.)
        console.error(
            "[grid-state] performSaveGridState ran with no workspaceUpdateCallback — save skipped.",
        );
    }

    // Only DOM-derived data is asserted: manual widget arrays are allowed to
    // be non-canonical (e.g. items without an explicit type) and would render
    // into a *more* normalized form than they arrived in.
    if (serializedFromGrid) scheduleRoundTripAssertion(newWidgets);
};

// ── WI-1: DEV round-trip serialization assertion ────────────────────────────
// Source-of-truth contract rule #3: data → render → serialize must round-trip
// losslessly. In DEV builds, every grid save re-renders its own output into a
// detached shadow container through the real renderers and re-serializes it;
// a field that renders but doesn't survive re-serialization (or vice versa)
// fails loud with a structured diff instead of corrupting boards silently on
// the *next* reload. Ship builds (DEV_MODE=false) never enter this code.

let roundTripRenderers = null;

// grid-renderer.js registers its render entry points here at module load —
// the same registration idiom as setCreateItemsHandler, avoiding a static
// import cycle between grid-state and grid-renderer.
export const setRoundTripRenderers = (renderers) => {
    roundTripRenderers = renderers;
};

// Minimal stand-in for a GridStack instance, reproducing exactly the DOM
// contract the serializer reads back: `.grid-stack-item` wrappers carrying
// gs-* attributes, omitted at their defaults (x/y at 0, w/h at 1) the way
// GridStack omits them — which is precisely what makes the assertion able to
// catch absent-attribute misreads like the old width-1 → 12 snap. Layout,
// collision and interaction are irrelevant: the shadow render exists only to
// be re-serialized.
const applyShadowGsAttrs = (el, opts) => {
    const attrs = {
        "gs-x": [opts.x, 0],
        "gs-y": [opts.y, 0],
        "gs-w": [opts.w, 1],
        "gs-h": [opts.h, 1],
    };
    Object.entries(attrs).forEach(([attr, [value, omitAt]]) => {
        if (value === undefined) return; // update() passes partial patches
        if (value === omitAt) el.removeAttribute(attr);
        else el.setAttribute(attr, String(value));
    });
    if (opts.id !== undefined && opts.id !== null) {
        el.setAttribute("gs-id", String(opts.id));
    }
};

const createShadowGrid = () => {
    const el = document.createElement("div");
    el.className = "grid-stack";
    return {
        el,
        addWidget(opts) {
            const item = document.createElement("div");
            item.className = "grid-stack-item";
            const content = document.createElement("div");
            content.className = "grid-stack-item-content";
            item.appendChild(content);
            applyShadowGsAttrs(item, opts);
            el.appendChild(item);
            return item;
        },
        update(item, opts) {
            applyShadowGsAttrs(item, opts);
        },
        getGridItems() {
            return Array.from(el.children);
        },
    };
};

// The DOM stores every field as a string, so `""`, `undefined`, `null` and a
// missing key all mean "unset" — none of them can be told apart after one
// render → serialize cycle, and no reader distinguishes them (falsy checks
// everywhere). Only value *content* differences count as drift.
const isUnsetValue = (v) => v === undefined || v === null || v === "";

// The DOM stores every attribute as a string, so a value that is numeric in
// the source model (e.g. `iconSize: 16`) comes back stringified (`"16"`).
// That is the same value, not drift — the serialization layer simply can't
// preserve number-vs-string. Booleans are excluded (the serializer decodes
// those explicitly, so `true` vs `"true"` there WOULD be a real bug).
const isNumericStringEqual = (a, b) => {
    const numeric = (v) => typeof v === "number" || typeof v === "string";
    return numeric(a) && numeric(b) && String(a) === String(b);
};

// Structural deep-diff producing { path, expected, actual } entries.
const collectRoundTripDiffs = (expected, actual, path, out) => {
    if (expected === actual) return;
    if (isUnsetValue(expected) && isUnsetValue(actual)) return;
    if (isNumericStringEqual(expected, actual)) return;
    const expIsObj = expected !== null && typeof expected === "object";
    const actIsObj = actual !== null && typeof actual === "object";
    if (expIsObj && actIsObj && Array.isArray(expected) === Array.isArray(actual)) {
        const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
        keys.forEach((key) => {
            collectRoundTripDiffs(
                expected[key],
                actual[key],
                path ? `${path}.${key}` : key,
                out,
            );
        });
        return;
    }
    out.push({ path: path || "(root)", expected, actual });
};

// Widgets are paired for comparison by identity, not array position: the
// serializer emits top-zone widgets first regardless of where they sat in the
// loaded array, and order carries no meaning (x/y/zone do). Duplicate ids get
// a positional suffix so same-named widgets still pair deterministically.
const toKeyedWidgetMap = (widgets) => {
    const counts = new Map();
    const map = new Map();
    widgets.forEach((w, index) => {
        const base = `${w?.type || "group"}::${w?.id ?? w?.name ?? index}`;
        const n = counts.get(base) || 0;
        counts.set(base, n + 1);
        map.set(n ? `${base}#${n}` : base, w);
    });
    return map;
};

export const scheduleRoundTripAssertion = (widgets) => {
    if (!DEV_MODE || !roundTripRenderers) return;
    // Snapshot now — the live array is mutated by later edits — and assert on
    // a fresh task so a violation can never block the save/render that just
    // ran.
    const snapshot = JSON.parse(JSON.stringify(widgets));
    setTimeout(() => assertSerializationRoundTrip(snapshot), 0);
};

export const assertSerializationRoundTrip = (widgets) => {
    if (!DEV_MODE || !roundTripRenderers) return;
    const { addWidgetToGrid, initGroupItems, isTopZoneWidget } =
        roundTripRenderers;

    const expected = JSON.parse(JSON.stringify(widgets));
    // Legacy default: older builds persisted zone:"top"; the sanitizer strips
    // it on write and the serializer no longer emits it. Treat it as absent.
    expected.forEach((w) => {
        if (w && w.zone === "top") delete w.zone;
    });

    // The renderers may mutate their input (item y re-numbering), so they get
    // their own copy and `expected` stays pristine for the comparison.
    const renderInput = JSON.parse(JSON.stringify(expected));
    const shadowTop = createShadowGrid();
    const shadowMain = createShadowGrid();
    let reserialized;
    try {
        renderInput.forEach((widget) => {
            const target = isTopZoneWidget(widget) ? shadowTop : shadowMain;
            const entry = addWidgetToGrid(widget, false, target);
            if (entry)
                initGroupItems(entry.itemsContainer, entry.groupData, false);
        });

        const topNodes = new Set(shadowTop.getGridItems());
        reserialized = [...topNodes, ...shadowMain.getGridItems()]
            .map((node) => serializeWidgetNode(node, topNodes.has(node)))
            .filter(Boolean);
    } catch (cause) {
        // A crash while re-rendering serialized data means the live render
        // would crash on it too (same code) — that's a contract violation in
        // its own right, and it must not silently disable the assertion.
        const crash = {
            path: "(render/serialize crashed)",
            expected: String(cause),
            actual: undefined,
        };
        console.error("[grid-state] round-trip assertion crashed:", cause);
        if (typeof window !== "undefined") {
            window.__roundTripViolations = (
                window.__roundTripViolations || []
            ).concat(crash);
        }
        throw new Error(
            `Serialization round-trip failed (render/serialize crashed): ${String(cause)}`,
        );
    }

    // Fixed-size square shortcuts (icon link, tile, large tile) derive their
    // cell HEIGHT from the live column width at render time (grid-renderer's
    // tileCellRows), so a square looks square at any board width. That height
    // is render-derived, not authored data: the renderer re-pins it on every
    // load and the width-less shadow grid used here legitimately yields a
    // different value than the live grid. Comparing it would false-positive,
    // so drop h for these widgets — w (the fixed column span) and x/y/zone
    // placement are still checked, which is what actually must round-trip.
    const isFixedSquareWidget = (w) =>
        !!w && (w.display === "tile" || w.display === "tile2");
    const withoutDerivedHeight = (w) => {
        if (!isFixedSquareWidget(w)) return w;
        const copy = { ...w };
        delete copy.h;
        return copy;
    };

    const diffs = [];
    const expectedMap = toKeyedWidgetMap(expected);
    const actualMap = toKeyedWidgetMap(reserialized);
    const widgetKeys = new Set([...expectedMap.keys(), ...actualMap.keys()]);
    widgetKeys.forEach((key) => {
        collectRoundTripDiffs(
            withoutDerivedHeight(expectedMap.get(key)),
            withoutDerivedHeight(actualMap.get(key)),
            key,
            diffs,
        );
    });
    if (!diffs.length) return;

    console.error(
        "[grid-state] render↔serialize round-trip drift — these fields would be lost or corrupted on the next reload:",
        diffs,
    );
    if (typeof window !== "undefined") {
        window.__roundTripViolations = (window.__roundTripViolations || []).concat(diffs);
    }
    throw new Error(
        `Serialization round-trip failed (${diffs.length} diff${diffs.length === 1 ? "" : "s"}): ` +
            diffs
                .slice(0, 5)
                .map(
                    (d) =>
                        `${d.path}: ${JSON.stringify(d.expected)} → ${JSON.stringify(d.actual)}`,
                )
                .join("; "),
    );
};
