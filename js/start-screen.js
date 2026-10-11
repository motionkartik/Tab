import { t } from "./i18n.js";
import { bookmarkFavicon } from "./bookmark-import-model.js";
import { currentWorkspace, getLocalWorkspaceIds, getWorkspaceGroups, isManagedBoardId, isReadOnlyManagedBoard } from "./workspaces/workspace-state.js";
import { addStartScreenContent, compactAddedGroups, undoStartScreenContent } from "./workspaces/workspace-grid-sync.js";
import { showToast, showUndoToast } from "./undo-manager.js";

const sites = [
    ["Google", "https://google.com"], ["YouTube", "https://youtube.com"],
    ["Facebook", "https://facebook.com"], ["Instagram", "https://instagram.com"],
    ["ChatGPT", "https://chatgpt.com"], ["Reddit", "https://reddit.com"],
    ["Wikipedia", "https://wikipedia.org"], ["X", "https://x.com"],
    ["WhatsApp", "https://whatsapp.com"], ["TikTok", "https://tiktok.com"],
    ["Yahoo", "https://yahoo.com"], ["Amazon", "https://amazon.com"],
    ["DuckDuckGo", "https://duckduckgo.com"], ["Bing", "https://bing.com"],
    ["LinkedIn", "https://linkedin.com"], ["Weather", "https://weather.com"],
    ["Discord", "https://discord.com"], ["Gmail", "https://mail.google.com"],
].map(([name, url]) => ({ name, url }));
const el = id => document.getElementById(id);
const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};
let initialized = false, busy = false, workspaceId = null;
let selected = new Map(), destinations = [], destination = 0;
const destinationColor = index => ["var(--accent-color, #506fb8)", "#14836b", "#8b5ab5", "#a86a27"][index % 4];

export function showStartScreenUndo(label, created) {
    showUndoToast(label, async () => {
        try { await undoStartScreenContent(created); }
        catch { showToast(t("start_undo_failed"), true); }
    }, { durationMs: 10000, singletonKey: "start-screen", actionLabel: t("start_undo") });
}

function showPicker(open, focus = false) {
    el("start-choices").hidden = open;
    el("start-picker").hidden = !open;
    if (!open) closeGroupForm();
    if (open) renderPicker();
    if (focus) el(open ? "start-picker-title" : "empty-start-suggestions-btn").focus();
}

function closeGroupForm() {
    el("start-new-group-form").hidden = true;
    el("start-new-group-form").reset();
    el("start-group-name").setCustomValidity("");
}

async function refreshBookmarks() {
    // Web build: no browser-bookmarks API — the card opens the bookmark-file
    // import dialog instead of auto-detecting anything.
    const status = el("start-bookmark-status"), button = el("empty-import-bookmarks-btn");
    if (!status || !button) return;
    status.removeAttribute("data-i18n");
    status.textContent = t("bmi_choose_file_hint");
    button.removeAttribute("data-i18n");
    button.textContent = t("start_choose");
    button.disabled = busy || isManagedBoardId(currentWorkspace);
    for (const [id, recommended] of [["start-bookmarks-card", false], ["start-sites-card", true]]) {
        el(id)?.classList.toggle("is-recommended", recommended);
        const badge = el(id)?.querySelector(".start-recommended");
        if (badge) badge.hidden = !recommended;
    }
}

function refreshWorkspace() {
    if (workspaceId !== currentWorkspace) {
        workspaceId = currentWorkspace;
        selected = new Map();
        destinations = [t("start_shortcuts"), t("start_favorites")];
        destination = 0;
        showPicker(false);
    }
    const returning = isManagedBoardId(currentWorkspace) || getLocalWorkspaceIds().some(id => id !== currentWorkspace && getWorkspaceGroups(id)?.length);
    el("empty-workspace-message").classList.toggle("start-returning", returning);
    // An empty read-only managed board has no local setup actions.
    el("empty-workspace-message").classList.toggle("start-managed", isReadOnlyManagedBoard(currentWorkspace));
    el("start-title").removeAttribute("data-i18n");
    el("start-title").textContent = t(isReadOnlyManagedBoard(currentWorkspace) ? "hdr_empty_title" : returning ? "start_workspace_title" : "start_title");
    el("start-picker-eyebrow").textContent = el("start-title").textContent;
    if (el("empty-workspace-message").style.display !== "none") void refreshBookmarks();
}

