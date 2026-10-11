import {
    getCurrentWorkspace,
    getWorkspaceGroups,
} from "../workspaces/workspace-state.js";
import {
    loadTodos,
    saveTodos,
    createList,
    createTask,
    areWorkspaceTodosLocked,
} from "./todo-storage.js";
import {
    addTodoTaskToGroupById,
    toggleGroupTodoDone,
    renameGroupTodo,
    deleteGroupTodo,
    clearCompletedGroupTodos,
} from "../dom-manager/group-widget-renderer.js";
import {
    REMINDER_PRESETS,
    reminderTargetKey,
    getReminderMap,
    setReminder,
    clearReminder,
    canScheduleReminder,
} from "./todo-reminders.js";

// ─── Tasks hub modal ────────────────────────────────────────────────────────
//
// Aggregates every todo of the ACTIVE workspace into one modal. Two kinds of
// list, distinguished by `origin` which routes every read and write:
//
//   • 'global'                    — lives only in the hub, off-grid, stored via
//                                    todo-storage.js (like notes).
//   • { kind:'group', groupId }   — mirrors a board group that contains
//                                    `type:"todo"` items; edits flow back onto
//                                    the board (group-widget-renderer helpers).
//
// A protected+locked workspace shows a locked panel — global todos are
// encrypted at rest and group todos live inside the (unreadable) encrypted
// workspace, so nothing is shown until the workspace is unlocked.

const ICON_ATTRS =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON_PATHS = {
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    search:
        '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    close: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l2.5 1.5"></path>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2.5"></rect><path d="M4 9h16M9 3v3M15 3v3"></path>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>',
    check: '<path d="M4 12.5l5 5 11-11"></path>',
};

function icon(name, size = 16, stroke = 2) {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.innerHTML = `<svg width="${size}" height="${size}" ${ICON_ATTRS.replace('stroke-width="2"', `stroke-width="${stroke}"`)}>${ICON_PATHS[name] || ""}</svg>`;
    return wrap.firstChild;
}

const el = (tag, className, props) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (props) Object.assign(node, props);
    return node;
};

// ── module state ──
let overlay = null;
let modal = null;
const refs = {};
let globalLists = []; // [{ id, name, origin:'global', tasks:[{id,text,done,createdAt,updatedAt}] }]
let groupLists = []; // [{ id, groupId, name, origin:{kind,groupId}, tasks:[{ref,groupTodoIndex,text,done}] }]
let lists = []; // combined view = groupLists ++ globalLists
let activeId = null;
let locked = false;
let isOpen = false;
let saveTimer = null;
let reminderMap = {}; // reminderTargetKey → reminder, for the active workspace

// ─── model building ─────────────────────────────────────────────────────────

const isGlobal = (list) => list && list.origin === "global";

/** Derive group-origin lists from the live workspace groups (no DOM reads). */
function buildGroupLists(ws) {
    const groups = getWorkspaceGroups(ws) || [];
    return groups
        .map((g) => {
            const tasks = (g.items || [])
                .filter((i) => i && i.type === "todo")
                .map((i, idx) => ({
                    ref: i,
                    groupTodoIndex: idx,
                    text: i.name || "",
                    done: !!i.done,
                }));
            return {
                id: "group:" + g.id,
                groupId: g.id,
                name: g.name || "Group",
                origin: { kind: "group", groupId: g.id },
                tasks,
            };
        })
        .filter((l) => l.tasks.length > 0); // any group WITH todos
}

/** Load the full list set for the active workspace into module state. */
async function loadModel() {
    const ws = getCurrentWorkspace();
    if (areWorkspaceTodosLocked(ws)) {
        locked = true;
        globalLists = [];
        groupLists = [];
        lists = [];
        return;
    }
    locked = false;
    const { lists: gl } = await loadTodos(ws);
    globalLists = gl.map((l) => ({ ...l, origin: "global" }));
    groupLists = buildGroupLists(ws);
    rebuildCombined();
    if (!lists.some((l) => l.id === activeId)) activeId = lists[0] ? lists[0].id : null;
    reminderMap = await getReminderMap(ws);
}

