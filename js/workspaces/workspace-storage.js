import { getLocal, removeLocal, setLocal } from "../storage-local.js";
import {
    currentWorkspace,
    workspacesData,
    workspaceOrder,
    workspaceNames,
    protectedIds,
    sessionKeys,
    managedBoardIds,
    setCurrentWorkspace,
    setWorkspaceOrder,
    setWorkspaceNames,
    setProtectedIds,
    PROTECTED_IDS_KEY,
    DEFAULT_WORKSPACE_VISUAL_SETTINGS,
    normalizeWorkspaceVisualSettings,
    hydrateWorkspaceVisualsFromStoredMaps,
} from "./workspace-state.js";
import { encryptData, decryptData, randomBase64 } from "../crypto-utils.js";
import { cancelPendingGridSave } from "../dom-manager/grid-state.js";
import {
    sanitizeWorkspaceMap,
    isProtectedWorkspaceSentinel,
} from "../untrusted-input.js";
import {
    GRID_COLS,
    GRID_COLS_STORAGE_KEY,
    boardColumnsFromPayload,
} from "../grid-columns.js";

/**
 * If storage was written by the old icon-deduplication system (storage-codec.js),
 * items may have '_i...' hash keys instead of SVG strings. This expands them
 * back using the _icons table, then resaves clean and removes _icons.
 */
function migrateIconsIfNeeded(workspaces, icons) {
    if (!icons || Object.keys(icons).length === 0) return workspaces;
    const migrated = {};
    for (const [wsId, groups] of Object.entries(workspaces)) {
        if (!Array.isArray(groups) || groups.length === 0) {
            migrated[wsId] = groups;
            continue;
        }
        migrated[wsId] = groups.map((group) => {
            if (!group.items?.length) return group;
            const items = group.items.map((item) => {
                if (!item.icon?.startsWith("_i")) return item;
                const svg = icons[item.icon];
                return svg ? { ...item, icon: svg } : { ...item, icon: "" };
            });
            return { ...group, items };
        });
    }
    // Clean up: resave without _icons so we never migrate again
    setLocal({ workspaces: migrated });
    removeLocal("_icons");
    return migrated;
}

function stripGroupAccent(group) {
    if (!group || typeof group !== "object") return group;

    const { accent: _accent, content, ...rest } = group;
    if (!content || typeof content !== "object") {
        return content === undefined ? rest : { ...rest, content };
    }

    const { accent: _contentAccent, ...contentRest } = content;
    return {
        ...rest,
        content: contentRest,
    };
}

function stripWorkspaceAccents(workspaces) {
    if (!workspaces || typeof workspaces !== "object") return {};

    return Object.fromEntries(
        Object.entries(workspaces).map(([workspaceId, groups]) => [
            workspaceId,
            Array.isArray(groups) ? groups.map(stripGroupAccent) : groups,
        ]),
    );
}

function migrateWorkspaceVisualsIfNeeded(result, workspaceIds) {
    const visuals = {};
    const storedVisuals =
        result.workspaceVisuals && typeof result.workspaceVisuals === "object"
            ? result.workspaceVisuals
            : {};

    const legacyBase = {
        borderRadius:
            result.layout_borderRadius ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.borderRadius,
        cardOpacity:
            result.layout_cardOpacity ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.cardOpacity,
        fontSize:
            result.layout_fontSize ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.fontSize,
        compactMode:
            result.layout_compactMode ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.compactMode,
        tabUnderline:
            result.layout_tabUnderline ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.tabUnderline,
        showDescriptions:
            result.layout_showDescriptions ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.showDescriptions,
        autoFavicon:
            result.layout_autoFavicon ??
            DEFAULT_WORKSPACE_VISUAL_SETTINGS.autoFavicon,
    };

    if (typeof result.layout_uiStyle === "string" && result.layout_uiStyle) {
        legacyBase.theme = result.layout_uiStyle;
    }

    workspaceIds.forEach((workspaceId) => {
        visuals[workspaceId] = normalizeWorkspaceVisualSettings({
            ...legacyBase,
            ...(storedVisuals[workspaceId] || {}),
        });
    });

    return visuals;
}

