import { openNotesModal, handleWorkspaceSwitched } from "./notes-modal.js";
import { areWorkspaceNotesLocked } from "./notes-storage.js";
import { getCurrentWorkspace } from "../workspaces/workspace-state.js";
import { getLocal } from "../storage-local.js";

// ─── Notes entry button ────────────────────────────────────────────────────
//
// A "Notes" + pen-icon button. It lives next to the web-search bar when web
// search is enabled, and in the top-right header actions group otherwise —
// reacting live to the web-search toggle (no reload). When the active
// workspace is protected-and-locked it shows a lock affordance.

const PEN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
const LOCK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

let btn = null;
let heroSlot = null;
let topRow = null;

function readWebSearchEnabled() {
    return new Promise((resolve) =>
        getLocal(["general_webSearchEnabled"], (r) =>
            // Default enabled unless explicitly off — must match main.js's
            // `!== false` so the button aligns with the (visible-by-default)
            // search bar on a fresh install, before the key is ever written.
            resolve(r.general_webSearchEnabled !== false),
        ),
    );
}

function ensureButton() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = "notes-btn";
    btn.type = "button";
    // Reuse the Settings button's style class so Notes is chromed identically
    // (background/border/shadow/hover) and themed per-theme.
    btn.className = "header-action-btn header-action-settings notes-entry-btn";
    btn.title = "Notes";
    btn.setAttribute("aria-label", "Open notes");
    // Trusted, hardcoded icon markup from our own constants.
    btn.innerHTML =
        PEN_SVG +
        '<span class="header-action-label">Notes</span>' +
        `<span class="notes-entry-lock">${LOCK_SVG}</span>`;
    btn.addEventListener("click", () => openNotesModal());
    return btn;
}

function ensureHeroSlot() {
    if (heroSlot) return heroSlot;
    const existing = document.getElementById("notes-hero-slot");
    if (existing) return (heroSlot = existing);
    const searchForm = document.querySelector(
        "#web-search-bar .web-search-form",
    );
    const hero = document.getElementById("hero-panel");
    heroSlot = document.createElement("div");
    heroSlot.id = "notes-hero-slot";
    // Anchor the slot INSIDE the search pill, after the Enter hint, so the
    // Tasks/Notes chips render as part of the bar behind a separator
    // (see #notes-hero-slot CSS).
    if (searchForm) {
        searchForm.append(heroSlot);
    } else if (hero) {
        hero.append(heroSlot);
    } else {
        return null;
    }
    return heroSlot;
}

// A right-aligned row inserted just above the shortcuts (top grid zone), so
// that when web search is OFF the button sits between the clock and the
// shortcuts container, right-aligned with the shortcuts' edge.
function ensureTopRow() {
    if (topRow) return topRow;
    const container = document.querySelector(".container");
    const parent = container?.parentElement;
    if (!container || !parent) return null;
    topRow = document.createElement("div");
    topRow.id = "notes-toprow";
    // Anchor as a sibling BEFORE the shortcuts zone, not inside it: the top
    // zone (.container) is display:none whenever the workspace is empty
    // (updateEmptyWorkspaceMessage), which would take the buttons down with
    // it when web search is off. Placing the row in .content-container keeps
    // it visible while still sitting just above the shortcuts.
    parent.insertBefore(topRow, container);
    return topRow;
}

function position(enabled) {
    const button = ensureButton();
    if (enabled) {
        const slot = ensureHeroSlot();
        if (slot) slot.append(button);
    } else {
        const row = ensureTopRow();
        if (row) row.append(button);
    }
}

export function refreshNotesButtonState() {
    if (!btn) return;
    const locked = areWorkspaceNotesLocked(getCurrentWorkspace());
    btn.classList.toggle("is-locked", locked);
    btn.title = locked ? "Notes (workspace locked)" : "Notes";
}

export async function initNotes() {
    ensureButton();
    const enabled = await readWebSearchEnabled();
    position(enabled);
    refreshNotesButtonState();

    window.addEventListener("rt:web-search-toggled", (e) => {
        position(!!(e.detail && e.detail.enabled));
    });
    window.addEventListener("rt:workspace-switched", () => {
        // The open modal belongs to the previous workspace — close it, then
        // refresh the button's locked affordance for the new workspace.
        handleWorkspaceSwitched();
        refreshNotesButtonState();
    });
    // Global settings (which include the web-search toggle) can load after us.
    window.addEventListener("rt:global-settings-loaded", async () => {
        position(await readWebSearchEnabled());
        refreshNotesButtonState();
    });
}