// ─── reminders ──────────────────────────────────────────────────────────────
// Task-level reminders are GLOBAL tasks only (group todos have no stable id);
// list-level reminders work for both list kinds (both carry a stable `id`).

const listTarget = (l) => ({
    workspaceId: getCurrentWorkspace(),
    origin: isGlobal(l) ? "global" : "group",
    listId: l.id,
    taskId: null,
    label: (l.name || "").trim() || "Task list",
});

const taskTarget = (l, t) => ({
    workspaceId: getCurrentWorkspace(),
    origin: "global",
    listId: l.id,
    taskId: t.id,
    label: t.text || "Task",
});

const hasReminder = (target) => !!reminderMap[reminderTargetKey(target)];

async function refreshReminders() {
    reminderMap = await getReminderMap(getCurrentWorkspace());
}

/** Human "14:30" / "Aug 3, 14:30" style label for a due time. */
function formatWhen(when) {
    const d = new Date(when);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay
        ? time
        : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
              " " +
              time;
}

/** A bell button for a task row (global tasks only), reflecting reminder state. */
function reminderBell(target) {
    const active = hasReminder(target);
    const btn = el("button", "todo-reminder-bell" + (active ? " active" : ""), {
        type: "button",
        title: active
            ? "Reminder at " + formatWhen(reminderMap[reminderTargetKey(target)].when)
            : "Set a reminder",
    });
    btn.append(icon("bell", 13, 2));
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openReminderPopover(btn, target);
    });
    return btn;
}

// ── reminder popover (presets + custom datetime) ──
let reminderPopover = null;

function onReminderOutside(e) {
    if (reminderPopover && !reminderPopover.contains(e.target))
        closeReminderPopover();
}

function closeReminderPopover() {
    if (!reminderPopover) return;
    reminderPopover.remove();
    reminderPopover = null;
    document.removeEventListener("mousedown", onReminderOutside, true);
}

