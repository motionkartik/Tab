import {
    getWorkspacesData,
    workspaceNames,
} from "./workspaces/workspace-state.js";

export const WEB_SEARCH_ENGINES = {
    google: "https://www.google.com/search?q=",
    duckduckgo: "https://duckduckgo.com/?q=",
    yahoo: "https://search.yahoo.com/search?p=",
};

export const SEARCH_RESULT_TYPE_META = {
    link: {
        label: "Link",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 263 380 319.5 380s148-56.5 204.5-112.3zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372.1 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>',
    },
    clipboard: {
        label: "Clipboard",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>',
    },
    launcher: {
        label: "Launcher",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>',
    },
    bookmark: {
        label: "Bookmark",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M0 48C0 21.5 21.5 0 48 0l288 0c26.5 0 48 21.5 48 48l0 440c0 9-5 17.2-13 21.3s-17.6 3.4-24.9-1.8L192 397.6 37.9 507.5c-7.3 5.2-16.9 5.9-24.9 1.8S0 497 0 488L0 48z"/></svg>',
    },
};

function stripUrlProtocol(value) {
    return String(value || "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

function hasOrderedBigram(str, term) {
    if (!str || !term || term.length < 2) return false;
    for (let i = 0; i < term.length - 1; i += 1) {
        if (str.includes(term.slice(i, i + 2))) return true;
    }
    return false;
}

function fuzzyScore(str, term, { stripProtocol = false } = {}) {
    if (!str) return 0;
    const s = (stripProtocol ? stripUrlProtocol(str) : str).toLowerCase();
    if (s === term) return 100;
    if (s.startsWith(term)) return 80;
    if (s.split(/[\s\-_./(]+/).some((w) => w.startsWith(term))) return 60;
    if (s.includes(term)) return 40;
    let ti = 0;
    for (let i = 0; i < s.length && ti < term.length; i++) {
        if (s[i] === term[ti]) ti++;
    }
    return ti === term.length && hasOrderedBigram(s, term) ? 20 : 0;
}

function getWorkspaceDisplayLabel(workspaceId) {
    if (!workspaceId) return "";
    if (workspaceId === "default") {
        return workspaceNames[workspaceId] || "Start";
    }
    return workspaceNames[workspaceId] || workspaceId.replace(/-/g, " ");
}

function normalizeWorkspaceEntryType(rawType) {
    if (
        rawType === "clipboard" ||
        rawType === "clipboard-button" ||
        rawType === "launcher" ||
        rawType === "launcher-button"
    ) {
        return rawType.replace("-button", "");
    }

    if (rawType === "bookmark") return "bookmark";
    return "link";
}

function scoreSearchEntry(entry, term) {
    const secondaryText =
        entry.resultType === "clipboard"
            ? entry.content || ""
            : entry.resultType === "launcher"
              ? entry.target || ""
              : entry.url || "";

    return (
        fuzzyScore(entry.name, term) * 10 +
        fuzzyScore(secondaryText, term, { stripProtocol: true })
    );
}

function buildWorkspaceResult(rawEntry, workspaceId, rawType, groupName) {
    const resultType = normalizeWorkspaceEntryType(rawType || rawEntry?.type);
    const workspaceLabel = getWorkspaceDisplayLabel(workspaceId);
    const base = {
        source: "workspace",
        resultType,
        workspaceId,
        workspaceLabel,
        group: groupName || "",
        name:
            rawEntry?.name ||
            rawEntry?.url ||
            rawEntry?.target ||
            rawEntry?.content ||
            "",
        icon: rawEntry?.icon || "",
        iconColor: rawEntry?.iconColor || "",
        targetOverride: rawEntry?.targetOverride || "",
        url: rawEntry?.url || "",
        content: rawEntry?.content || "",
        target: rawEntry?.target || "",
        launcherKind: rawEntry?.launcherKind || "app",
        visible: !!rawEntry?.visible,
        description: rawEntry?.description || "",
        style:
            rawEntry?.style && typeof rawEntry.style === "object"
                ? { ...rawEntry.style }
                : undefined,
    };

    return {
        ...base,
        subtitle:
            resultType === "clipboard"
                ? base.content
                : resultType === "launcher"
                  ? base.target
                  : stripUrlProtocol(base.url),
        // Saved links never offer "+ add to group" — they're already on the
        // board and the button reads as nonsense there. The affordance is for
        // bookmark results (importing a Chrome bookmark onto the board).
        canAddToGroup: false,
    };
}

function collectWorkspaceResults(term) {
    const allWorkspaces = getWorkspacesData().workspaces || {};
    const workspaceIds = Object.keys(allWorkspaces);
    const matches = [];

    workspaceIds.forEach((workspaceId) => {
        (allWorkspaces[workspaceId] || []).forEach((group) => {
            if (
                ["link-button", "clipboard-button", "launcher-button"].includes(
                    group?.type,
                )
            ) {
                const result = buildWorkspaceResult(
                    group,
                    workspaceId,
                    group.type,
                    "Shortcut",
                );
                const score = scoreSearchEntry(result, term);
                if (score > 0) matches.push({ ...result, score });
                return;
            }

            (group.items || [])
                .filter((item) =>
                    [undefined, "link", "clipboard", "launcher"].includes(
                        item?.type,
                    ),
                )
                .forEach((item) => {
                    const result = buildWorkspaceResult(
                        item,
                        workspaceId,
                        item.type,
                        group.name,
                    );
                    const score = scoreSearchEntry(result, term);
                    if (score > 0) matches.push({ ...result, score });
                });
        });
    });

    return {
        results: matches,
        workspaceIds,
    };
}

// Normalize a URL for dedup matching: drop protocol, a leading "www.", and any
// trailing slashes, so www.youtube.com, youtube.com and www.youtube.com/ all
// collapse to one row.
function normalizeUrlForDedup(value) {
    return String(value || "")
        .trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/+$/, "");
}

function getResultDedupKey(result) {
    if (!result || typeof result !== "object") return "";

    if (result.resultType === "clipboard") {
        return `clipboard:${result.content || result.name || ""}`;
    }

    if (result.resultType === "launcher") {
        return `launcher:${result.launcherKind || "app"}:${result.target || result.name || ""}:${result.visible ? "1" : "0"}`;
    }

    return `link:${normalizeUrlForDedup(result.url || result.name)}`;
}

function dedupeSearchResults(results) {
    // Collapse the same item across workspaces into one row, but keep every
    // workspace it appears in so the row can show a pill per workspace. The
    // first (highest-scored) occurrence wins for all other fields incl. group.
    const byKey = new Map();
    const order = [];

    results.forEach((result) => {
        const key = getResultDedupKey(result);
        if (!key) return;
        if (!byKey.has(key)) {
            byKey.set(key, { ...result, workspaces: [] });
            order.push(key);
        }
        const merged = byKey.get(key);
        if (
            result.workspaceLabel &&
            !merged.workspaces.includes(result.workspaceLabel)
        ) {
            merged.workspaces.push(result.workspaceLabel);
        }
    });

    return order.map((key) => byKey.get(key));
}

// Web build: no browser-bookmarks API exists — saved links live in the
// dashboard itself and are searched by the local index. Bookmark results come
// from imported bookmark files (see bookmark-import.js).
function searchBookmarks(term) {
    return Promise.resolve([]);
}

export function getSearchResultTypeMeta(resultType) {
    return (
        SEARCH_RESULT_TYPE_META[normalizeWorkspaceEntryType(resultType)] ||
        SEARCH_RESULT_TYPE_META.link
    );
}

export function getWebSearchUrl(
    query,
    engine = window.webSearchEngine || "google",
) {
    const base = WEB_SEARCH_ENGINES[engine] || WEB_SEARCH_ENGINES.google;
    return base + encodeURIComponent(String(query || "").trim());
}

// Runs a web search for `query`. Web build: navigate directly to the
// configured engine's search URL (there is no browser Search API on a plain
// website). The "browser" engine choice maps to Google.
export async function performWebSearch(query, { newTab = false } = {}) {
    const text = String(query || "").trim();
    if (!text) return;

    const engine = window.webSearchEngine || "browser";
    const resolved =
        engine !== "browser" && WEB_SEARCH_ENGINES[engine] ? engine : "google";
    window.open(getWebSearchUrl(text, resolved), newTab ? "_blank" : "_self");
}

export async function getSearchResults(
    rawTerm,
    { limit = 8, includeBookmarks = true } = {},
) {
    const term = String(rawTerm || "")
        .toLowerCase()
        .trim();
    if (!term) {
        return {
            results: [],
            workspaceIds: [],
        };
    }

    const { results: workspaceResults, workspaceIds } =
        collectWorkspaceResults(term);
    const bookmarkResults = includeBookmarks ? await searchBookmarks(term) : [];

    const scoredBookmarks = bookmarkResults
        .map((result) => ({
            ...result,
            score: scoreSearchEntry(result, term),
        }))
        .filter((result) => result.score > 0);

    const results = dedupeSearchResults(
        [...workspaceResults, ...scoredBookmarks].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.source === b.source) return 0;
            return a.source === "workspace" ? -1 : 1;
        }),
    )
        .slice(0, limit)
        .map((result) => ({
            ...result,
            typeLabel: getSearchResultTypeMeta(result.resultType).label,
        }));

    return {
        results,
        workspaceIds,
    };
}
