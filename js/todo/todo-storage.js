import {
    getCurrentWorkspace,
    protectedIds,
    sessionKeys,
} from "../workspaces/workspace-state.js";
import { encryptData, decryptData, randomBase64 } from "../crypto-utils.js";
import { getLocal, removeLocal, setLocal } from "../storage-local.js";

// ─── Global todo storage (off-grid, workspace-scoped) ──────────────────────
//
// "Global" todo lists live entirely inside the Tasks hub. Exactly like notes,
// they are DELIBERATELY off-grid: stored under their own `localStorage`
// key (`workspace_todos_{id}`) and NEVER entries in the workspace `group[]`
// array. The board serializes via DOM-as-truth (dom-manager/grid-state.js), so
// nothing here is rendered in the grid container and global todos are naturally
// excluded from public-board snapshots. This module is their sole writer — it
// does NOT go through the `persistWorkspaceState` choke point (reserved for
// workspace-shaped keys; `workspace_todos_` is intentionally not one of them).
//
// The OTHER kind of hub list — "group" lists mirroring in-group `type:"todo"`
// items — is NOT handled here; those read/write the workspace groups directly
// (see todo-modal.js §5b). This module only owns the global lists.
//
// Protection inheritance mirrors notes: global todos have no encryption of
// their own but inherit their workspace's protection. When a workspace is
// protected, the blob is encrypted with the SAME in-memory session key (own IV)
// so a locked workspace's todos are unreadable even in raw storage, and
// `saveTodos` refuses to write plaintext for a protected workspace.

const TODOS_KEY = (workspaceId) => `workspace_todos_${workspaceId}`;

/** @typedef {{ id: string, text: string, done: boolean, createdAt: number, updatedAt: number }} Task */
/** @typedef {{ id: string, name: string, tasks: Task[] }} List */

const isProtected = (workspaceId) => protectedIds.includes(workspaceId);
const isUnlocked = (workspaceId) => sessionKeys.has(workspaceId);

/** A protected workspace whose session key is not in memory → todos unreadable. */
export function areWorkspaceTodosLocked(workspaceId = getCurrentWorkspace()) {
    return isProtected(workspaceId) && !isUnlocked(workspaceId);
}

const rand6 = () => randomBase64(6).replace(/[^a-z0-9]/gi, "").slice(0, 6);

/** Mint a fresh, empty global list. `now` is injected so callers control ids. */
export function createList(now = Date.now(), name = "") {
    return {
        id: "list_" + now.toString(36) + "_" + rand6(),
        name: typeof name === "string" ? name : "",
        tasks: [],
    };
}

/** Mint a fresh global task. `now` is injected so callers control timestamps. */
export function createTask(now = Date.now(), text = "") {
    return {
        id: "task_" + now.toString(36) + "_" + rand6(),
        text: typeof text === "string" ? text : "",
        done: false,
        createdAt: now,
        updatedAt: now,
    };
}

/** Coerce arbitrary stored data into a clean array of valid tasks. */
function normalizeTasks(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const id = typeof entry.id === "string" && entry.id ? entry.id : null;
        if (!id) continue;
        out.push({
            id,
            text: typeof entry.text === "string" ? entry.text : "",
            done: !!entry.done,
            createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
            updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
        });
    }
    return out;
}

/** Coerce arbitrary stored data into a clean array of valid lists. */
function normalizeLists(raw) {
    // Stored shape is `{ lists: [...] }`; tolerate a bare array too.
    const arr = Array.isArray(raw) ? raw : raw && Array.isArray(raw.lists) ? raw.lists : [];
    const out = [];
    for (const entry of arr) {
        if (!entry || typeof entry !== "object") continue;
        const id = typeof entry.id === "string" && entry.id ? entry.id : null;
        if (!id) continue;
        out.push({
            id,
            name: typeof entry.name === "string" ? entry.name : "",
            tasks: normalizeTasks(entry.tasks),
        });
    }
    return out;
}