// Two-digit padding + local date/time input values for a given epoch-ms.
function dateInputValue(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function timeInputValue(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openReminderPopover(anchor, target) {
    closeReminderPopover();
    const existing = reminderMap[reminderTargetKey(target)];
    const pop = el("div", "todo-reminder-pop");

    // ── header: bell chip + title + subtitle ──
    const header = el("div", "trp-header");
    const chip = el("span", "trp-chip-icon");
    chip.append(icon("bell", 17, 2));
    const htext = el("div", "trp-header-text");
    htext.append(
        el("div", "trp-title", { textContent: "Remind me" }),
        el("div", "trp-sub", {
            textContent: existing
                ? "Currently set for " + formatWhen(existing.when)
                : "Pick a time to get a nudge",
        }),
    );
    header.append(chip, htext);
    pop.append(header);

    // Selection state: a preset object, or "custom", or null.
    let selected = null;
    const chips = [];
    const syncSelection = () => {
        chips.forEach((c) => c.el.classList.toggle("selected", c.preset === selected));
        customRow.classList.toggle("selected", selected === "custom");
    };

    // ── quick-pick chips ──
    const picks = el("div", "trp-quickpicks");
    REMINDER_PRESETS.forEach((p) => {
        const c = el("button", "trp-chip", { type: "button" });
        c.append(icon(p.icon || "clock", 15, 2), el("span", null, { textContent: p.label }));
        c.addEventListener("click", () => {
            selected = p;
            syncSelection();
        });
        picks.append(c);
        chips.push({ el: c, preset: p });
    });
    pop.append(picks);

    // ── labeled divider ──
    const divider = el("div", "trp-divider");
    divider.append(
        el("span", "trp-rule"),
        el("span", "trp-divider-label", { textContent: "or pick date & time" }),
        el("span", "trp-rule"),
    );
    pop.append(divider);

    // ── custom date + time ──
    const soon = Date.now() + 60 * 60 * 1000; // default: one hour out
    const customRow = el("div", "trp-custom");
    const dateField = el("div", "trp-field trp-field-date");
    const dateInput = el("input", "trp-input", {
        type: "date",
        value: dateInputValue(soon),
    });
    dateField.append(icon("calendar", 15, 2), dateInput);
    const timeField = el("div", "trp-field trp-field-time");
    const timeInput = el("input", "trp-input", {
        type: "time",
        value: timeInputValue(soon),
    });
    timeField.append(icon("clock", 15, 2), timeInput);
    customRow.append(dateField, timeField);
    const onCustomEdit = () => {
        selected = "custom";
        syncSelection();
    };
    dateInput.addEventListener("input", onCustomEdit);
    timeInput.addEventListener("input", onCustomEdit);
    pop.append(customRow);

    // ── hint ──
    const hint = el("div", "todo-reminder-hint");
    hint.hidden = true;
    const showHint = (text) => {
        hint.textContent = text;
        hint.hidden = false;
    };
    pop.append(hint);

    // ── footer: remove? / cancel / set ──
    const footer = el("div", "trp-footer");
    if (existing) {
        const rm = el("button", "trp-ghost trp-danger", {
            type: "button",
            textContent: "Remove",
        });
        rm.addEventListener("click", async () => {
            await clearReminder(target);
            await refreshReminders();
            closeReminderPopover();
            renderMain();
        });
        footer.append(rm);
    } else {
        const cancel = el("button", "trp-ghost", {
            type: "button",
            textContent: "Cancel",
        });
        cancel.addEventListener("click", closeReminderPopover);
        footer.append(cancel);
    }
    const setBtn = el("button", "trp-set", { type: "button" });
    setBtn.append(icon("check", 15, 2.4), el("span", null, { textContent: "Set reminder" }));
    setBtn.addEventListener("click", async () => {
        let when;
        if (selected === "custom" || selected === null) {
            if (!dateInput.value || !timeInput.value) {
                showHint("Pick a date and time.");
                return;
            }
            when = new Date(dateInput.value + "T" + timeInput.value).getTime();
        } else {
            when = Date.now() + selected.ms;
        }
        if (isNaN(when)) return;
        if (when < Date.now()) {
            showHint("Pick a time in the future.");
            return;
        }
        const gate = await canScheduleReminder();
        if (!gate.ok) {
            showHint(
                gate.reason === "blocked"
                    ? "Notifications are blocked by the browser."
                    : "Turn on task notifications in Settings › Tasks.",
            );
            return;
        }
        await setReminder(target, when);
        await refreshReminders();
        closeReminderPopover();
        renderMain();
    });
    footer.append(setBtn);
    pop.append(footer);

    // Default selection: first preset (unless editing an existing reminder).
    selected = existing ? "custom" : REMINDER_PRESETS[0];
    syncSelection();

    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    let left = Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 12);
    left = Math.max(8, left);
    let top = r.bottom + 8;
    if (top + pop.offsetHeight > window.innerHeight - 12)
        top = Math.max(12, r.top - pop.offsetHeight - 8);
    pop.style.top = Math.round(top) + "px";
    pop.style.left = Math.round(left) + "px";
    reminderPopover = pop;
    setTimeout(
        () => document.addEventListener("mousedown", onReminderOutside, true),
        0,
    );
}

/** Combine group + global lists and back-link each task to its owning list. */
function rebuildCombined() {
    lists = [...groupLists, ...globalLists];
    lists.forEach((l) => l.tasks.forEach((t) => (t.__list = l)));
}

/** Rebuild ONLY the group lists (after a board write-back) and re-render. */
function refreshGroupLists() {
    groupLists = buildGroupLists(getCurrentWorkspace());
    rebuildCombined();
    renderLists();
    renderMain();
}

function activeList() {
    return lists.find((l) => l.id === activeId) || lists[0] || null;
}

// ─── global-list persistence (debounced, like notes) ────────────────────────

function scheduleGlobalSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushGlobalSave, 500);
}

function flushGlobalSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (locked) return;
    // Persist only the storable shape (strip origin / __list back-links).
    const payload = globalLists.map((l) => ({
        id: l.id,
        name: l.name,
        tasks: l.tasks.map((t) => ({
            id: t.id,
            text: t.text,
            done: t.done,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
        })),
    }));
    void saveTodos(payload, getCurrentWorkspace());
}

// ─── DOM ────────────────────────────────────────────────────────────────────

function build() {
    overlay = el("div", "todo-modal-overlay");
    overlay.style.display = "none";
    modal = el("div", "todo-modal");

    const bar = el("div", "todo-titlebar");
    const left = el("div", "todo-titlebar-left");
    left.append(el("span", "todo-title-dot"));
    left.append(el("span", "todo-title-kicker", { textContent: "Tasks" }));
    left.append(el("span", "todo-title-sep"));
    refs.subtitle = el("span", "todo-title-sub");
    left.append(refs.subtitle);
    const closeBtn = el("button", "todo-close", { type: "button", title: "Close" });
    closeBtn.append(icon("close", 17, 2.2));
    closeBtn.addEventListener("click", close);
    bar.append(left, closeBtn);

    refs.body = el("div", "todo-body");

    modal.append(bar, refs.body);
    overlay.append(modal);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });
    document.body.append(overlay);
}

function buildSidebar() {
    const sidebar = el("div", "todo-sidebar");
    const head = el("div", "todo-sidebar-head");

    const search = el("div", "todo-search");
    search.append(icon("search", 15, 2));
    refs.search = el("input", null, { type: "text", placeholder: "Search tasks…" });
    refs.search.addEventListener("input", renderTasks);
    search.append(refs.search);

    const newBtn = el("button", "todo-new-btn", { type: "button" });
    newBtn.append(icon("plus", 15, 2.4), document.createTextNode("New list"));
    newBtn.addEventListener("click", onNewList);
    head.append(search, newBtn);

    refs.lists = el("div", "todo-lists");
    sidebar.append(head, refs.lists);
    return sidebar;
}

function buildMain() {
    refs.main = el("div", "todo-main");

    const head = el("div", "todo-main-head");
    const titleRow = el("div", "todo-main-title-row");
    refs.title = el("input", "todo-main-title", {
        type: "text",
        placeholder: "List name",
    });
    refs.title.addEventListener("input", onTitleInput);
    refs.title.addEventListener("keydown", (e) => {
        // Enter on the title jumps straight to adding tasks.
        if (e.key === "Enter") {
            e.preventDefault();
            if (refs.addInput) refs.addInput.focus();
        }
    });
    refs.headCount = el("span", "todo-head-count", { textContent: "0" });
    refs.reminderBell = el("button", "todo-reminder-bell todo-head-bell", {
        type: "button",
        title: "Set a reminder for this list",
    });
    refs.reminderBell.append(icon("bell", 15, 2));
    refs.reminderBell.style.display = "none";
    titleRow.append(refs.title, refs.headCount, refs.reminderBell);
    const progress = el("div", "todo-progress");
    refs.progressFill = el("div", "todo-progress-fill");
    refs.progressFill.style.width = "0%";
    progress.append(refs.progressFill);
    head.append(titleRow, progress);

    const addRow = el("div", "todo-add-row");
    addRow.append(el("span", "todo-add-box"));
    refs.addInput = el("input", "todo-add-input", {
        type: "text",
        placeholder: "Add a task…",
    });
    const addBtn = el("button", "todo-add-btn", { type: "button", textContent: "Add" });
    addBtn.addEventListener("click", onAddTask);
    refs.addInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onAddTask();
    });
    addRow.append(refs.addInput, addBtn);
    refs.addRow = addRow;

    refs.tasks = el("div", "todo-tasks");

    const footer = el("div", "todo-footer");
    refs.footerMeta = el("span", "todo-footer-meta");
    const actions = el("div", "todo-footer-actions");
    const clearBtn = el("button", "todo-btn-secondary", {
        type: "button",
        textContent: "Clear completed",
    });
    clearBtn.addEventListener("click", onClearCompleted);
    const closeBtn = el("button", "todo-btn-secondary", {
        type: "button",
        textContent: "Close",
    });
    closeBtn.addEventListener("click", close);
    actions.append(clearBtn, closeBtn);
    footer.append(refs.footerMeta, actions);

    refs.main.append(head, refs.tasks, addRow, footer);
    return refs.main;
}

