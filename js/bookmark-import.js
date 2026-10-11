import { t, applyI18nToDom } from "./i18n.js";
import { readBookmarkTree, bookmarkFavicon, parseBookmarkFile } from "./bookmark-import-model.js";
import { currentWorkspace, workspaceOrder, workspaceNames, getLocalWorkspaceIds, protectedIds, sessionKeys } from "./workspaces/workspace-state.js";
import { importBookmarkGroups, compactAddedGroups } from "./workspaces/workspace-grid-sync.js";
import { switchWorkspace } from "./workspaces/workspace-actions.js";
import { showToast } from "./undo-manager.js";

const el = id => document.getElementById(id);
const node = (tag, className, text) => {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
};
const button = (text, action, className = "") => {
    const result = node("button", className, text);
    result.type = "button";
    result.addEventListener("click", action);
    return result;
};

// Paths and proportions from the supplied bookmark modal design.
const ICON_PATHS = {
    chevron: "M9 6l6 6-6 6",
    previous: "M15 6l-6 6 6 6",
    folder: "M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z",
    bookmark: "M6 3h12v18l-6-4.5L6 21z",
    close: "M6 6l12 12M18 6L6 18",
};
function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS(svg.namespaceURI, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", `bmi-svg bmi-svg-${name}`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    path.setAttribute("d", ICON_PATHS[name]);
    svg.append(path);
    return svg;
}

function selectLinks(state, links, selected) {
    const affected = new Set(links.map(link => link.id));
    // A group is assigned when it first enters the preview. Adding more links
    // to an existing group must preserve a destination the user already chose.
    if (selected) {
        for (const folder of state.model.folders) {
            if (folder.links.some(link => affected.has(link.id)) &&
                !folder.links.some(link => state.selected.has(link.id))) {
                state.destination.set(folder.id, state.tab);
            }
        }
    }
    for (const id of affected) {
        if (selected) state.selected.add(id); else state.selected.delete(id);
    }
    for (const folder of state.model.folders) {
        if (!folder.links.some(link => state.selected.has(link.id))) state.destination.delete(folder.id);
    }
}
let active = null;

export async function openBookmarkImport({ offerUndo = false } = {}) {
    const dialog = el("bookmark-import-dialog");
    if (dialog.open) return;
    const localIds = getLocalWorkspaceIds().filter(id => !protectedIds.includes(id) || sessionKeys.has(id));
    const ids = [...new Set([...workspaceOrder, ...localIds])].filter(id => localIds.includes(id));
    const state = {
        offerUndo, selected: new Set(), expanded: new Set(), destination: new Map(),
        model: { folders: [], roots: [], skipped: 0 }, order: [],
        ids, tab: ids.includes(currentWorkspace) ? currentWorkspace : ids[0],
        busy: false, loaded: false, previousFocus: document.activeElement,
    };
    active = state;
    applyI18nToDom(dialog);
    el("bmi-close").replaceChildren(icon("close"));
    el("bmi-message").textContent = "";
    el("bmi-tree").textContent = t("bmi_loading");
    const abort = new AbortController();
    const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: abort.signal });
    const close = () => { if (!state.busy) dialog.close(); };
    listen(el("bmi-close"), "click", close);
    listen(el("bmi-cancel"), "click", close);
    listen(dialog, "cancel", event => { if (state.busy) event.preventDefault(); });
    listen(dialog, "keydown", event => {
        // Keep Escape and navigation inside this top-layer dialog.
        event.stopPropagation();
    });
    listen(dialog, "click", event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    });
    listen(dialog, "close", () => {
        abort.abort();
        if (active === state) active = null;
        if (state.previousFocus?.isConnected) state.previousFocus.focus();
    });
    listen(el("bmi-select-all"), "click", () => {
        selectLinks(state, state.model.folders.flatMap(folder => folder.links), true);
        renderTree(state); renderPreview(state);
    });
    listen(el("bmi-clear"), "click", () => { state.selected.clear(); state.destination.clear(); renderTree(state); renderPreview(state); });
    listen(el("bmi-import"), "click", () => commit(state));
    renderPreview(state);
    dialog.showModal();
    el("bmi-close").focus();
    wireFileInput(state);
}

function wireFileInput(state) {
    const input = el("bmi-file");
    if (!input || input.dataset.bmiBound) return;
    input.dataset.bmiBound = "1";
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file || active !== state) return;
        el("bmi-tree").textContent = t("bmi_loading");
        el("bmi-message").textContent = "";
        try {
            const html = await file.text();
            const tree = parseBookmarkFile(html, { untitled: t("dth10_untitled") });
            if (active !== state) return;
            state.model = readBookmarkTree(tree, { looseName: t("bmi_quick_links"), untitled: t("dth10_untitled") });
            state.order = state.model.folders.map(f => f.id);
            state.loaded = true;
            renderTree(state); renderPreview(state);
            if (state.model.skipped) el("bmi-message").textContent = t("bmi_skipped", [String(state.model.skipped)]);
            if (!state.ids.length) el("bmi-message").textContent = t("bmi_no_destination");
        } catch {
            if (active !== state) return;
            el("bmi-tree").textContent = t("bmi_read_failed");
            el("bmi-message").textContent = t("bmi_read_retry");
        }
    });
    // Prompt for a file as soon as the dialog opens.
    el("bmi-tree").textContent = t("bmi_choose_file_hint");
}