export const applyStorageResult = (result) => {
    if (result.workspaces) {
        const workspaces = sanitizeWorkspaceMap(
            stripWorkspaceAccents(
                migrateIconsIfNeeded(result.workspaces, result._icons),
            ),
        );
        // WI-5: at boot no session keys exist, so every protected sentinel
        // becomes an empty locked board; unlock re-decrypts it later.
        normalizeProtectedEntriesForMemory(workspaces);
        const preservedManagedVisuals = {};

        // Preserve managed board workspaces — they're not in regular storage
        for (const id of managedBoardIds) {
            if (workspacesData.workspaces[id] !== undefined) {
                workspaces[id] = workspacesData.workspaces[id];
            }
            if (workspacesData.workspaceVisuals?.[id]) {
                preservedManagedVisuals[id] =
                    workspacesData.workspaceVisuals[id];
            }
        }

        workspacesData.workspaces = workspaces;

        const newOrder = Array.isArray(result.workspaceOrder)
            ? result.workspaceOrder.filter((id) => id in workspaces)
            : Object.keys(workspaces);

        Object.keys(workspaces).forEach((id) => {
            if (!newOrder.includes(id)) newOrder.push(id);
        });

        // Re-append managed board IDs that were stripped from persisted order
        for (const id of managedBoardIds) {
            if (!newOrder.includes(id)) newOrder.push(id);
        }

        const activeWorkspace =
            typeof result.activeWorkspace === "string" &&
            workspaces[result.activeWorkspace] !== undefined
                ? result.activeWorkspace
                : workspaces.default !== undefined
                  ? "default"
                  : Object.keys(workspaces)[0] || "default";
        workspacesData.activeWorkspace = activeWorkspace;
        setCurrentWorkspace(activeWorkspace);

        workspacesData.workspaceVisuals = {
            ...migrateWorkspaceVisualsIfNeeded(result, Object.keys(workspaces)),
            ...preservedManagedVisuals,
        };
        hydrateWorkspaceVisualsFromStoredMaps(
            result.workspaceStyles,
            result.workspaceSavedThemes,
            result.workspaceProThemes,
        );

        setWorkspaceOrder(newOrder);
        if (
            result.workspaceNames &&
            typeof result.workspaceNames === "object"
        ) {
            // Merge: preserve managed board names that were set by _loadManagedBoards
            const merged = { ...result.workspaceNames };
            for (const id of managedBoardIds) {
                if (workspaceNames[id]) merged[id] = workspaceNames[id];
            }
            setWorkspaceNames(merged);
        }
        return true;
    }
    return false;
};

let lastWriteToken = null;
export const getLastWriteToken = () => lastWriteToken;

// WI-5: in-memory workspace arrays never hold the storage sentinel — a
// locked workspace is an empty board behind the unlock gate (protectedIds +
// sessionKeys carry the lock state), a keyed one is rebuilt from its blob.
const normalizeProtectedEntriesForMemory = (workspaces) => {
    for (const [id, entry] of Object.entries(workspaces)) {
        if (isProtectedWorkspaceSentinel(entry)) workspaces[id] = [];
    }
    return workspaces;
};

// Re-decrypt a protected workspace's blob with this tab's session key.
// Returns the groups array, or null when there is no key/blob or decryption
// fails (callers decide the fallback).
const decryptProtectedWorkspaceFromStorage = async (wsId) => {
    const key = sessionKeys.get(wsId);
    if (!key) return null;
    const blobKey = `workspace_protected_${wsId}`;
    const stored = await new Promise((r) =>
        getLocal([blobKey], r),
    );
    const meta = stored[blobKey];
    if (!meta) return null;
    try {
        const groups = JSON.parse(await decryptData(key, meta.iv, meta.data));
        // Blobs encrypted in the 12-column era (no gridColumns stamp) get
        // their geometry doubled here; the boot migration cannot reach them.
        return Array.isArray(groups)
            ? boardColumnsFromPayload(meta, groups)
            : null;
    } catch (e) {
        console.error(
            "[workspaces] Failed to re-decrypt protected workspace",
            wsId,
            e,
        );
        return null;
    }
};

