import {
    getCurrentWorkspace,
    protectedIds,
    sessionKeys,
} from "../workspaces/workspace-state.js";
import { encryptData, decryptData, randomBase64 } from "../crypto-utils.js";
import { getLocal, removeLocal, setLocal } from "../storage-local.js";

// ─── Notes storage (off-grid, workspace-scoped) ────────────────────────────
//
// Notes are DELIBERATELY off-grid: they live under their own
// `localStorage` key (`workspace_notes_{id}`) and are NEVER entries in
// the workspace `group[]` array. The board serializes via DOM-as-truth
// (dom-manager/grid-state.js), so nothing notes-related is ever rendered inside
// the grid container, and notes are naturally excluded from public-board
// snapshots. This module is their sole writer — it does NOT go through the
// `persistWorkspaceState` choke point (that is reserved for workspace-shaped
// keys; `workspace_notes_` is intentionally not one of them).
//
// Protection inheritance: notes have no encryption of their own but inherit
// their workspace's protection. When a workspace is protected, its notes blob
// is encrypted with the SAME in-memory session key (own IV) so a locked
// workspace's notes are unreadable even in raw storage. Plaintext notes next to
// an encrypted workspace would be a hole, so `saveNotes` refuses to write
// plaintext for a protected workspace.

const NOTES_KEY = (workspaceId) => `workspace_notes_${workspaceId}`;

/** @typedef {{ id: string, title: string, content: string, createdAt: number, updatedAt: number }} Note */

const isProtected = (workspaceId) => protectedIds.includes(workspaceId);
const isUnlocked = (workspaceId) => sessionKeys.has(workspaceId);

/** A protected workspace whose session key is not in memory → notes unreadable. */
export function areWorkspaceNotesLocked(workspaceId = getCurrentWorkspace()) {
    return isProtected(workspaceId) && !isUnlocked(workspaceId);
}

/** Mint a fresh, empty note. `now` is injected so callers control timestamps. */
export function createNote(now = Date.now()) {
    return {
        id: "note_" + now.toString(36) + "_" + randomBase64(6).replace(/[^a-z0-9]/gi, "").slice(0, 6),
        title: "",
        content: "",
        createdAt: now,
        updatedAt: now,
    };
}

/** Coerce arbitrary stored data into a clean array of valid notes. */
function normalizeNotes(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const id = typeof entry.id === "string" && entry.id ? entry.id : null;
        if (!id) continue;
        out.push({
            id,
            title: typeof entry.title === "string" ? entry.title : "",
            content: typeof entry.content === "string" ? entry.content : "",
            createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
            updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
        });
    }
    return out;
}

const readRaw = (workspaceId) =>
    new Promise((resolve) =>
        getLocal([NOTES_KEY(workspaceId)], (res) =>
            resolve(res[NOTES_KEY(workspaceId)]),
        ),
    );

const writeRaw = (workspaceId, value) =>
    new Promise((resolve) =>
        setLocal({ [NOTES_KEY(workspaceId)]: value }, resolve),
    );

const removeRaw = (workspaceId) =>
    new Promise((resolve) =>
        removeLocal([NOTES_KEY(workspaceId)], resolve),
    );

/**
 * Load a workspace's notes.
 * @returns {Promise<{ locked: boolean, notes: Note[] }>}
 */
export async function loadNotes(workspaceId = getCurrentWorkspace()) {
    const raw = await readRaw(workspaceId);

    if (isProtected(workspaceId)) {
        if (!isUnlocked(workspaceId)) return { locked: true, notes: [] };
        if (raw && raw.enc) {
            try {
                const plain = await decryptData(
                    sessionKeys.get(workspaceId),
                    raw.iv,
                    raw.data,
                );
                return { locked: false, notes: normalizeNotes(JSON.parse(plain)) };
            } catch {
                return { locked: false, notes: [] };
            }
        }
        // Protected but stored plaintext (e.g. written before protection was
        // enabled) — still readable this session; the next save re-encrypts.
        return { locked: false, notes: normalizeNotes(raw) };
    }

    return { locked: false, notes: normalizeNotes(raw) };
}

/**
 * Persist a workspace's notes, encrypting when the workspace is protected.
 * @returns {Promise<Note[]>} the normalized notes that were written.
 */
export async function saveNotes(notes, workspaceId = getCurrentWorkspace()) {
    const clean = normalizeNotes(notes);

    if (isProtected(workspaceId)) {
        if (!isUnlocked(workspaceId)) {
            // Guard: never write plaintext notes for a locked protected
            // workspace (would be a plaintext hole and would clobber ciphertext).
            throw new Error("workspace is locked — cannot save notes");
        }
        const enc = await encryptData(
            sessionKeys.get(workspaceId),
            JSON.stringify(clean),
        );
        await writeRaw(workspaceId, { enc: true, iv: enc.iv, data: enc.data });
    } else {
        await writeRaw(workspaceId, clean);
    }
    return clean;
}

/** Delete a workspace's notes blob entirely (used when a workspace is removed). */
export async function deleteWorkspaceNotes(workspaceId) {
    await removeRaw(workspaceId);
}

/**
 * Key move on workspace rename (the id IS the storage key suffix). Write
 * lands before the remove so the blob is never absent under both ids. Moves
 * the raw value untouched — encrypted blobs stay encrypted.
 */
export async function moveWorkspaceNotes(fromWorkspaceId, toWorkspaceId) {
    const raw = await readRaw(fromWorkspaceId);
    if (raw === undefined) return;
    await writeRaw(toWorkspaceId, raw);
    await removeRaw(fromWorkspaceId);
}

// ─── Protection lifecycle inheritance ──────────────────────────────────────
// Called from workspace-protection.js so enabling/removing protection also
// encrypts/decrypts the notes blob with the workspace's session key.

/** Encrypt the workspace's existing plaintext notes under `key`. */
export async function encryptNotesForProtection(workspaceId, key) {
    const raw = await readRaw(workspaceId);
    if (raw && raw.enc) return; // already encrypted
    const notes = normalizeNotes(raw);
    const enc = await encryptData(key, JSON.stringify(notes));
    await writeRaw(workspaceId, { enc: true, iv: enc.iv, data: enc.data });
}

/** Decrypt the workspace's notes blob back to plaintext using `key`. */
export async function decryptNotesForUnprotection(workspaceId, key) {
    const raw = await readRaw(workspaceId);
    if (!raw || !raw.enc) return; // nothing encrypted to restore
    let notes = [];
    try {
        notes = normalizeNotes(JSON.parse(await decryptData(key, raw.iv, raw.data)));
    } catch {
        notes = [];
    }
    await writeRaw(workspaceId, notes);
}
