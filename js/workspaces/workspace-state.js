import { sanitizeWorkspaceGroups } from "../untrusted-input.js";

// Web build: no dev-data module ships with the app (it was extension-only).
export const getDevData = async () => null;

export const DEFAULT_WORKSPACE_VISUAL_SETTINGS = Object.freeze({
    // "light" is the out-of-the-box theme (Yann's call, 2026-08-14). "simple"
    // stays the semantic base theme for unknown-theme fallbacks elsewhere.
    theme: "light",
    savedThemeId: null,
    themeOverrides: {},
    customCss: "",
    borderRadius: 8,
    cardOpacity: 85,
    fontSize: "default",
    compactMode: false,
    tabUnderline: false,
    showDescriptions: false,
    autoFavicon: true,
    hoverMotion: true,
});

const cloneDefaultWorkspaceVisualSettings = () => ({
    ...DEFAULT_WORKSPACE_VISUAL_SETTINGS,
});

export const normalizeWorkspaceVisualSettings = (raw) => {
    const base = cloneDefaultWorkspaceVisualSettings();
    if (!raw || typeof raw !== "object") return base;

    const normalized = {
        ...base,
        ...raw,
    };

    normalized.theme =
        typeof normalized.theme === "string" && normalized.theme
            ? normalized.theme
            : base.theme;

    const legacySavedThemeId =
        typeof raw.proThemeId === "string" && raw.proThemeId
            ? raw.proThemeId
            : null;

    normalized.savedThemeId =
        typeof normalized.savedThemeId === "string" && normalized.savedThemeId
            ? normalized.savedThemeId
            : legacySavedThemeId;
    delete normalized.proThemeId;

    normalized.themeOverrides =
        normalized.themeOverrides &&
        typeof normalized.themeOverrides === "object" &&
        !Array.isArray(normalized.themeOverrides)
            ? { ...normalized.themeOverrides }
            : {};

    normalized.customCss =
        typeof normalized.customCss === "string" ? normalized.customCss : "";

    normalized.borderRadius = Number.isFinite(Number(normalized.borderRadius))
        ? Number(normalized.borderRadius)
        : base.borderRadius;

    normalized.cardOpacity = Number.isFinite(Number(normalized.cardOpacity))
        ? Number(normalized.cardOpacity)
        : base.cardOpacity;

    normalized.fontSize = ["small", "default", "large"].includes(
        normalized.fontSize,
    )
        ? normalized.fontSize
        : base.fontSize;

    normalized.compactMode = !!normalized.compactMode;
    normalized.tabUnderline = !!normalized.tabUnderline;
    normalized.showDescriptions = !!normalized.showDescriptions;
    normalized.autoFavicon = !!normalized.autoFavicon;
    normalized.hoverMotion =
        normalized.hoverMotion === undefined ? true : !!normalized.hoverMotion;

    return normalized;
};

const normalizeWorkspaceVisualsMap = (rawMap) => {
    if (!rawMap || typeof rawMap !== "object") return {};
    const next = {};
    Object.entries(rawMap).forEach(([workspaceId, settings]) => {
        next[workspaceId] = normalizeWorkspaceVisualSettings(settings);
    });
    return next;
};

const deriveWorkspaceOrder = (data, workspaces) => {
    const workspaceIds = Object.keys(workspaces || {});
    const explicitOrder = Array.isArray(data?.workspaceOrder)
        ? data.workspaceOrder.filter((workspaceId) =>
              workspaceIds.includes(workspaceId),
          )
        : [];

    const nextOrder = [];
    const seen = new Set();

    const appendWorkspaceId = (workspaceId) => {
        if (
            !workspaceId ||
            seen.has(workspaceId) ||
            !workspaceIds.includes(workspaceId)
        ) {
            return;
        }
        nextOrder.push(workspaceId);
        seen.add(workspaceId);
    };

    explicitOrder.forEach(appendWorkspaceId);
    workspaceIds.forEach(appendWorkspaceId);

    if (!nextOrder.length) nextOrder.push("default");

    return nextOrder;
};

const deriveWorkspaceNames = (data, workspaces) => {
    const explicitNames =
        data?.workspaceNames && typeof data.workspaceNames === "object"
            ? data.workspaceNames
            : {};

    const nextNames = {};
    Object.keys(workspaces || {}).forEach((workspaceId) => {
        if (workspaceId === "default") return;
        if (
            typeof explicitNames[workspaceId] === "string" &&
            explicitNames[workspaceId]
        ) {
            nextNames[workspaceId] = explicitNames[workspaceId];
        }
    });

    return nextNames;
};