// ── WI-2: the persistence choke point (contract rule #5) ────────────────────
// The ONLY way any module may write workspace-shaped state to
// localStorage. What flows through here:
//   - `workspaces` maps are sanitized (sanitizeWorkspaceMap) on the way out;
//   - a fresh `workspaceWriteToken` is stamped whenever the `workspaces` map
//     is part of the patch, so other tabs can tell an echo of this tab's own
//     write from a foreign change (storage-coordinator `isSelfWrite`);
//   - key shapes are guarded: in DEV a non-workspace key throws.
// WI-1 is NOT re-run here — it is anchored where data changes form
// (serialize in grid-state, render in grid-renderer); the choke point guards
// what reaches disk, not how it round-trips.
//
// Documented exceptions (their own writers, NOT workspace-shaped state):
// license.js (license keys), i18n.js (language), theme-editor/persistence.js
// (pro_saved_themes), settings-general-handlers.js (general_*/logo),
// managed-boards.js (subscriptions), workspace-share.js
// (readytab_shared_boards), workspace-metadata.js (workspace_metadata_v2),
// public-board-publish.js (readytab_public_boards), cloud-sync-manager.js /
// cloud-sync.js sync-meta (pro_sync_*, pro_active_dashboard_id, pro_user_id).
// entrypoints/background.ts is a separate JS
// context: its context-menu add writes `workspaces` directly, deliberately
// WITHOUT a token so every open tab treats it as foreign and reloads.
// `npm run lint:writes` enforces this list.

const WORKSPACE_KEY_RE =
    /^(workspaces|workspaceOrder|workspaceNames|activeWorkspace|workspaceVisuals|workspaceWriteToken|defaultWorkspaceName|rows|grid_columns|workspace_bg_.+|workspace_protected_ids|workspace_protected_.+)$/;

const assertWorkspaceShapedKeys = (keys) => {
    const offenders = keys.filter((k) => !WORKSPACE_KEY_RE.test(k));
    if (!offenders.length) return;
    const msg = `[workspace-storage] persistWorkspaceState received non-workspace keys: ${offenders.join(", ")} — settings/meta keys keep their own writers (see the exception list).`;

    console.warn(msg);
};

/**
 * Persist a patch of workspace-shaped keys (and optionally remove some)
 * atomically enough for our needs: writes land first, removals after, so a
 * key move (e.g. a protected blob under a renamed id) never has a moment
 * with neither copy present.
 */
export const persistWorkspaceState = async (
    patch = {},
    { removeKeys = [] } = {},
) => {
    assertWorkspaceShapedKeys([...Object.keys(patch), ...removeKeys]);

    const finalPatch = { ...patch };
    if ("workspaces" in finalPatch) {
        finalPatch.workspaces = sanitizeWorkspaceMap(finalPatch.workspaces);
        // WI-5 hard invariant: a protected workspace's plaintext entry is the
        // sentinel — never a content array and never []. DEV fails loud; ship
        // builds coerce to the sentinel (persisting plaintext would leak the
        // very data the passphrase protects, and persisting [] recreates the
        // "locked or empty?" ambiguity that caused two data-loss bugs).
        for (const wsId of protectedIds) {
            const entry = finalPatch.workspaces[wsId];
            if (entry === undefined || isProtectedWorkspaceSentinel(entry))
                continue;
            const msg = `[workspace-storage] Refusing to persist plaintext for protected workspace "${wsId}" — the encrypted blob is the only persistent truth (WI-5).`;
        
            console.error(msg);
            finalPatch.workspaces[wsId] = { __protected__: true };
        }
        const writeToken = crypto.randomUUID();
        lastWriteToken = writeToken;
        finalPatch.workspaceWriteToken = writeToken;
    }

    let error = null;
    if (Object.keys(finalPatch).length) {
        error = await new Promise((resolve) =>
            setLocal(finalPatch, () =>
                resolve(null),
            ),
        );
        if (error) {
            console.error(
                "[workspace-storage] persistWorkspaceState set failed:",
                error,
                Object.keys(finalPatch),
            );
        }
    }
    if (removeKeys.length) {
        await new Promise((resolve) =>
            removeLocal(removeKeys, () =>
                resolve(null),
            ),
        );
    }
    // Callers that surface failures to the user (e.g. quota alerts for large
    // image backgrounds) read this; everyone else can ignore it.
    return { error };
};