function renderTree(state) {
    const tree = el("bmi-tree");
    const focused = document.activeElement?.dataset?.focusKey;
    tree.replaceChildren();
    if (!state.model.folders.some(f => f.links.length)) {
        tree.textContent = t("bmi_empty");
        return;
    }
    const appendFolder = (folder, depth) => {
        const row = node("div", "bmi-tree-row");
        row.style.paddingInlineStart = `${12 + depth * 20}px`;
        row.dataset.folderId = folder.id;
        const expanded = state.expanded.has(folder.id);
        const expand = button("", () => {
            if (expanded) state.expanded.delete(folder.id); else state.expanded.add(folder.id);
            renderTree(state);
        }, "bmi-expand");
        expand.append(icon("chevron"));
        expand.setAttribute("aria-label", t(expanded ? "bmi_collapse" : "bmi_expand", [folder.name]));
        expand.setAttribute("aria-expanded", String(expanded));
        expand.dataset.focusKey = `expand-${folder.id}`;
        const label = node("label", "bmi-tree-label");
        const checkbox = node("input", ""); checkbox.type = "checkbox";
        checkbox.dataset.focusKey = `folder-${folder.id}`;
        const count = folder.allLinks.filter(l => state.selected.has(l.id)).length;
        checkbox.checked = count > 0 && count === folder.allLinks.length;
        checkbox.indeterminate = count > 0 && count < folder.allLinks.length;
        checkbox.disabled = !folder.allLinks.length;
        checkbox.addEventListener("change", () => {
            selectLinks(state, folder.allLinks, checkbox.checked);
            renderTree(state); renderPreview(state);
        });
        label.append(checkbox, icon(folder.id === "__loose__" ? "bookmark" : "folder"), node("span", "bmi-tree-name", folder.name));
        row.append(expand, label, node("span", "bmi-count", count ? `${count}/${folder.allLinks.length}` : String(folder.allLinks.length)));
        tree.append(row);
        if (!expanded) return;
        for (const child of folder.children) appendFolder(child, depth + 1);
        for (const link of folder.links) {
            const label = node("label", "bmi-tree-row bmi-link-row");
            label.style.paddingInlineStart = `${42 + depth * 20}px`;
            const checkbox = node("input", ""); checkbox.type = "checkbox";
            checkbox.dataset.focusKey = `link-${link.id}`;
            checkbox.checked = state.selected.has(link.id);
            checkbox.addEventListener("change", () => {
                selectLinks(state, [link], checkbox.checked);
                renderTree(state); renderPreview(state);
            });
            label.title = link.url;
            label.append(checkbox, favicon(link), node("span", "bmi-tree-name", link.name));
            tree.append(label);
        }
    };
    for (const folder of state.model.roots) appendFolder(folder, 0);
    if (focused) [...tree.querySelectorAll("[data-focus-key]")].find(e => e.dataset.focusKey === focused)?.focus();
}

function favicon(link) {
    const wrap = node("span", "bmi-favicon", link.name.slice(0, 1).toUpperCase());
    wrap.title = link.name;
    const src = window.autoFaviconEnabled !== false && bookmarkFavicon(link.url);
    if (src) {
        const img = node("img", ""); img.src = src; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => img.remove(), { once: true });
        wrap.append(img);
    }
    return wrap;
}

function chosen(state) {
    const byId = new Map(state.model.folders.map(f => [f.id, f]));
    return state.order.map(id => byId.get(id)).filter(f => f.links.some(l => state.selected.has(l.id)));
}

function workspaceName(id) {
    const tab = [...document.querySelectorAll(".workspace-tab[data-workspace]")].find(tab => tab.dataset.workspace === id);
    return workspaceNames[id] || tab?.querySelector(".workspace-name")?.textContent || (id === "default" ? t("hdr_workspace_default_tab") : id.replaceAll("-", " "));
}