export let currentWorkspace = "default";
export let isSwitching = false;
export const PROTECTED_IDS_KEY = "workspace_protected_ids";
export const sessionKeys = new Map();
export let protectedIds = [];

export let workspacesData = {
    workspaces: { default: [] },
    activeWorkspace: "default",
    workspaceVisuals: {},
};

export let workspaceOrder = ["default"];
export let workspaceNames = {};
export let managedBoardIds = new Set();

export const getLocalWorkspaceIds = () =>
    Object.keys(workspacesData.workspaces || {}).filter(
        (workspaceId) => !managedBoardIds.has(workspaceId),
    );

export const getLocalWorkspaceCount = () => getLocalWorkspaceIds().length;

export const ensureWorkspaceVisualSettings = (workspaceId) => {
    const id = workspaceId || "default";
    if (
        !workspacesData.workspaceVisuals ||
        typeof workspacesData.workspaceVisuals !== "object"
    ) {
        workspacesData.workspaceVisuals = {};
    }
    if (!workspacesData.workspaceVisuals[id]) {
        workspacesData.workspaceVisuals[id] =
            cloneDefaultWorkspaceVisualSettings();
    } else {
        workspacesData.workspaceVisuals[id] = normalizeWorkspaceVisualSettings(
            workspacesData.workspaceVisuals[id],
        );
    }
    return workspacesData.workspaceVisuals[id];
};

export const getWorkspaceVisualSettings = (workspaceId) =>
    ensureWorkspaceVisualSettings(workspaceId);

export const setWorkspaceVisualSettings = (workspaceId, settings) => {
    const id = workspaceId || "default";
    workspacesData.workspaceVisuals[id] =
        normalizeWorkspaceVisualSettings(settings);
    return workspacesData.workspaceVisuals[id];
};

export const updateWorkspaceVisualSettings = (workspaceId, patch) => {
    const current = getWorkspaceVisualSettings(workspaceId);
    return setWorkspaceVisualSettings(workspaceId, {
        ...current,
        ...(patch || {}),
    });
};

export const setWorkspaceVisualSetting = (workspaceId, key, value) => {
    const current = getWorkspaceVisualSettings(workspaceId);
    return setWorkspaceVisualSettings(workspaceId, {
        ...current,
        [key]: value,
    });
};

export const removeWorkspaceVisualSetting = (workspaceId, key) => {
    const current = { ...getWorkspaceVisualSettings(workspaceId) };
    delete current[key];
    return setWorkspaceVisualSettings(workspaceId, current);
};

const createWorkspaceVisualFieldProxy = (fieldName, fallbackValue = null) =>
    new Proxy(
        {},
        {
            get(_target, prop) {
                if (typeof prop !== "string" || prop === "toJSON")
                    return undefined;
                return (
                    getWorkspaceVisualSettings(prop)[fieldName] ?? fallbackValue
                );
            },
            set(_target, prop, value) {
                if (typeof prop !== "string" || prop === "toJSON") return true;
                setWorkspaceVisualSetting(prop, fieldName, value);
                return true;
            },
            deleteProperty(_target, prop) {
                if (typeof prop !== "string" || prop === "toJSON") return true;
                removeWorkspaceVisualSetting(prop, fieldName);
                return true;
            },
            ownKeys() {
                return Object.keys(workspacesData.workspaceVisuals || {});
            },
            has(_target, prop) {
                if (typeof prop !== "string" || prop === "toJSON") return false;
                return prop in (workspacesData.workspaceVisuals || {});
            },
            getOwnPropertyDescriptor() {
                return {
                    enumerable: true,
                    configurable: true,
                };
            },
        },
    );

const workspaceThemeView = createWorkspaceVisualFieldProxy(
    "theme",
    DEFAULT_WORKSPACE_VISUAL_SETTINGS.theme,
);
const workspaceSavedThemeView = createWorkspaceVisualFieldProxy(
    "savedThemeId",
    null,
);

const attachVisualStateViews = () => {
    workspacesData.workspaceStyles = workspaceThemeView;
    workspacesData.workspaceSavedThemes = workspaceSavedThemeView;
};