export const saveWorkspacesToStorage = async ({ atomic = false } = {}) => {
    const encryptedPatch = {};

    const workspacesToSave = stripWorkspaceAccents(workspacesData.workspaces);

    // Never persist managed board workspaces — they live in managed_board_subscriptions
    for (const id of managedBoardIds) {
        delete workspacesToSave[id];
    }

    for (const wsId of protectedIds) {
        const key = sessionKeys.get(wsId);
        const wsData = workspacesData.workspaces[wsId];
        if (key && wsData) {
            try {
                const plaintext = JSON.stringify(
                    Array.isArray(wsData)
                        ? wsData.map(stripGroupAccent)
                        : wsData,
                );
                const encrypted = await encryptData(key, plaintext);
                const existingMeta = await new Promise((r) =>
                    getLocal(
                        [`workspace_protected_${wsId}`],
                        r,
                    ),
                );
                const salt =
                    existingMeta[`workspace_protected_${wsId}`]?.salt ||
                    randomBase64(16);
                const protectedPatch = {
                    [`workspace_protected_${wsId}`]: {
                        salt,
                        gridColumns: GRID_COLS,
                        ...encrypted,
                    },
                };
                if (atomic) Object.assign(encryptedPatch, protectedPatch);
                else await persistWorkspaceState(protectedPatch);
            } catch (e) {
                // Batch imports must not report success after losing a
                // protected destination. Nothing has been written yet.
                if (atomic) throw e;
                console.error(
                    "[workspaces] Failed to encrypt workspace",
                    wsId,
                    e,
                );
            }
        }
        // WI-5: the plaintext entry for a protected workspace is always the
        // sentinel — never [] (indistinguishable from a genuinely empty
        // board) and never content (the blob above is the persistent truth).
        workspacesToSave[wsId] = { __protected__: true };
    }

    const persistedOrder = workspaceOrder.filter(
        (id) => !managedBoardIds.has(id),
    );

    return await persistWorkspaceState(
        {
            ...encryptedPatch,
            workspaces: workspacesToSave,
            workspaceOrder: persistedOrder,
            workspaceNames,
            activeWorkspace: managedBoardIds.has(currentWorkspace)
                ? "default"
                : currentWorkspace,
            workspaceVisuals: workspacesData.workspaceVisuals || {},
            // Geometry space marker, written atomically WITH the data it
            // describes so the boot migration (workspace-init) can never see
            // doubled-but-unstamped workspaces and double them again.
            [GRID_COLS_STORAGE_KEY]: GRID_COLS,
        },
        {
            // The legacy `rows` mirror (pre-workspaces single board) is no
            // longer written OR read as live state — it held the *active*
            // workspace's content, which made it a standing cross-workspace
            // overwrite hazard for any code that fell back to it. The old
            // export format is still accepted by the JSON import; the storage
            // key itself is retired, so clear any stale copy.
            removeKeys: ["rows"],
        },
    );
};