function buildLocked() {
    const panel = el("div", "todo-locked");
    panel.append(icon("lock", 34, 1.8));
    panel.append(el("p", "todo-locked-title", { textContent: "Workspace locked" }));
    panel.append(
        el("p", "todo-locked-hint", {
            textContent: "Unlock this workspace to view and edit its tasks.",
        }),
    );
    return panel;
}

// ─── handlers (origin-routed) ───────────────────────────────────────────────

function onNewList() {
    if (locked) return;
    // Drop blank global drafts so we never accumulate unnamed empty lists.
    globalLists = globalLists.filter((l) => l.name.trim() || l.tasks.length);
    const list = createList(Date.now(), "");
    globalLists.push({ ...list, origin: "global" });
    rebuildCombined();
    activeId = list.id;
    flushGlobalSave();
    renderLists();
    renderMain();
    // Set the title inline (like a new note) instead of a browser prompt.
    requestAnimationFrame(() => {
        if (refs.title) {
            refs.title.focus();
            refs.title.select();
        }
    });
}

function onTitleInput() {
    const l = activeList();
    if (!l || !isGlobal(l)) return;
    l.name = refs.title.value;
    scheduleGlobalSave();
    renderLists(); // keep the sidebar name in sync (leaves title focus intact)
}

function onAddTask() {
    if (locked) return;
    const text = refs.addInput.value.trim();
    if (!text) return;
    const l = activeList();
    if (!l) return;

    if (isGlobal(l)) {
        l.tasks.push(createTask(Date.now(), text));
        rebuildCombined();
        refs.addInput.value = "";
        flushGlobalSave();
        renderLists();
        renderMain();
        return;
    }

    // group origin → write back to the board
    if (addTodoTaskToGroupById(l.origin.groupId, text)) {
        refs.addInput.value = "";
        refreshGroupLists();
    }
}

function toggleTask(t) {
    if (locked) return;
    const l = t.__list;
    if (isGlobal(l)) {
        t.done = !t.done;
        t.updatedAt = Date.now();
        scheduleGlobalSave();
        renderLists();
        renderTasks();
        updateProgress();
    } else if (l && l.origin && l.origin.kind === "group") {
        if (toggleGroupTodoDone(l.origin.groupId, t.groupTodoIndex)) refreshGroupLists();
    }
}

function renameTask(t, newText) {
    if (locked) return;
    const text = (newText || "").trim();
    if (!text || text === t.text) return;
    const l = t.__list;
    if (isGlobal(l)) {
        t.text = text;
        t.updatedAt = Date.now();
        scheduleGlobalSave();
        renderTasks();
    } else if (l && l.origin && l.origin.kind === "group") {
        if (renameGroupTodo(l.origin.groupId, t.groupTodoIndex, text))
            refreshGroupLists();
        else renderTasks(); // group vanished mid-edit — restore the plain row
    }
}

function deleteTask(t) {
    if (locked) return;
    const l = t.__list;
    if (isGlobal(l)) {
        if (t.id) void clearReminder(taskTarget(l, t)).then(refreshReminders);
        l.tasks = l.tasks.filter((x) => x !== t);
        rebuildCombined();
        flushGlobalSave();
        renderLists();
        renderMain();
    } else if (l && l.origin && l.origin.kind === "group") {
        if (deleteGroupTodo(l.origin.groupId, t.groupTodoIndex)) refreshGroupLists();
    }
}

