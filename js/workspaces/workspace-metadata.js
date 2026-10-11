import { getLocal, setLocal } from "../storage-local.js";
const STORAGE_KEY = "workspace_metadata_v2";

function _get(keys) {
    return new Promise((resolve) => getLocal(keys, resolve));
}

function _set(obj) {
    return new Promise((resolve) => setLocal(obj, resolve));
}

export async function getWorkspaceMetadataMap() {
    const result = await _get([STORAGE_KEY]);
    const raw = result?.[STORAGE_KEY];
    return raw && typeof raw === "object" ? { ...raw } : {};
}

async function _saveWorkspaceMetadataMap(metadataMap) {
    await _set({ [STORAGE_KEY]: metadataMap });
}

function _createWorkspaceMetadata(existing = {}) {
    return {
        ...existing,
        uid:
            typeof existing.uid === "string" && existing.uid
                ? existing.uid
                : crypto.randomUUID(),
        createdAt:
            Number.isFinite(Number(existing.createdAt)) &&
            Number(existing.createdAt) > 0
                ? Number(existing.createdAt)
                : Date.now(),
    };
}

export async function ensureWorkspaceUid(workspaceId) {
    if (!workspaceId) return null;
    const metadataMap = await getWorkspaceMetadataMap();
    const existing = metadataMap[workspaceId];
    if (existing?.uid) return existing.uid;

    metadataMap[workspaceId] = _createWorkspaceMetadata(existing);
    await _saveWorkspaceMetadataMap(metadataMap);
    return metadataMap[workspaceId].uid;
}

export async function ensureWorkspaceMetadataForIds(workspaceIds = []) {
    const metadataMap = await getWorkspaceMetadataMap();
    let changed = false;

    workspaceIds.forEach((workspaceId) => {
        if (!workspaceId) return;
        const next = _createWorkspaceMetadata(metadataMap[workspaceId]);
        if (
            !metadataMap[workspaceId] ||
            metadataMap[workspaceId].uid !== next.uid ||
            metadataMap[workspaceId].createdAt !== next.createdAt
        ) {
            metadataMap[workspaceId] = next;
            changed = true;
        }
    });

    if (changed) {
        await _saveWorkspaceMetadataMap(metadataMap);
    }

    return metadataMap;
}

export async function renameWorkspaceMetadata(oldWorkspaceId, newWorkspaceId) {
    if (!oldWorkspaceId || !newWorkspaceId || oldWorkspaceId === newWorkspaceId) {
        return;
    }

    const metadataMap = await getWorkspaceMetadataMap();
    const oldMeta = metadataMap[oldWorkspaceId];
    if (!oldMeta) return;

    metadataMap[newWorkspaceId] = _createWorkspaceMetadata(oldMeta);
    delete metadataMap[oldWorkspaceId];
    await _saveWorkspaceMetadataMap(metadataMap);
}

export async function removeWorkspaceMetadata(workspaceId) {
    if (!workspaceId) return;
    const metadataMap = await getWorkspaceMetadataMap();
    if (!metadataMap[workspaceId]) return;
    delete metadataMap[workspaceId];
    await _saveWorkspaceMetadataMap(metadataMap);
}

export async function setWorkspaceUid(workspaceId, uid) {
    if (!workspaceId || typeof uid !== "string" || !uid) return;
    const metadataMap = await getWorkspaceMetadataMap();
    metadataMap[workspaceId] = {
        ..._createWorkspaceMetadata(metadataMap[workspaceId]),
        uid,
    };
    await _saveWorkspaceMetadataMap(metadataMap);
}
