// storage-local.js — localStorage-backed persistence for the web build.
//
// Same 3 exports the extension code used (`getLocal` / `setLocal` /
// `removeLocal`), now backed by `window.localStorage` instead of
// `chrome.storage.local`. Each function works both as a Promise and with an
// optional node-style callback as the last argument, so converted call sites
// keep working unchanged:
//
//   getLocal(["a", "b"], (result) => ...)   // callback style (legacy)
//   const { a } = await getLocal(["a"]);    // promise style
//
// Values are JSON-serialized. Keys with `undefined` values are removed on set
// (matching chrome.storage semantics).
//
// Cross-tab coordination: every write dispatches through `storage-coordinator`
// via the `storage` event (other tabs) plus an in-page notification for the
// originating tab (see `notifyLocalChange`).

const listeners = new Set();

function readRaw(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function decode(raw) {
    if (raw == null) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function pick(keys) {
    const out = {};
    if (keys == null) {
        // Return everything (mirrors chrome.storage.local.get(null)).
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                out[k] = decode(readRaw(k));
            }
        } catch {
            /* ignore */
        }
        return out;
    }
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) out[k] = decode(readRaw(k));
    return out;
}

/** Notify in-page subscribers of a write (the `storage` event only fires in *other* tabs). */
export function notifyLocalChange(changes) {
    for (const fn of listeners) {
        try {
            fn(changes);
        } catch (e) {
            console.error("[storage] change listener failed:", e);
        }
    }
}

/** Subscribe to local writes made in THIS tab. Returns an unsubscribe fn. */
export function onLocalChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function withCallback(promise, cb) {
    if (typeof cb === "function") promise.then(cb, (err) => console.error("[storage]", err));
    return promise;
}

export function getLocal(keys, cb) {
    return withCallback(Promise.resolve().then(() => pick(keys)), cb);
}

export function setLocal(values, cb) {
    const promise = Promise.resolve().then(() => {
        const changes = {};
        for (const [key, value] of Object.entries(values || {})) {
            const oldValue = decode(readRaw(key));
            if (value === undefined) {
                try {
                    localStorage.removeItem(key);
                } catch {
                    /* ignore */
                }
            } else {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (e) {
                    console.error(`[storage] set "${key}" failed:`, e);
                }
            }
            changes[key] = { oldValue, newValue: value };
        }
        notifyLocalChange(changes);
    });
    return withCallback(promise, cb);
}

export function removeLocal(keys, cb) {
    const list = Array.isArray(keys) ? keys : [keys];
    const promise = Promise.resolve().then(() => {
        const changes = {};
        for (const key of list) {
            const oldValue = decode(readRaw(key));
            try {
                localStorage.removeItem(key);
            } catch {
                /* ignore */
            }
            changes[key] = { oldValue, newValue: undefined };
        }
        notifyLocalChange(changes);
    });
    return withCallback(promise, cb);
}

// --- session-scoped storage (replaces chrome.storage.session) ----------------
// Tab-lifetime only: in-memory Map. Survives reload? No — by design, same as
// the extension's session storage.
const sessionMap = new Map();

export function getSession(keys, cb) {
    const promise = Promise.resolve().then(() => selectFrom(sessionMap, keys));
    return withCallback(promise, cb);
}

function selectFrom(map, keys) {
    const out = {};
    if (keys == null) {
        for (const [k, v] of map) out[k] = v;
        return out;
    }
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) out[k] = map.get(k);
    return out;
}

export function setSession(values, cb) {
    const promise = Promise.resolve().then(() => {
        for (const [k, v] of Object.entries(values || {})) {
            if (v === undefined) sessionMap.delete(k);
            else sessionMap.set(k, v);
        }
    });
    return withCallback(promise, cb);
}
