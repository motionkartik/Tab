import { getLastWriteToken } from "./workspace-storage.js";
import { onLocalChange } from "../storage-local.js";

/**
 * Web build: the page's single storage-change fan-out.
 *
 * Source-of-truth rule: in-memory state is a cache of localStorage, reloaded
 * on any external change. Cross-tab coordination happens in ONE place —
 * consumers register a named handler instead of attaching their own listener;
 * fan-out order is fixed by HANDLER_ORDER, so "model reloads before UI reads
 * it" is a property of this file, not of module-load timing. One handler
 * throwing never starves the rest.
 *
 * Two sources feed the fan-out:
 *   1. `onLocalChange` — writes made in THIS tab (via storage-local.js).
 *   2. `window` "storage" events — writes made in OTHER tabs.
 */

const HANDLER_ORDER = [
    "workspace-reload",
    "workspace-visuals",
    "onboarding",
    "session-recovery",
    "todo-badge",
];

const handlers = new Map();
let installed = false;

// Change classification.
const STRUCTURE_KEYS = new Set([
    "workspaces",
    "workspaceOrder",
    "workspaceNames",
    "activeWorkspace",
    "workspace_protected_ids",
]);
const VISUAL_KEYS = new Set([
    "workspaceVisuals",
    "backgroundType",
    "color",
    "backgroundImage",
]);

const classify = (changes) => {
    const kinds = new Set();
    Object.keys(changes).forEach((key) => {
        if (STRUCTURE_KEYS.has(key) || key.startsWith("workspace_protected_"))
            kinds.add("workspace-structure");
        else if (VISUAL_KEYS.has(key) || key.startsWith("workspace_bg_"))
            kinds.add("visuals");
        else if (key.startsWith("general_") || key.startsWith("layout_"))
            kinds.add("settings");
        else kinds.add("other");
    });
    return kinds;
};

const fanOut = (changes) => {
    let incomingToken;
    try {
        incomingToken = changes.workspaceWriteToken?.newValue;
    } catch {
        incomingToken = undefined;
    }
    const context = {
        // Echo of a workspace write THIS tab made (write-token match).
        // Suppression is per-handler by design: the reload path must skip
        // self-writes, while bookkeeping handlers may still want them.
        isSelfWrite:
            !!incomingToken && incomingToken === getLastWriteToken(),
        kinds: classify(changes),
    };

    HANDLER_ORDER.forEach((name) => {
        const handler = handlers.get(name);
        if (!handler) return;
        try {
            handler(changes, context);
        } catch (e) {
            console.error(
                `[storage-coordinator] "${name}" handler failed:`,
                e,
            );
        }
    });
};

// Convert a cross-tab `storage` event into the {key:{oldValue,newValue}} shape.
const fromStorageEvent = (event) => {
    if (!event.key) return null; // clear() — let consumers reload fully
    let oldValue;
    let newValue;
    try {
        oldValue = event.oldValue == null ? undefined : JSON.parse(event.oldValue);
    } catch {
        oldValue = undefined;
    }
    try {
        newValue = event.newValue == null ? undefined : JSON.parse(event.newValue);
    } catch {
        newValue = undefined;
    }
    return { [event.key]: { oldValue, newValue } };
};

const install = () => {
    if (installed) return;
    installed = true;
    // Same-tab writes (storage-local.js notifies synchronously on write).
    onLocalChange((changes) => fanOut(changes || {}));
    // Other-tab writes (fires only in tabs that did NOT make the write).
    window.addEventListener("storage", (event) => {
        const changes = fromStorageEvent(event);
        if (!changes) {
            fanOut({});
            return;
        }
        fanOut(changes);
    });
};

export const registerStorageHandler = (name, handler) => {
    if (!HANDLER_ORDER.includes(name)) {
        // Tolerate legacy handler names (license / cloud-sync / link-health /
        // shared-board-editor) at registration time: they no longer exist in
        // the web build, so ignore them instead of throwing.
        console.warn(
            `[storage-coordinator] Ignoring removed handler "${name}".`,
        );
        return () => {};
    }
    if (handlers.has(name)) {
        // Re-registration replaces (some consumers re-init); the fan-out
        // stays single-handler-per-name either way.
        console.warn(
            `[storage-coordinator] Handler "${name}" re-registered; replacing.`,
        );
    }
    handlers.set(name, handler);
    install();
    return () => {
        if (handlers.get(name) === handler) handlers.delete(name);
    };
};
