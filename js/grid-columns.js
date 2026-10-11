// grid-columns.js — the board's column count and the 12→24 migration helpers.
// Pure module (no imports): it is bundled into the standalone reader too.
//
// The board grid moved from 12 to 24 columns so small widgets (icon links,
// w:1) can pack twice as tight. All geometry persisted by THIS version is in
// 24-column space. Data from the 12-column era is detected by a marker:
//   - localStorage: the `grid_columns` key (absent = 12-column era)
//   - payloads (JSON exports, share codes, public boards, managed boards,
//     protected-workspace blobs): a `gridColumns` field on the payload/meta
// and migrated one way by doubling every top-level entry's x/w. y/h are
// row-based (10px cells) and never touched. In-group items carry no x/w.

export const GRID_COLS = 24;

// localStorage key stamped once the local workspace data has been
// migrated into GRID_COLS space.
export const GRID_COLS_STORAGE_KEY = "grid_columns";

// A square-display widget's column span is PINNED (grid-density independent):
// a tile is "1 of 24 columns" by definition, not a 12-col width to be scaled.
const SQUARE_PINNED_W = { icon: 1, tile: 1, tile2: 2 };

// Double one top-level board entry's column geometry (x, w). The serializer
// omits gs attributes at their defaults, so a missing w means 1 and must
// become an explicit 2 — leaving it absent would render at half its old
// width. A missing x means 0 and can stay absent (0 doubles to 0).
export const doubleEntryColumns = (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return entry;
    }
    const doubled = { ...entry };
    if (Number.isFinite(doubled.x)) doubled.x = doubled.x * 2;
    // Squares keep their pinned span — doubling then re-pinning in the
    // sanitizer made data and serialized output disagree (WI-1), and made
    // the reader render crafted 12-col squares at w:2/w:4. Real 12-col legacy
    // data never contained squares, so only dev-data + crafted payloads hit
    // this. Position (x) still scales so the tile lands in the same spot.
    const pinnedW = SQUARE_PINNED_W[doubled.display];
    doubled.w =
        pinnedW !== undefined
            ? pinnedW
            : (Number.isFinite(doubled.w) ? doubled.w : 1) * 2;
    return doubled;
};

// Double a whole workspace entry array (groups, top-level widgets, sections).
export const doubleBoardColumns = (entries) =>
    Array.isArray(entries) ? entries.map(doubleEntryColumns) : entries;

// Bring a payload's groups into GRID_COLS space: payloads stamped with the
// current column count pass through, everything else is 12-column-era data
// and gets doubled. `source` is the payload/meta object carrying the
// `gridColumns` stamp (it may be the groups' own container or a blob meta).
export const boardColumnsFromPayload = (source, groups) =>
    source?.gridColumns === GRID_COLS ? groups : doubleBoardColumns(groups);