const readRaw = (workspaceId) =>
    new Promise((resolve) =>
        getLocal([TODOS_KEY(workspaceId)], (res) =>
            resolve(res[TODOS_KEY(workspaceId)]),
        ),
    );

const writeRaw = (workspaceId, value) =>
    new Promise((resolve) =>
        setLocal({ [TODOS_KEY(workspaceId)]: value }, resolve),
    );

const removeRaw = (workspaceId) =>
    new Promise((resolve) =>
        removeLocal([TODOS_KEY(workspaceId)], resolve),
    );

/**
 * Load a workspace's global todo lists.
 * @returns {Promise<{ locked: boolean, lists: List[] }>}
 */
export async function loadTodos(workspaceId = getCurrentWorkspace()) {
    const raw = await readRaw(workspaceId);

    if (isProtected(workspaceId)) {
        if (!isUnlocked(workspaceId)) return { locked: true, lists: [] };
        if (raw && raw.enc) {
            try {
                const plain = await decryptData(
                    sessionKeys.get(workspaceId),
                    raw.iv,
                    raw.data,
                );
                return { locked: false, lists: normalizeLists(JSON.parse(plain)) };
            } catch {
                return { locked: false, lists: [] };
            }
        }
        // Protected but stored plaintext (e.g. written before protection was
        // enabled) — still readable this session; the next save re-encrypts.
        return { locked: false, lists: normalizeLists(raw) };
    }

    return { locked: false, lists: normalizeLists(raw) };
}

/**
 * Persist a workspace's global todo lists, encrypting when protected.
 * @returns {Promise<List[]>} the normalized lists that were written.
 */
export async function saveTodos(lists, workspaceId = getCurrentWorkspace()) {
    const clean = normalizeLists({ lists });

    if (isProtected(workspaceId)) {
        if (!isUnlocked(workspaceId)) {
            // Guard: never write plaintext todos for a locked protected
            // workspace (would be a plaintext hole and would clobber ciphertext).
            throw new Error("workspace is locked — cannot save todos");
        }
        const enc = await encryptData(
            sessionKeys.get(workspaceId),
            JSON.stringify(clean),
        );
        await writeRaw(workspaceId, { enc: true, iv: enc.iv, data: enc.data });
    } else {
        await writeRaw(workspaceId, { lists: clean });
    }
    return clean;
}

/** Delete a workspace's global-todo blob entirely (used when a workspace is removed). */
export async function deleteWorkspaceTodos(workspaceId) {
    await removeRaw(workspaceId);
}

/**
 * Key move on workspace rename (the id IS the storage key suffix). Write
 * lands before the remove so the blob is never absent under both ids. Moves
 * the raw value untouched — encrypted blobs stay encrypted.
 */
export async function moveWorkspaceTodos(fromWorkspaceId, toWorkspaceId) {
    const raw = await readRaw(fromWorkspaceId);
    if (raw === undefined) return;
    await writeRaw(toWorkspaceId, raw);
    await removeRaw(fromWorkspaceId);
}

// ─── Protection lifecycle inheritance ──────────────────────────────────────
// Called from workspace-protection.js so enabling/removing protection also
// encrypts/decrypts the todo blob with the workspace's session key.

/** Encrypt the workspace's existing plaintext global todos under `key`. */
export async function encryptTodosForProtection(workspaceId, key) {
    const raw = await readRaw(workspaceId);
    if (raw && raw.enc) return; // already encrypted
    const lists = normalizeLists(raw);
    const enc = await encryptData(key, JSON.stringify(lists));
    await writeRaw(workspaceId, { enc: true, iv: enc.iv, data: enc.data });
}

/** Decrypt the workspace's global-todo blob back to plaintext using `key`. */
export async function decryptTodosForUnprotection(workspaceId, key) {
    const raw = await readRaw(workspaceId);
    if (!raw || !raw.enc) return; // nothing encrypted to restore
    let lists = [];
    try {
        lists = normalizeLists(JSON.parse(await decryptData(key, raw.iv, raw.data)));
    } catch {
        lists = [];
    }
    await writeRaw(workspaceId, { lists });
}