function onClearCompleted() {
    if (locked) return;
    const l = activeList();
    if (!l) return;
    let touchedGlobal = false;
    let touchedGroup = false;
    if (isGlobal(l)) {
        const before = l.tasks.length;
        const removed = l.tasks.filter((t) => t.done);
        l.tasks = l.tasks.filter((t) => !t.done);
        if (l.tasks.length !== before) {
            touchedGlobal = true;
            removed.forEach((t) => {
                if (t.id) void clearReminder(taskTarget(l, t));
            });
            void refreshReminders();
        }
    } else if (l.origin && l.origin.kind === "group") {
        if (clearCompletedGroupTodos(l.origin.groupId)) touchedGroup = true;
    }
    if (touchedGlobal) flushGlobalSave();
    if (touchedGroup) {
        refreshGroupLists(); // also re-renders
    } else if (touchedGlobal) {
        rebuildCombined();
        renderLists();
        renderMain();
    }
}

// ─── rendering ──────────────────────────────────────────────────────────────

function renderLists() {
    refs.lists.replaceChildren();
    lists.forEach((l) => {
        const row = el("div", "todo-list-row" + (l.id === activeId ? " active" : ""));
        const tile = el("div", "todo-list-tile");
        tile.append(el("span", "todo-list-tile-dot"));
        row.append(tile);
        row.append(
            el("span", "todo-list-name", { textContent: l.name.trim() || "Untitled list" }),
        );
        if (l.origin && l.origin.kind === "group") {
            row.append(el("span", "todo-list-badge", { textContent: "board" }));
        }
        row.append(el("span", "todo-list-count", { textContent: String(l.tasks.length) }));
        row.addEventListener("click", () => {
            activeId = l.id;
            renderLists();
            renderMain();
        });
        refs.lists.append(row);
    });
}

function renderMain() {
    const l = activeList();
    const renameable = l ? isGlobal(l) : false;
    refs.title.value = l ? l.name : "";
    refs.title.readOnly = !renameable;
    refs.title.placeholder = l ? "List name" : "No list selected";
    refs.title.classList.toggle("editable", renameable);
    refs.addRow.style.display = l ? "" : "none";
    if (refs.reminderBell) {
        if (l) {
            const target = listTarget(l);
            const active = hasReminder(target);
            refs.reminderBell.style.display = "";
            refs.reminderBell.classList.toggle("active", active);
            refs.reminderBell.title = active
                ? "List reminder at " +
                  formatWhen(reminderMap[reminderTargetKey(target)].when)
                : "Set a reminder for this list";
            refs.reminderBell.onclick = (e) => {
                e.stopPropagation();
                openReminderPopover(refs.reminderBell, target);
            };
        } else {
            refs.reminderBell.style.display = "none";
        }
    }
    renderTasks();
    updateProgress();
}

// Swap a task row's text for an inline textarea (pencil button / double-click).
// Enter or blur commits, Escape cancels; empty input cancels rather than
// deleting the task.
function startEditTask(row, textEl, t) {
    if (locked || row.classList.contains("editing")) return;
    row.classList.add("editing");
    const input = el("textarea", "todo-task-edit", { value: t.text || "" });
    input.rows = 1;
    const autosize = () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    };
    input.addEventListener("input", autosize);
    input.addEventListener("click", (e) => e.stopPropagation());
    let settled = false;
    const finish = (commit) => {
        if (settled) return;
        settled = true;
        const value = input.value.trim();
        row.classList.remove("editing");
        if (commit && value && value !== t.text) {
            renameTask(t, value); // re-renders (directly or via the board)
        } else {
            renderTasks(); // restore the plain row
        }
    };
    input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish(true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
        }
    });
    input.addEventListener("blur", () => finish(true));
    textEl.replaceWith(input);
    input.focus();
    // Caret at the end — editing usually appends/fixes, select-all invites
    // accidentally wiping the task.
    const end = input.value.length;
    input.setSelectionRange(end, end);
    autosize();
}