function renderPreview(state) {
    const groups = chosen(state);
    const tabs = el("bmi-tabs"); tabs.replaceChildren();
    for (const id of state.ids) {
        const tab = button(workspaceName(id), () => { state.tab = id; renderPreview(state); el(`bmi-tab-${state.ids.indexOf(id)}`).focus(); }, "bmi-tab");
        tab.id = `bmi-tab-${state.ids.indexOf(id)}`;
        tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(id === state.tab));
        tab.setAttribute("aria-controls", "bmi-cards"); tab.tabIndex = id === state.tab ? 0 : -1;
        tab.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = state.ids.indexOf(id);
            state.tab = state.ids[event.key === "Home" ? 0 : event.key === "End" ? state.ids.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + state.ids.length) % state.ids.length];
            renderPreview(state); el(`bmi-tab-${state.ids.indexOf(state.tab)}`).focus();
        });
        tab.append(node("span", "bmi-tab-count", String(groups.filter(f => state.destination.get(f.id) === id).length)));
        tabs.append(tab);
    }
    const cards = el("bmi-cards"); cards.replaceChildren();
    if (state.ids.length) cards.setAttribute("aria-labelledby", `bmi-tab-${state.ids.indexOf(state.tab)}`);
    const visible = groups.filter(f => state.destination.get(f.id) === state.tab);
    if (!visible.length) cards.append(node("p", "bmi-preview-empty", t("bmi_preview_empty")));
    for (const [index, folder] of visible.entries()) {
        const links = folder.links.filter(l => state.selected.has(l.id));
        const card = node("article", "bmi-card"); card.dataset.folderId = folder.id;
        const header = node("div", "bmi-card-header");
        header.append(node("h3", "", folder.name));
        for (const [direction, label] of [[-1, "bmi_earlier"], [1, "bmi_later"]]) {
            const move = button("", () => {
                const a = state.order.indexOf(folder.id), b = state.order.indexOf(visible[index + direction].id);
                [state.order[a], state.order[b]] = [state.order[b], state.order[a]];
                renderPreview(state);
                [...cards.querySelectorAll("article")].find(c => c.dataset.folderId === folder.id)?.querySelector("button:not(:disabled)")?.focus();
            }, "bmi-icon-button");
            move.append(icon(direction < 0 ? "previous" : "chevron"));
            move.disabled = !visible[index + direction];
            move.setAttribute("aria-label", t(label, [folder.name])); header.append(move);
        }
        const icons = node("div", "bmi-card-icons");
        links.slice(0, 5).forEach(link => icons.append(favicon(link)));
        if (links.length > 5) icons.append(node("span", "bmi-more", `+${links.length - 5}`));
        const footer = node("div", "bmi-card-footer");
        footer.append(node("span", "", t("bmi_links", [String(links.length)])));
        const select = node("select", "bmi-destination");
        select.setAttribute("aria-label", t("bmi_destination", [folder.name]));
        for (const id of state.ids) { const option = node("option", "", workspaceName(id)); option.value = id; select.append(option); }
        select.value = state.destination.get(folder.id);
        select.disabled = state.ids.length < 2;
        select.addEventListener("change", () => { state.destination.set(folder.id, select.value); renderPreview(state); el(`bmi-tab-${state.ids.indexOf(state.tab)}`).focus(); });
        footer.append(select); card.append(header, icons, footer); cards.append(card);
    }
    const used = new Set(groups.map(f => state.destination.get(f.id)));
    el("bmi-summary").textContent = t("bmi_summary", [String(groups.length), String(used.size), String(state.selected.size)]);
    el("bmi-import").disabled = state.busy || !state.ids.length || !groups.length;
    for (const id of ["bmi-select-all", "bmi-clear"]) el(id).disabled = !state.loaded || state.busy;
}

async function commit(state) {
    if (state.busy || !state.selected.size || !state.ids.length) return;
    state.busy = true;
    const dialog = el("bookmark-import-dialog");
    dialog.setAttribute("aria-busy", "true");
    for (const control of dialog.querySelectorAll("button, input, select")) control.disabled = true;
    el("bmi-message").textContent = t("bmi_importing");
    const groups = chosen(state);
    let imported;
    try {
        imported = await importBookmarkGroups(groups.map(folder => ({
            workspaceId: state.destination.get(folder.id), name: folder.name,
            items: folder.links.filter(l => state.selected.has(l.id)).map(link => ({
                type: "link", name: link.name, url: link.url,
                icon: window.autoFaviconEnabled !== false ? bookmarkFavicon(link.url) : "",
            })),
        })));
    } catch {
        state.busy = false; dialog.removeAttribute("aria-busy");
        el("bmi-close").disabled = false; el("bmi-cancel").disabled = false;
        renderTree(state); renderPreview(state);
        el("bmi-message").textContent = t("bmi_save_failed");
        return;
    }
    // Content is already committed. A layout failure must never offer a retry
    // that would import the same bookmarks a second time.
    try {
        await compactAddedGroups(imported);
    } catch {
        showToast(t("bmi_layout_failed"), true, { durationMs: 6000 });
    }
    state.busy = false; dialog.removeAttribute("aria-busy");
    el("bmi-close").disabled = false; el("bmi-cancel").disabled = false;
    dialog.close();
    el("settings-modal")?.classList.remove("active");
    const destination = groups.some(f => state.destination.get(f.id) === state.tab) ? state.tab : state.destination.get(groups[0].id);
    await switchWorkspace(destination);
    const label = t("bmi_done", [String(state.selected.size), String(groups.length)]);
    if (state.offerUndo) {
        const { showStartScreenUndo } = await import("./start-screen.js");
        showStartScreenUndo(label, imported);
    } else showToast(label);
}
