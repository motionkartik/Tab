import {
    openAddItemModal,
    addLinkItemsToGroup,
} from "./group-widget-renderer.js";
import { t } from "../i18n.js";
import { parseBookmarkFile } from "../bookmark-import-model.js";
import { remoteFaviconsAllowed } from "../favicon.js";

const ICONS = {
    bookmark:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M0 48C0 21.5 21.5 0 48 0l0 48 0 393.4 130.1-92.9c8.3-6 19.6-6 27.9 0L336 441.4 336 48 48 48 48 0 336 0c26.5 0 48 21.5 48 48l0 440c0 9-5 17.2-13 21.3s-17.6 3.4-24.9-1.8L192 397.6 37.9 507.5c-7.3 5.2-16.9 5.9-24.9 1.8S0 497 0 488L0 48z"/></svg>',
    link:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 263 380 319.5 380s148-56.5 204.5-112.3zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372.1 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>',
    clipboard:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>',
    launcher:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>',
};

const hasBookmarksApi = () => true; // web build: file-based import, always available

const buildAddButton = (group, type, label, icon) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("empty-group-add-btn");
    btn.title = label;
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener("click", (event) => {
        event.stopPropagation();
        openAddItemModal(group, type);
    });
    return btn;
};

const closeBookmarksDialog = (backdrop, onKeydown) => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
};

// Mirror the automated add paths (context menu / spotlight): build a Google
// faviconV2 URL for a link's hostname. Returns "" for unparseable/non-web URLs.
const buildFaviconUrl = (url) => {
    if (!remoteFaviconsAllowed()) return "";
    try {
        const domain = new URL(url).hostname;
        if (!domain) return "";
        return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
    } catch {
        return "";
    }
};

const openBookmarksImportDialog = (group) => {
    const backdrop = document.createElement("div");
    backdrop.classList.add("eg-bm-backdrop");

    const card = document.createElement("div");
    card.classList.add("eg-bm-card");

    const title = document.createElement("h3");
    title.classList.add("eg-bm-title");
    title.textContent = t("ega3_import_bm");

    const sub = document.createElement("p");
    sub.classList.add("eg-bm-sub");
    sub.append(
        document.createTextNode(t("ega3_import_desc_prefix")),
    );
    const groupNameEl = document.createElement("strong");
    groupNameEl.textContent = group.name;
    sub.append(groupNameEl, document.createTextNode("."));

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".html,.htm,text/html";
    fileInput.classList.add("eg-bm-file");

    const select = document.createElement("select");
    select.classList.add("eg-bm-select");
    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = t("ega3_choose_file_hint");
    select.appendChild(loadingOption);
    select.disabled = true;

    const actions = document.createElement("div");
    actions.classList.add("eg-bm-actions");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.classList.add("eg-bm-cancel");
    cancelBtn.textContent = t("ega3_cancel");

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.classList.add("eg-bm-import");
    importBtn.textContent = t("ega3_import");
    importBtn.disabled = true;

    actions.append(cancelBtn, importBtn);
    card.append(title, sub, fileInput, select, actions);
    backdrop.append(card);
    document.body.appendChild(backdrop);

    const onKeydown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeBookmarksDialog(backdrop, onKeydown);
        }
    };
    document.addEventListener("keydown", onKeydown);

    backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
            closeBookmarksDialog(backdrop, onKeydown);
        }
    });
    cancelBtn.addEventListener("click", () =>
        closeBookmarksDialog(backdrop, onKeydown),
    );

    select.addEventListener("change", () => {
        importBtn.disabled = !select.value;
    });

    // Web build: folders come from a bookmark HTML file the user picks.
    let parsedTree = [];
    const findFolder = (nodes, id) => {
        for (const node of nodes || []) {
            if (node.id === id) return node;
            const found = findFolder(node.children, id);
            if (found) return found;
        }
        return null;
    };
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        loadingOption.textContent = t("ega3_loading_folders");
        select.disabled = true;
        try {
            const html = await file.text();
            const tree = parseBookmarkFile(html, { untitled: t("ega3_untitled") });
            parsedTree = tree[0]?.children || [];
        } catch {
            loadingOption.textContent = t("ega3_load_error");
            return;
        }

        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = t("ega3_select_folder");
        select.appendChild(placeholder);

        const addFolder = (nodes, depth) => {
            if (depth > 10) return;
            nodes.forEach((node) => {
                if (node.url) return;
                if (depth > 0) {
                    const option = document.createElement("option");
                    option.value = node.id;
                    option.textContent = `${"— ".repeat(depth - 1)}${node.title || t("ega3_untitled")}`;
                    select.appendChild(option);
                }
                if (Array.isArray(node.children))
                    addFolder(node.children, depth + 1);
            });
        };
        addFolder(parsedTree, 0);
        select.disabled = false;
    });

    importBtn.addEventListener("click", () => {
        const folderId = select.value;
        if (!folderId) return;

        importBtn.disabled = true;
        importBtn.textContent = t("ega3_importing");

        {
            const folder = findFolder(parsedTree, folderId);
            const bookmarkItems = folder?.children || [];
            // Auto-favicon defaults on; honor the workspace's current setting.
            const autoFavicon = window.autoFaviconEnabled !== false;
            const links = (bookmarkItems || [])
                .filter((bookmark) => !!bookmark.url)
                .map((bookmark) => ({
                    name: bookmark.title || bookmark.url,
                    url: bookmark.url,
                    icon: autoFavicon ? buildFaviconUrl(bookmark.url) : "",
                    type: "link",
                }));

            if (links.length === 0) {
                importBtn.textContent = t("ega3_import");
                importBtn.disabled = false;
                alert(t("ega3_folder_empty"));
                return;
            }

            addLinkItemsToGroup(group.name, links);
            closeBookmarksDialog(backdrop, onKeydown);
        }
    });
};

/**
 * Render the call-to-action buttons shown inside an empty standard group:
 * import-from-bookmarks (outlined), plus add link / clipboard / launcher.
 * Only used for editable, non-todo groups that currently have no items.
 */
export const renderEmptyGroupActions = (itemsContainer, group) => {
    const wrap = document.createElement("div");
    wrap.classList.add("empty-group-actions");

    if (hasBookmarksApi()) {
        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.classList.add("empty-group-import-btn");
        importBtn.title = t("ega3_import_bm");
        importBtn.innerHTML = `${ICONS.bookmark}<span>${t("ega3_import_bm")}</span>`;
        importBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            openBookmarksImportDialog(group);
        });
        wrap.appendChild(importBtn);
    }

    const row = document.createElement("div");
    row.classList.add("empty-group-add-row");
    row.append(buildAddButton(group, "link", t("ega3_add_link"), ICONS.link));
    row.append(
        buildAddButton(group, "clipboard", t("ega3_add_clipboard"), ICONS.clipboard),
    );
    row.append(
        buildAddButton(group, "launcher", t("ega3_add_launcher"), ICONS.launcher),
    );
    wrap.appendChild(row);

    // Flag the container so CSS lays it out as a column and orders the CTA
    // wrap last — a link dragged in then previews/lands above the buttons
    // (first position) rather than below them. Cleared in grid-renderer onAdd.
    itemsContainer.classList.add("has-empty-actions");
    itemsContainer.appendChild(wrap);
};