function renderTasks() {
    const l = activeList();
    if (!l) {
        refs.tasks.replaceChildren();
        refs.tasks.append(
            el("div", "todo-empty", { textContent: "Create a list to get started." }),
        );
        return;
    }
    const q = (refs.search.value || "").trim().toLowerCase();
    const shown = l.tasks.filter((t) => !q || (t.text || "").toLowerCase().includes(q));
    refs.tasks.replaceChildren();
    if (!shown.length) {
        refs.tasks.append(
            el("div", "todo-empty", {
                textContent: q ? "No matching tasks." : "No tasks yet.",
            }),
        );
        return;
    }
    shown.forEach((t) => {
        const row = el("div", "todo-task" + (t.done ? " done" : ""));
        const box = el("span", "todo-task-check");
        box.append(icon("check", 13, 3));
        box.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleTask(t);
        });
        row.append(box);
        const textEl = el("span", "todo-task-text", { textContent: t.text });
        row.append(textEl);
        // Per-task reminders only for global tasks (group todos have no stable id).
        if (isGlobal(l) && t.id) row.append(reminderBell(taskTarget(l, t)));
        const edit = el("button", "todo-task-edit-btn", { type: "button", title: "Edit task" });
        edit.append(icon("pencil", 13, 2));
        edit.addEventListener("click", (e) => {
            e.stopPropagation();
            startEditTask(row, textEl, t);
        });
        row.append(edit);
        const del = el("button", "todo-task-del", { type: "button", title: "Delete task" });
        del.append(icon("close", 13, 2.4));
        del.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteTask(t);
        });
        row.append(del);
        row.addEventListener("click", () => {
            if (row.classList.contains("editing")) return;
            toggleTask(t);
        });
        refs.tasks.append(row);
    });
}

function updateProgress() {
    const l = activeList();
    const total = l ? l.tasks.length : 0;
    const done = l ? l.tasks.filter((t) => t.done).length : 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    refs.progressFill.style.width = pct + "%";
    refs.headCount.textContent = total ? `${done}/${total}` : "0";
    refs.footerMeta.textContent = total
        ? `${done} done · ${total - done} left`
        : "No tasks yet";
}

// ─── open / close ───────────────────────────────────────────────────────────

export async function openTodoModal(targetListId) {
    if (!overlay) build();
    const ws = getCurrentWorkspace();
    refs.subtitle.textContent = !ws || ws === "default" ? "Start" : ws.replace(/-/g, " ");

    await loadModel();
    // Deep-link from a reminder notification (?open=tasks&list=…).
    if (targetListId && lists.some((l) => l.id === targetListId))
        activeId = targetListId;

    refs.body.replaceChildren();
    if (locked) {
        refs.body.append(buildLocked());
    } else {
        refs.body.append(buildSidebar(), buildMain());
        if (refs.search) refs.search.value = "";
        renderLists();
        renderMain();
    }

    overlay.style.display = "flex";
    isOpen = true;
    document.addEventListener("keydown", onKey, true);
    if (!locked) requestAnimationFrame(() => refs.addInput && refs.addInput.focus());
}

function onKey(e) {
    if (e.key === "Escape" && isOpen) {
        // An active inline task edit swallows the first Escape (cancels the
        // edit, keeps the modal open) — its own keydown handler runs after
        // this capture-phase one.
        if (e.target?.classList?.contains("todo-task-edit")) return;
        e.preventDefault();
        close();
    }
}

export function close() {
    if (!overlay || !isOpen) return;
    closeReminderPopover();
    flushGlobalSave(); // commit any pending debounced write
    overlay.style.display = "none";
    isOpen = false;
    document.removeEventListener("keydown", onKey, true);
}

export function isTodoModalOpen() {
    return isOpen;
}

export function handleWorkspaceSwitched() {
    if (isOpen) close();
}
