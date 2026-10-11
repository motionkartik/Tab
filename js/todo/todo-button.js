import { getLocal } from "../storage-local.js";
import { openTodoModal, handleWorkspaceSwitched } from "./todo-modal.js";
import { initTodoReminders } from "./todo-reminders.js";
import { loadTodos } from "./todo-storage.js";
import {
    getCurrentWorkspace,
    getWorkspaceGroups,
} from "../workspaces/workspace-state.js";
import { registerStorageHandler } from "../workspaces/storage-coordinator.js";

// ─── Tasks entry button ─────────────────────────────────────────────────────
//
// A "Tasks" + checklist-icon button that sits alongside the Notes button: next
// to the web-search bar when web search is enabled, else in the right-aligned
// row above the shortcuts. Reuses the same slot elements the Notes button uses
// so the two hub buttons line up. Themed like the Settings button.

const LIST_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 6h9"></path><path d="M11 12h9"></path><path d="M11 18h9"></path><path d="m3 5 1.4 1.4L7 3.8"></path><path d="m3 11 1.4 1.4L7 9.8"></path><path d="m3 17 1.4 1.4L7 15.8"></path></svg>';

let btn = null;

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

// ─── Remaining-tasks badge ──────────────────────────────────────────────────
// Counts open tasks of the active workspace across both origins: global hub
// lists (workspace_todos_*) and in-group `type:"todo"` items. Hidden at zero,
// when the workspace is locked (counts are unreadable by design), or when the
// general_todoBadge setting is off.

let badge = null;

function ensureBadge() {
    if (!btn) return null;
    if (badge?.isConnected) return badge;
    badge = document.createElement("span");
    badge.className = "todo-count-badge";
    badge.hidden = true;
    btn.appendChild(badge);
    return badge;
}

async function countOpenTasks() {
    const ws = getCurrentWorkspace();
    const { locked, lists } = await loadTodos(ws);
    if (locked) return null;
    let count = 0;
    (lists || []).forEach((list) =>
        (list.tasks || []).forEach((task) => {
            if (!task.done) count++;
        }),
    );
    (getWorkspaceGroups(ws) || []).forEach((group) =>
        (group.items || []).forEach((item) => {
            if (item.type === "todo" && !item.done) count++;
        }),
    );
    return count;
}

export async function refreshTodoBadge() {
    const el = ensureBadge();
    if (!el) return;
    const { general_todoBadge } = await getLocal(
        "general_todoBadge",
    );
    let count = null;
    if (general_todoBadge !== false) {
        try {
            count = await countOpenTasks();
        } catch {
            count = null;
        }
    }
    if (!count) {
        el.hidden = true;
        return;
    }
    el.textContent = count > 99 ? "99+" : String(count);
    el.hidden = false;
}

function ensureButton() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = "todo-btn";
    btn.type = "button";
    // Reuse the Settings button's style class so Tasks is chromed identically.
    btn.className = "header-action-btn header-action-settings todo-entry-btn";
    btn.title = "Tasks";
    btn.setAttribute("aria-label", "Open tasks");
    btn.innerHTML = LIST_SVG + '<span class="header-action-label">Tasks</span>';
    btn.addEventListener("click", () => openTodoModal());
    return btn;
}

// Shared slots with the Notes button — reuse if present, else create.
function heroSlot() {
    let slot = document.getElementById("notes-hero-slot");
    if (slot) return slot;
    // Same anchor as the Notes button: INSIDE the search pill, after the
    // Enter hint, so the chips render as part of the bar behind a separator.
    const searchForm = document.querySelector(
        "#web-search-bar .web-search-form",
    );
    const hero = document.getElementById("hero-panel");
    if (!searchForm && !hero) return null;
    slot = document.createElement("div");
    slot.id = "notes-hero-slot";
    (searchForm || hero).append(slot);
    return slot;
}
function topRow() {
    let row = document.getElementById("notes-toprow");
    if (row) return row;
    const container = document.querySelector(".container");
    const parent = container?.parentElement;
    if (!container || !parent) return null;
    row = document.createElement("div");
    row.id = "notes-toprow";
    // Anchor as a sibling BEFORE the shortcuts zone, not inside it: the top
    // zone (.container) is display:none whenever the workspace is empty
    // (updateEmptyWorkspaceMessage), which would take the buttons down with
    // it when web search is off. Placing the row in .content-container keeps
    // it visible while still sitting just above the shortcuts.
    parent.insertBefore(row, container);
    return row;
}

function position(enabled) {
    const button = ensureButton();
    const slot = enabled ? heroSlot() : topRow();
    // prepend → Tasks sits before Notes (Notes always appends), so the order is
    // stable regardless of which button repositions last on toggle events.
    if (slot) slot.prepend(button);
}

export async function initTodo() {
    ensureButton();
    position(await readWebSearchEnabled());
    initTodoReminders();

    window.addEventListener("rt:web-search-toggled", (e) => {
        position(!!(e.detail && e.detail.enabled));
    });
    window.addEventListener("rt:workspace-switched", () => {
        handleWorkspaceSwitched();
        refreshTodoBadge();
    });
    window.addEventListener("rt:global-settings-loaded", async () => {
        position(await readWebSearchEnabled());
    });

    // Deep-link: a reminder notification opened this tab with ?open=tasks. Open
    // the hub (on the reminded list, if it still exists) and strip the query so
    // a manual reload doesn't reopen it.
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("open") === "tasks") {
            const listId = params.get("list") || undefined;
            openTodoModal(listId);
            const url = new URL(window.location.href);
            url.search = "";
            window.history.replaceState({}, "", url.toString());
        }
    } catch {
        /* no-op */
    }

    refreshTodoBadge();
    // Any change to the board (group todos), the hub blobs, or the setting
    // itself re-counts — covers this tab, other tabs, and cloud sync.
    registerStorageHandler("todo-badge", (changes) => {
        const relevant =
            changes.workspaces ||
            changes.general_todoBadge ||
            Object.keys(changes).some((key) =>
                key.startsWith("workspace_todos_"),
            );
        if (relevant) refreshTodoBadge();
    });
}
