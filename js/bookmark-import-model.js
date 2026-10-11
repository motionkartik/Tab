import { sanitizeLinkUrl } from "./untrusted-input.js";

/** Browser roots are containers; their loose links form one Quick links group.
 * Each user folder owns only its direct links. Descendants remain separate groups.
 */
export function readBookmarkTree(tree, { looseName, untitled }) {
    const folders = [];
    const roots = [];
    let skipped = 0;
    const links = nodes => nodes.filter(n => typeof n.url === "string").flatMap(n => {
        const url = sanitizeLinkUrl(n.url);
        if (!url) { skipped++; return []; }
        return [{ id: String(n.id), name: n.title || url, url }];
    });
    const visit = (node, parent = null) => {
        const children = node.children || [];
        const folder = { id: String(node.id), name: node.title || untitled, parent, links: links(children), children: [] };
        folders.push(folder);
        for (const child of children) if (!child.url) folder.children.push(visit(child, folder.id));
        folder.allLinks = [...folder.links, ...folder.children.flatMap(c => c.allLinks)];
        return folder;
    };
    const containers = tree.flatMap(root => root.children || []);
    const loose = { id: "__loose__", name: looseName, parent: null, links: links(containers), children: [] };
    for (const container of containers) {
        if (container.url) continue;
        loose.links.push(...links(container.children || []));
        for (const node of container.children || []) if (!node.url) roots.push(visit(node));
    }
    loose.allLinks = loose.links;
    if (loose.links.length) { folders.unshift(loose); roots.unshift(loose); }
    return { folders, roots, skipped };
}

import { remoteFaviconsAllowed } from "./favicon.js";

export function bookmarkFavicon(url) {
    if (!remoteFaviconsAllowed()) return "";
    try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) return "";
        return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${parsed.hostname}&size=32`;
    } catch { return ""; }
}

/**
 * Parse a Netscape bookmark HTML export (the format every browser produces
 * via its bookmark manager's "Export bookmarks" action) into the same
 * `{ id, title, url?, children? }` node shape `readBookmarkTree` consumes.
 * Returns a single-root tree: `[{ children: [...] }]`.
 */
export function parseBookmarkFile(html, { untitled = "Untitled" } = {}) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    let nextId = 0;
    const nid = () => `file-${++nextId} — ${Date.now().toString(36)}`;
    const textOf = (el) => (el?.textContent || "").trim();

    const walkDl = (dl) => {
        const out = [];
        for (const child of dl.children || []) {
            if (child.tagName === "DL") {
                // Bare nested list (after a `<p>` separator some exporters emit).
                out.push(...walkDl(child));
                continue;
            }
            if (child.tagName !== "DT") continue;
            const h3 = child.querySelector(":scope > H3");
            const anchor = child.querySelector(":scope > A");
            const sub = child.querySelector(":scope > DL");
            if (h3) {
                out.push({
                    id: nid(),
                    title: textOf(h3) || untitled,
                    children: sub ? walkDl(sub) : [],
                });
            } else if (anchor) {
                out.push({
                    id: nid(),
                    title: textOf(anchor) || anchor.getAttribute("HREF") || untitled,
                    url: anchor.getAttribute("HREF") || "",
                });
                if (sub) out.push(...walkDl(sub));
            } else if (sub) {
                out.push(...walkDl(sub));
            }
        }
        return out;
    };

    const rootDl = doc.querySelector("DL");
    return [{ children: rootDl ? walkDl(rootDl) : [] }];
}
