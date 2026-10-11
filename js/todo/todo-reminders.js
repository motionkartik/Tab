import { getLocal, setLocal } from "../storage-local.js";
// Task reminders — front-end storage API for the tasks hub (web build).
//
// Reminders are LOCAL-ONLY (per browser profile) and fire in-page: a timer
// started by `initTodoReminders()` checks due reminders while the dashboard
// is open and shows them via the Web Notifications API (falling back to an
// in-page toast when permission is denied). One-shot: each reminder is
// deleted after it fires. Shape:
//   { id, workspaceId, origin:"global"|"group", listId, taskId|null, label, when }

export const TODO_REMINDERS_KEY = "todo_reminders";

// Presets offered in the bell popover (label + offset from now, in ms + icon).
export const REMINDER_PRESETS = [
    { id: "15m", label: "15 min", ms: 15 * 60 * 1000, icon: "clock" },
    { id: "30m", label: "30 min", ms: 30 * 60 * 1000, icon: "clock" },
    { id: "1h", label: "1 hour", ms: 60 * 60 * 1000, icon: "clock" },
    { id: "1d", label: "Tomorrow", ms: 24 * 60 * 60 * 1000, icon: "calendar" },
];

/** Canonical identity for a reminder target — one reminder per target. */
export function reminderTargetKey(t) {
    return `${t.workspaceId}::${t.origin}::${t.listId}::${t.taskId || ""}`;
}

function readAll() {
    return new Promise((resolve) =>
        getLocal(TODO_REMINDERS_KEY, (r) =>
            resolve(
                Array.isArray(r[TODO_REMINDERS_KEY])
                    ? r[TODO_REMINDERS_KEY]
                    : [],
            ),
        ),
    );
}

function writeAll(list) {
    return new Promise((resolve) =>
        setLocal({ [TODO_REMINDERS_KEY]: list }, resolve),
    );
}

async function isProtectedWorkspace(workspaceId) {
    const { workspace_protected_ids } = await getLocal(
        "workspace_protected_ids",
    );
    return (
        Array.isArray(workspace_protected_ids) &&
        workspace_protected_ids.includes(workspaceId)
    );
}

/** Map of reminderTargetKey → reminder, for the given workspace only. */
export async function getReminderMap(workspaceId) {
    const all = await readAll();
    const map = {};
    all.forEach((r) => {
        if (r && r.workspaceId === workspaceId)
            map[reminderTargetKey(r)] = r;
    });
    return map;
}

/**
 * Create or replace the reminder for `target` at epoch-ms `when`. For a
 * protected workspace the label is forced generic so task text never lands in
 * plaintext storage or a lock-screen notification.
 */
export async function setReminder(target, when) {
    const protectedWs = await isProtectedWorkspace(target.workspaceId);
    const label = protectedWs
        ? "Task reminder"
        : (target.label || "Task reminder").slice(0, 120);
    const key = reminderTargetKey(target);
    const all = (await readAll()).filter((r) => reminderTargetKey(r) !== key);
    const reminder = {
        id: "rem_" + crypto.randomUUID(),
        workspaceId: target.workspaceId,
        origin: target.origin,
        listId: target.listId,
        taskId: target.taskId || null,
        label,
        when,
    };
    all.push(reminder);
    await writeAll(all);
    return reminder;
}

/** Remove the reminder for one target (no-op if none). */
export async function clearReminder(target) {
    const key = reminderTargetKey(target);
    const all = await readAll();
    const next = all.filter((r) => reminderTargetKey(r) !== key);
    if (next.length !== all.length) await writeAll(next);
}

/**
 * Lifecycle cleanup: drop every reminder for a whole list (list + its tasks).
 * Returns the removed records so an undo path can restoreReminders() them.
 */
export async function clearRemindersForList(workspaceId, origin, listId) {
    const all = await readAll();
    const matches = (r) =>
        r.workspaceId === workspaceId &&
        r.origin === origin &&
        r.listId === listId;
    const removed = all.filter(matches);
    if (removed.length) await writeAll(all.filter((r) => !matches(r)));
    return removed;
}

/** Lifecycle cleanup: drop every reminder for a deleted workspace. */
export async function clearRemindersForWorkspace(workspaceId) {
    const all = await readAll();
    const next = all.filter((r) => r.workspaceId !== workspaceId);
    if (next.length !== all.length) await writeAll(next);
}

/** Re-key reminders when a workspace rename changes its id. */
export async function moveRemindersToWorkspace(fromWorkspaceId, toWorkspaceId) {
    const all = await readAll();
    let touched = false;
    const next = all.map((r) => {
        if (r.workspaceId !== fromWorkspaceId) return r;
        touched = true;
        return { ...r, workspaceId: toWorkspaceId };
    });
    if (touched) await writeAll(next);
}

/**
 * Re-add records captured by clearRemindersForList (undo of a group delete).
 * Past-due records are kept: the background fires a when-in-the-past alarm
 * immediately, same as if the delete never happened. Skips targets that
 * gained a fresh reminder in the meantime.
 */
export async function restoreReminders(records) {
    if (!Array.isArray(records) || !records.length) return;
    const all = await readAll();
    const taken = new Set(all.map(reminderTargetKey));
    const toAdd = records.filter((r) => !taken.has(reminderTargetKey(r)));
    if (toAdd.length) await writeAll(all.concat(toAdd));
}

/** Whether the master switch (Settings › Tasks) currently allows firing. */
export async function reminderNotificationsEnabled() {
    const { general_todoNotifications } = await getLocal(
        "general_todoNotifications",
    );
    return general_todoNotifications !== false;
}

/** Request web-notification permission. MUST run in a user gesture. */
export async function ensureNotificationPermission() {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
        return (await Notification.requestPermission()) === "granted";
    } catch {
        return false;
    }
}

/**
 * Gate a reminder-set on both the browser permission (requested here) and the
 * master switch. Returns { ok } or { ok:false, reason:"blocked"|"off" }.
 */
export async function canScheduleReminder() {
    const granted = await ensureNotificationPermission();
    if (!granted) return { ok: false, reason: "blocked" };
    if (!(await reminderNotificationsEnabled()))
        return { ok: false, reason: "off" };
    return { ok: true };
}

// --- in-page firing ----------------------------------------------------------
// The extension relied on the background service worker (alarms). On the web
// build a lightweight poller fires due reminders while the page is open.

let pollerStarted = false;

async function fireDueReminders() {
    let all;
    try {
        all = await readAll();
    } catch {
        return;
    }
    const now = Date.now();
    const due = all.filter((r) => r && typeof r.when === "number" && r.when <= now);
    if (!due.length) return;

    let enabled = true;
    try {
        enabled = await reminderNotificationsEnabled();
    } catch {
        enabled = true;
    }
    if (!enabled) return;

    const remaining = all.filter((r) => !(typeof r?.when === "number" && r.when <= now));
    await writeAll(remaining);

    for (const r of due) {
        const label = r.label || "Task reminder";
        try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("ReadyTab — task reminder", { body: label });
            } else {
                const { showToast } = await import("../undo-manager.js");
                showToast(label);
            }
        } catch {
            /* ignore */
        }
    }
}

/** Start the in-page reminder poller (idempotent). Call once at boot. */
export function initTodoReminders() {
    if (pollerStarted) return;
    pollerStarted = true;
    // Catch up on reminders that came due while the page was closed, then poll.
    setTimeout(() => void fireDueReminders(), 5000);
    setInterval(() => void fireDueReminders(), 30000);
}
