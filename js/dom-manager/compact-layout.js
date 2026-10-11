import { getGrid, saveGridState, measureFitRows } from './grid-state.js';
import { showToast } from '../undo-manager.js';
import { t } from "../i18n.js";
import { GRID_COLS } from "../grid-columns.js";

const COLS = GRID_COLS;

/**
 * Compact the current workspace layout:
 *  1. Expand any group whose items-container is overflowing (has a scrollbar).
 *  2. 2D bin-pack all groups into the tightest possible layout (no vertical
 *     or horizontal gaps), placing each widget at the top-left-most slot that
 *     fits, preserving the original reading order (top → bottom, left → right).
 */
export const compactLayout = ({ groupNames = null, fitHeight = false, silent = false, persist = true } = {}) => {
    const grid = getGrid();
    if (!grid) return;

    const gridItems = grid.getGridItems();
    if (gridItems.length === 0) {
        if (!silent) showToast(t("cl2_nothing_to_arrange"));
        return;
    }

    grid.batchUpdate(true);

    // ── Step 1: fix scrollbars ──────────────────────────────────────────────
    gridItems.forEach(itemNode => {
        const contentDiv = itemNode.querySelector('.item');
        if (groupNames && !groupNames.has(contentDiv?.dataset.name)) return;
        // Skip collapsed groups — their height is intentionally small.
        if (contentDiv?.classList.contains('is-collapsed')) return;

        const itemsContainer = itemNode.querySelector('.items-container');
        if (!itemsContainer) return;

        if (fitHeight) {
            const node = itemNode.gridstackNode;
            if (node) grid.update(itemNode, { h: Math.max(node.minH || 1, measureFitRows(itemNode, itemsContainer, node)) });
            return;
        }

        const overflow = itemsContainer.scrollHeight - itemsContainer.clientHeight;
        if (overflow > 4) {
            // Each GridStack cell is 10 px. Add 1 extra cell as safety margin.
            const extraCells = Math.ceil(overflow / 10) + 1;
            const node = itemNode.gridstackNode;
            if (node) grid.update(itemNode, { h: (node.h || 12) + extraCells });
        }
    });

    grid.batchUpdate(false);

    // ── Step 2: re-read positions (heights may have changed) ────────────────
    const widgets = grid.getGridItems().map(itemNode => {
        const node = itemNode.gridstackNode;
        return {
            el: itemNode,
            name: itemNode.querySelector('.item')?.dataset.name,
            x: node.x ?? 0,
            y: node.y ?? 0,
            w: node.w ?? 6,
            h: node.h ?? 12,
        };
    });

    // ── Step 3: sort top-to-bottom, then left-to-right (reading order) ──────
    widgets.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    // ── Step 4: 2D bin-pack — place each widget at the top-left-most slot ───
    const fixed = groupNames ? widgets.filter(widget => !groupNames.has(widget.name)) : [];
    const moving = groupNames ? widgets.filter(widget => groupNames.has(widget.name)) : widgets;
    if (groupNames) {
        const order = new Map([...groupNames].map((name, index) => [name, index]));
        moving.sort((a, b) => order.get(a.name) - order.get(b.name));
    }
    const startY = fixed.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
    const totalH = startY + moving.reduce((sum, w) => sum + w.h, 0);
    const occupiedRows = [];

    const ensureRow = (rowIndex) => {
        if (!occupiedRows[rowIndex]) occupiedRows[rowIndex] = new Uint8Array(COLS);
        return occupiedRows[rowIndex];
    };

    const canPlace = (y, x, w, h) => {
        if (x + w > COLS) return false;
        for (let r = y; r < y + h; r++) {
            const row = occupiedRows[r];
            for (let c = x; c < x + w; c++) {
                if (row?.[c]) return false;
            }
        }
        return true;
    };

    const markOccupied = (y, x, w, h) => {
        for (let r = y; r < y + h; r++) {
            const row = ensureRow(r);
            for (let c = x; c < x + w; c++) {
                row[c] = 1;
            }
        }
    };

    grid.batchUpdate(true);

    fixed.forEach(widget => markOccupied(widget.y, widget.x, widget.w, widget.h));
    moving.forEach(widget => {
        const { el, w, h } = widget;
        let placed = false;
        for (let y = startY; y < totalH && !placed; y++) {
            for (let x = 0; x <= COLS - w && !placed; x++) {
                if (canPlace(y, x, w, h)) {
                    grid.update(el, { x, y });
                    markOccupied(y, x, w, h);
                    placed = true;
                }
            }
        }
    });

    grid.batchUpdate(false);

    // ── Step 5: persist ─────────────────────────────────────────────────────
    if (persist) saveGridState();
    if (!silent) showToast(t("cl2_layout_compacted"));
    return moving.map(({ el, name }) => {
        const { x, y, w, h } = el.gridstackNode;
        return { name, x, y, w, h };
    });
};