export const reloadFromStorage = () => {
    // Drop any debounced grid save scheduled against the OLD DOM before we
    // replace the in-memory model and re-render. Without this, a pending
    // saveGridState() timer can fire after the reload and persist the stale
    // DOM serialization over the entire freshly-loaded workspaces map.
    cancelPendingGridSave();

    return new Promise((resolve) => {
        getLocal(
            [
                "workspaces",
                "_icons",
                "workspaceOrder",
                "workspaceNames",
                "activeWorkspace",
                "workspaceVisuals",
                PROTECTED_IDS_KEY,
            ],
            async (result) => {
                if (!result.workspaces) {
                    resolve();
                    return;
                }

                // Another tab may have protected/unprotected a workspace —
                // refresh the in-memory protection set or this tab would keep
                // treating the workspace as open (or locked) until reload.
                setProtectedIds(
                    Array.isArray(result[PROTECTED_IDS_KEY])
                        ? result[PROTECTED_IDS_KEY]
                        : [],
                );

                const hydrateAndLoad = async (hydratedResult) => {
                    const restoredWorkspaces = sanitizeWorkspaceMap(
                        stripWorkspaceAccents(
                            migrateIconsIfNeeded(
                                result.workspaces,
                                result._icons,
                            ),
                        ),
                    );
                    const workspaceIds = Object.keys(restoredWorkspaces);

                    // WI-5: the encrypted blob is the only persistent truth
                    // for a protected workspace. Sentinel entries become empty
                    // locked boards in memory; for every workspace this tab
                    // holds a session key for, re-decrypt the blob so
                    // cross-tab edits are picked up by construction (instead
                    // of the old "preserve whatever memory had" patch, which
                    // could keep a stale copy alive).
                    normalizeProtectedEntriesForMemory(restoredWorkspaces);
                    const previousWorkspaces = workspacesData.workspaces || {};
                    for (const id of sessionKeys.keys()) {
                        const decrypted =
                            await decryptProtectedWorkspaceFromStorage(id);
                        if (decrypted) {
                            restoredWorkspaces[id] = decrypted;
                        } else if (
                            Array.isArray(previousWorkspaces[id]) &&
                            previousWorkspaces[id].length > 0
                        ) {
                            // Blob missing/unreadable: keep the in-memory copy
                            // rather than dropping to empty — the next save
                            // re-encrypts it, self-healing the blob.
                            restoredWorkspaces[id] = previousWorkspaces[id];
                        }
                    }

                    // Personal storage reloads must not replace a shared board,
                    // including unsaved edits that belong to this page.
                    for (const id of managedBoardIds) {
                        if (previousWorkspaces[id]) restoredWorkspaces[id] = previousWorkspaces[id];
                    }
                    workspacesData.workspaces = restoredWorkspaces;
                    workspacesData.workspaceVisuals =
                        migrateWorkspaceVisualsIfNeeded(
                            hydratedResult,
                            workspaceIds,
                        );
                    hydrateWorkspaceVisualsFromStoredMaps(
                        hydratedResult.workspaceStyles,
                        hydratedResult.workspaceSavedThemes,
                        hydratedResult.workspaceProThemes,
                    );

                    const nextOrder = Array.isArray(result.workspaceOrder)
                        ? result.workspaceOrder.filter(
                              (id) => id in restoredWorkspaces,
                          )
                        : [];

                    workspaceIds.forEach((id) => {
                        if (!nextOrder.includes(id)) nextOrder.push(id);
                    });

                    for (const id of managedBoardIds) {
                        if (!nextOrder.includes(id)) nextOrder.push(id);
                    }

                    setWorkspaceOrder(nextOrder);

                    const mergedNames =
                        result.workspaceNames &&
                        typeof result.workspaceNames === "object"
                            ? { ...result.workspaceNames }
                            : {};

                    for (const id of managedBoardIds) {
                        if (workspaceNames[id])
                            mergedNames[id] = workspaceNames[id];
                    }

                    setWorkspaceNames(mergedNames);

                    // Preserve THIS tab's current workspace across a cross-tab
                    // reload. The persisted `activeWorkspace` reflects whichever
                    // tab last wrote, so honoring it here would yank this tab to
                    // another tab's view and risk serializing the wrong DOM back
                    // over an unrelated workspace.
                    const activeWs =
                        currentWorkspace in restoredWorkspaces
                            ? currentWorkspace
                            : typeof result.activeWorkspace === "string" &&
                                result.activeWorkspace in restoredWorkspaces
                              ? result.activeWorkspace
                              : "default";

                    workspacesData.activeWorkspace = activeWs;
                    setCurrentWorkspace(activeWs);

                    const [
                        { loadCurrentWorkspace },
                        { renderWorkspaceTabs },
                        { applyWorkspaceVisualSettings },
                    ] = await Promise.all([
                        import("./workspace-grid-sync.js"),
                        import("./workspace-tabs-ui.js"),
                        import("./workspace-visuals.js"),
                    ]);

                    renderWorkspaceTabs();
                    loadCurrentWorkspace();
                    await applyWorkspaceVisualSettings(activeWs);
                    resolve();
                };

                if (result.workspaceVisuals) {
                    await hydrateAndLoad(result);
                    return;
                }

                getLocal(
                    [
                        "workspaceStyles",
                        "workspaceSavedThemes",
                        "workspaceProThemes",
                        "layout_borderRadius",
                        "layout_cardOpacity",
                        "layout_fontSize",
                        "layout_compactMode",
                        "layout_uiStyle",
                        "layout_tabUnderline",
                        "layout_showDescriptions",
                        "layout_autoFavicon",
                    ],
                    async (legacyResult) => {
                        await hydrateAndLoad({ ...result, ...legacyResult });
                    },
                );
            },
        );
    });
};