function renderPicker() {
    const chips = el("start-destinations");
    const focused = document.activeElement?.dataset.startFocus;
    chips.replaceChildren();
    destinations.forEach((name, index) => {
        const count = [...selected.values()].filter(value => value === index).length;
        const chip = node("button", "start-destination");
        chip.style.setProperty("--start-destination-color", destinationColor(index));
        const dot = node("span", "start-destination-dot");
        dot.setAttribute("aria-hidden", "true");
        chip.append(dot, node("span", "", name), node("span", "start-destination-count", String(count)));
        chip.type = "button";
        chip.dataset.startFocus = `destination-${index}`;
        chip.setAttribute("aria-pressed", String(destination === index));
        chip.addEventListener("click", () => { destination = index; renderPicker(); });
        chips.append(chip);
    });
    const add = node("button", "start-new-group", t("start_new_group"));
    add.type = "button";
    add.dataset.startFocus = "new-group";
    add.addEventListener("click", () => {
        el("start-new-group-form").hidden = false;
        el("start-group-name").focus();
    });
    chips.append(add);
    const grid = el("start-sites-grid");
    grid.replaceChildren();
    sites.forEach((site, index) => {
        const assigned = selected.get(index);
        const card = node("button", "start-site");
        card.type = "button";
        card.dataset.site = site.name;
        card.dataset.startFocus = `site-${index}`;
        card.setAttribute("aria-pressed", String(assigned !== undefined));
        const img = node("img", "");
        img.src = bookmarkFavicon(site.url);
        img.alt = "";
        img.addEventListener("error", () => { img.hidden = true; }, { once: true });
        const icon = node("span", "start-site-icon");
        icon.append(img);
        card.style.setProperty("--start-destination-color", destinationColor(assigned ?? destination));
        card.append(icon, node("span", "start-site-name", site.name), node("span", "start-site-assignment", assigned === undefined ? "" : destinations[assigned]));
        card.addEventListener("click", () => {
            if (selected.get(index) === destination) selected.delete(index);
            else selected.set(index, destination);
            renderPicker();
        });
        grid.append(card);
    });
    const shortcuts = [...selected.values()].filter(value => value === 0).length;
    el("start-selection-summary").textContent = t("start_selection", [String(shortcuts), String(selected.size - shortcuts)]);
    el("start-add-sites").textContent = t("start_add_sites", [String(selected.size)]);
    el("start-add-sites").disabled = busy || !selected.size;
    if (focused) el("start-picker").querySelector(`[data-start-focus="${focused}"]`)?.focus();
}

async function commit(blank) {
    if (busy || (!blank && !selected.size)) return;
    busy = true;
    const target = currentWorkspace;
    const panel = el("empty-workspace-message");
    panel.setAttribute("aria-busy", "true");
    panel.querySelectorAll(".start-screen button").forEach(button => { button.disabled = true; });
    try {
        const shortcuts = [], groups = [];
        if (blank) groups.push({ name: t("start_empty_group"), items: [] });
        else {
            const byGroup = new Map();
            for (const [index, assigned] of selected) {
                const site = sites[index];
                const item = { ...site, type: "link", icon: window.autoFaviconEnabled !== false ? bookmarkFavicon(site.url) : "" };
                if (assigned === 0) shortcuts.push(item);
                else {
                    if (!byGroup.has(assigned)) byGroup.set(assigned, { name: destinations[assigned], items: [] });
                    byGroup.get(assigned).items.push(item);
                }
            }
            groups.push(...byGroup.values());
        }
        const created = await addStartScreenContent(target, { groups, shortcuts });
        if (!blank && groups.length) {
            // Content is already saved: a layout failure must not offer a retry
            // that would duplicate the selected sites. Keep Undo available.
            try { await compactAddedGroups(created); }
            catch { showToast(t("start_layout_failed"), true, { durationMs: 6000 }); }
        }
        selected.clear();
        showPicker(false);
        showStartScreenUndo(t("start_added"), created);
    } catch { showToast(t("bmi_save_failed"), true); }
    finally {
        busy = false;
        panel.removeAttribute("aria-busy");
        panel.querySelectorAll(".start-screen button").forEach(button => { button.disabled = false; });
        el("start-add-sites").disabled = !selected.size;
        void refreshBookmarks();
    }
}

export function initStartScreen() {
    if (initialized) return;
    initialized = true;
    const cancelGroup = () => {
        closeGroupForm();
        el("start-destinations").querySelector(".start-new-group")?.focus();
    };
    el("start-cancel-group").addEventListener("click", cancelGroup);
    el("start-group-name").addEventListener("input", event => event.target.setCustomValidity(""));
    el("start-new-group-form").addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelGroup(); }
    });
    el("start-new-group-form").addEventListener("submit", event => {
        event.preventDefault();
        if (busy) return;
        const input = el("start-group-name");
        const name = input.value.trim();
        if (!name) {
            input.setCustomValidity(t("scwh13_enter_group_name"));
            input.reportValidity();
            return;
        }
        // Keep destinations distinct, including the built-in Shortcuts chip.
        let unique = name, suffix = 2;
        while (destinations.some(value => value.toLocaleLowerCase() === unique.toLocaleLowerCase())) unique = `${name} (${suffix++})`;
        destinations.push(unique);
        destination = destinations.length - 1;
        closeGroupForm();
        renderPicker();
        el("start-destinations").querySelector(`[data-start-focus="destination-${destination}"]`)?.focus();
    });
    el("empty-start-suggestions-btn").addEventListener("click", () => showPicker(true, true));
    for (const id of ["start-picker-back", "start-picker-footer-back"]) el(id).addEventListener("click", () => showPicker(false, true));
    el("empty-add-group-btn").addEventListener("click", () => void commit(true));
    el("start-add-sites").addEventListener("click", () => void commit(false));
    el("empty-import-bookmarks-btn").addEventListener("click", async () => {
        const { openBookmarkImport } = await import("./bookmark-import.js");
        await openBookmarkImport({ offerUndo: true });
    });
    el("start-all-settings").addEventListener("click", async () => {
        const { openSettingsModal } = await import("./event-handlers/settings-modal-handlers.js");
        openSettingsModal("general");
    });
    window.addEventListener("rt:empty-workspace-changed", refreshWorkspace);
    window.addEventListener("focus", () => {
        if (el("empty-workspace-message").style.display !== "none") void refreshBookmarks();
    });
    refreshWorkspace();
}