export const hydrateWorkspaceVisualsFromStoredMaps = (
    styles = {},
    savedThemes = {},
    legacyProThemes = {},
) => {
    const styleMap = styles && typeof styles === "object" ? styles : {};
    const savedThemeMap =
        savedThemes && typeof savedThemes === "object" ? savedThemes : {};
    const legacySavedThemeMap =
        legacyProThemes && typeof legacyProThemes === "object"
            ? legacyProThemes
            : {};

    Object.entries(styleMap).forEach(([workspaceId, theme]) => {
        if (workspaceId === "toJSON") return;
        if (typeof theme === "string" && theme) {
            setWorkspaceVisualSetting(workspaceId, "theme", theme);
        }
    });

    Object.entries(legacySavedThemeMap).forEach(
        ([workspaceId, savedThemeId]) => {
            if (workspaceId === "toJSON") return;
            if (typeof savedThemeId === "string" && savedThemeId) {
                setWorkspaceVisualSetting(
                    workspaceId,
                    "savedThemeId",
                    savedThemeId,
                );
            }
        },
    );

    Object.entries(savedThemeMap).forEach(([workspaceId, savedThemeId]) => {
        if (workspaceId === "toJSON") return;
        if (typeof savedThemeId === "string" && savedThemeId) {
            setWorkspaceVisualSetting(
                workspaceId,
                "savedThemeId",
                savedThemeId,
            );
        }
    });
};

attachVisualStateViews();
ensureWorkspaceVisualSettings("default");

export const getCurrentWorkspace = () => currentWorkspace;
export const getWorkspacesData = () => workspacesData;
export const setWorkspacesData = (data) => {
    const nextSyncedWorkspaces =
        data?.workspaces && typeof data.workspaces === "object"
            ? data.workspaces
            : { default: [] };
    const preservedManagedWorkspaces = {};
    const preservedManagedVisuals = {};

    for (const workspaceId of managedBoardIds) {
        if (workspacesData.workspaces?.[workspaceId] !== undefined) {
            preservedManagedWorkspaces[workspaceId] =
                workspacesData.workspaces[workspaceId];
        }
        if (workspacesData.workspaceVisuals?.[workspaceId]) {
            preservedManagedVisuals[workspaceId] =
                workspacesData.workspaceVisuals[workspaceId];
        }
    }

    const nextWorkspaces = {
        ...nextSyncedWorkspaces,
        ...preservedManagedWorkspaces,
    };
    const nextActiveWorkspace =
        typeof data?.activeWorkspace === "string" &&
        nextWorkspaces[data.activeWorkspace] !== undefined
            ? data.activeWorkspace
            : "default";

    workspacesData = {
        workspaces: nextWorkspaces,
        activeWorkspace: nextActiveWorkspace,
        workspaceVisuals: {
            ...normalizeWorkspaceVisualsMap(data?.workspaceVisuals),
            ...preservedManagedVisuals,
        },
    };
    attachVisualStateViews();
    hydrateWorkspaceVisualsFromStoredMaps(
        data?.workspaceStyles,
        data?.workspaceSavedThemes,
        data?.workspaceProThemes,
    );

    const nextOrder = deriveWorkspaceOrder(data, nextSyncedWorkspaces);
    for (const workspaceId of managedBoardIds) {
        if (!nextOrder.includes(workspaceId)) nextOrder.push(workspaceId);
    }
    setWorkspaceOrder(nextOrder);

    const nextNames = deriveWorkspaceNames(data, nextSyncedWorkspaces);
    for (const workspaceId of managedBoardIds) {
        if (workspaceNames[workspaceId]) {
            nextNames[workspaceId] = workspaceNames[workspaceId];
        }
    }
    setWorkspaceNames(nextNames);

    setCurrentWorkspace(nextActiveWorkspace);
    ensureWorkspaceVisualSettings("default");
};

export const setCurrentWorkspace = (id) => {
    currentWorkspace = id;
};
export const setIsSwitching = (value) => {
    isSwitching = value;
};
export const setProtectedIds = (ids) => {
    protectedIds = ids;
};
export const setWorkspaceOrder = (order) => {
    workspaceOrder = order;
};
export const setWorkspaceNames = (names) => {
    workspaceNames = names;
};
export const addManagedBoardId = (id) => managedBoardIds.add(id);
export const removeManagedBoardId = (id) => managedBoardIds.delete(id);
export const isManagedBoardId = (id) => managedBoardIds.has(id);
export const isReadOnlyManagedBoard = (id) => false; // web build: no managed boards

export const getWorkspaceGroups = (workspaceId) =>
    workspacesData.workspaces[workspaceId] || [];
export const setWorkspaceGroups = (workspaceId, groups) => {
    workspacesData.workspaces[workspaceId] = sanitizeWorkspaceGroups(groups);
};
