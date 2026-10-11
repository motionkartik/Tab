// Keyboard Spotlight — triggered by '/' when not focused in an input

import { getElements } from "./variables.js";
import { getWorkspacesData } from "./workspaces/workspace-state.js";
import { showToast } from "./undo-manager.js";
import { getSearchResults, performWebSearch } from "./search-utils.js";
import { executeActionItem } from "./action-executor.js";
import { buildSearchResultRow } from "./search-result-row.js";
import { t } from "./i18n.js";

// ── State ─────────────────────────────────────────────────────────────────────

let backdropEl = null;
let inputEl = null;
let resultsEl = null;
let focusedIndex = -1;
let currentResults = [];
let isOpen = false;
let captureHandler = null;
let renderRequestId = 0;

const NEW_GROUP_VALUE = "__new_group__";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Web-search fallback honoring the user's link-target preference.
function openWebSearch(query) {
    void performWebSearch(query, { newTab: window.linkTarget === "_blank" });
}

function buildSpotlightLinkItem(item, chosenName) {
    const nextItem = {
        name: chosenName,
        url: item.url || "",
        icon: item.icon || "",
        type: "link",
        y: 0,
    };

    if (item.iconColor) nextItem.iconColor = item.iconColor;
    if (item.description) nextItem.description = item.description;
    if (item.targetOverride) nextItem.targetOverride = item.targetOverride;
    if (item.style && typeof item.style === "object") {
        nextItem.style = { ...item.style };
    }

    return nextItem;
}

// ── DOM builder (lazy, created once) ─────────────────────────────────────────

function buildDOM() {
    if (backdropEl) return;

    backdropEl = document.createElement("div");
    backdropEl.id = "spotlight-backdrop";
    backdropEl.className = "spotlight-backdrop";

    const modal = document.createElement("div");
    modal.className = "spotlight-modal";

    // Search row
    const searchWrap = document.createElement("div");
    searchWrap.className = "spotlight-search-wrap";

    const searchSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
    );
    searchSvg.setAttribute("viewBox", "0 0 512 512");
    searchSvg.classList.add("spotlight-search-icon");
    searchSvg.innerHTML =
        '<path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>';

    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.id = "spotlight-input";
    inputEl.className = "spotlight-input";
    inputEl.placeholder = t("s28_search_placeholder");
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;

    const shortcutHint = document.createElement("span");
    shortcutHint.className = "spotlight-esc-kbd";
    shortcutHint.textContent = "ctrl+space";

    searchWrap.append(searchSvg, inputEl, shortcutHint);

    // Results container
    resultsEl = document.createElement("div");
    resultsEl.id = "spotlight-results";
    resultsEl.className = "spotlight-results";

    // Footer hints
    const footer = document.createElement("div");
    footer.className = "spotlight-footer";
    [
        [["↑", "↓"], t("s28_hint_navigate")],
        [["↵"], t("s28_hint_open")],
        [["esc"], t("s28_hint_close")],
    ].forEach(([keys, label]) => {
        const hint = document.createElement("span");
        hint.className = "spotlight-footer-hint";
        keys.forEach((k) => {
            const kbd = document.createElement("kbd");
            kbd.textContent = k;
            hint.appendChild(kbd);
        });
        hint.appendChild(document.createTextNode("\u00a0" + label));
        footer.appendChild(hint);
    });

    modal.append(searchWrap, resultsEl, footer);
    backdropEl.appendChild(modal);
    document.body.appendChild(backdropEl);

    // Backdrop click closes
    backdropEl.addEventListener("click", (e) => {
        if (e.target === backdropEl) close();
    });

    // Input: search on each keystroke
    inputEl.addEventListener("input", () => {
        focusedIndex = -1;
        void render();
    });

    // Keyboard navigation
    inputEl.addEventListener("keydown", (e) => {
        // Stop propagation for ALL keys to prevent other global listeners (GridStack, etc.) from capturing input
        e.stopPropagation();

        const items = [
            ...resultsEl.querySelectorAll(
                ".spotlight-result, .spotlight-result-web",
            ),
        ];

        if (e.key === "ArrowDown") {
            e.preventDefault();
            focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
            updateFocus(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusedIndex = Math.max(focusedIndex - 1, 0);
            updateFocus(items);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (focusedIndex >= 0 && items[focusedIndex]) {
                items[focusedIndex].click();
            } else if (currentResults.length > 0) {
                currentResults[0].el.click();
            } else {
                const q = inputEl.value.trim();
                if (q) openWebSearch(q);
                close();
            }
        } else if (e.key === "Escape") {
            close();
        }
    });
}

function updateFocus(items) {
    items.forEach((el, i) =>
        el.classList.toggle("focused", i === focusedIndex),
    );
    if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: "nearest" });
    }
}

// ── Render results ────────────────────────────────────────────────────────────

async function render() {
    const q = inputEl.value.trim();
    const term = q.toLowerCase();
    const requestId = ++renderRequestId;
    resultsEl.innerHTML = "";
    currentResults = [];
    focusedIndex = -1;

    if (!term) return;

    const { results: top } = await getSearchResults(term, { limit: 10 });
    if (requestId !== renderRequestId || inputEl.value.trim() !== q) return;

    top.forEach((result) => {
        const row = buildSearchResultRow(result, {
            tag: "div",
            onActivate: (r) => {
                if (executeActionItem(r)) close();
            },
        });

        if (result.canAddToGroup) {
            const addBtn = document.createElement("button");
            addBtn.className = "spotlight-add-btn";
            addBtn.title = t("s28_add_to_group");
            addBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="11" height="11" fill="currentColor"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/></svg>';
            addBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                _showAddToGroupForm(result);
            });
            row.appendChild(addBtn);
        }

        resultsEl.appendChild(row);
        currentResults.push({ item: result, el: row });
    });

    if (q && top.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "spotlight-no-results";
        emptyEl.textContent = t("s28_no_matches", [q]);
        resultsEl.appendChild(emptyEl);
    }

    if (q) {
        const webRow = document.createElement("div");
        webRow.className = "spotlight-result-web";

        const webIcon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        webIcon.setAttribute("viewBox", "0 0 512 512");
        webIcon.innerHTML =
            '<path d="M352 256c0 22.2-1.2 43.6-3.3 64H163.3c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64H348.7c2.2 20.4 3.3 41.8 3.3 64zm28.8-64H503.9c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64H380.8c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32H376.7c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0H167.7c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.5 26 20.9 58.2 27 94.7zm-209 0H18.6C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192H131.2c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64H8.1C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.5-26-20.9-58.2-27-94.6H344.3c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352H135.3zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6H493.4z"/>';

        const label = document.createElement("span");
        label.textContent = t("s28_search_web_for", [q]);

        webRow.append(webIcon, label);
        webRow.addEventListener("click", () => {
            openWebSearch(q);
            close();
        });

        resultsEl.appendChild(webRow);
    }
}

// ── Add to group ──────────────────────────────────────────────────────────────

function _showAddToGroupForm(item) {
    const data = getWorkspacesData();
    const activeWs = data.activeWorkspace || "default";
    const groups = (data.workspaces[activeWs] || [])
        // Only plain link groups can receive a link: excluding just
        // link-button left clipboard/launcher/routine buttons, section
        // blocks and todo-lists selectable as dead options (submit would
        // fail with "group not found").
        .filter((group) => !group?.type && Array.isArray(group?.items))
        .map((group) => group?.name)
        .filter((name) => typeof name === "string" && name.trim());

    resultsEl.innerHTML = "";
    const form = document.createElement("div");
    form.className = "spotlight-add-form";

    const titleField = document.createElement("div");
    titleField.className = "spotlight-add-field";

    const titleLabel = document.createElement("label");
    titleLabel.className = "spotlight-add-label";
    titleLabel.textContent = t("s28_label_title");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "spotlight-add-input";
    nameInput.value = item.name || "";
    titleField.append(titleLabel, nameInput);

    const groupField = document.createElement("div");
    groupField.className = "spotlight-add-field";

    const groupLabel = document.createElement("label");
    groupLabel.className = "spotlight-add-label";
    groupLabel.textContent = t("s28_label_group");
    const groupSelect = document.createElement("select");
    groupSelect.className = "spotlight-add-select";
    groups.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        groupSelect.appendChild(opt);
    });
    const newGroupOption = document.createElement("option");
    newGroupOption.value = NEW_GROUP_VALUE;
    newGroupOption.textContent = t("s28_new_group_option");
    groupSelect.appendChild(newGroupOption);
    if (groups.length === 0) {
        groupSelect.value = NEW_GROUP_VALUE;
    }
    groupField.append(groupLabel, groupSelect);

    const newGroupField = document.createElement("div");
    newGroupField.className = "spotlight-add-field";

    const newGroupLabel = document.createElement("label");
    newGroupLabel.className = "spotlight-add-label";
    newGroupLabel.textContent = t("s28_new_group_name_label");
    const newGroupInput = document.createElement("input");
    newGroupInput.type = "text";
    newGroupInput.className = "spotlight-add-input";
    newGroupInput.placeholder = t("s28_new_group_placeholder");
    newGroupField.append(newGroupLabel, newGroupInput);

    const syncNewGroupVisibility = () => {
        const showNewGroupInput = groupSelect.value === NEW_GROUP_VALUE;
        newGroupField.hidden = !showNewGroupInput;
    };

    groupSelect.addEventListener("change", () => {
        syncNewGroupVisibility();
        if (groupSelect.value === NEW_GROUP_VALUE) {
            requestAnimationFrame(() => newGroupInput.focus());
        }
    });

    const actions = document.createElement("div");
    actions.className = "spotlight-add-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "spotlight-add-cancel";
    cancelBtn.textContent = t("s28_cancel");
    cancelBtn.addEventListener("click", () => {
        focusedIndex = -1;
        void render();
    });

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "spotlight-add-confirm";
    confirmBtn.textContent = t("s28_add");
    confirmBtn.addEventListener("click", async () => {
        const chosenName = nameInput.value.trim() || item.name || "";
        if (!chosenName) {
            nameInput.focus();
            return;
        }

        if (groupSelect.value === NEW_GROUP_VALUE) {
            const newGroupName = newGroupInput.value.trim();
            if (!newGroupName) {
                newGroupInput.focus();
                return;
            }

            const duplicateGroup = groups.some(
                (groupName) =>
                    groupName.trim().toLowerCase() ===
                    newGroupName.toLowerCase(),
            );
            if (duplicateGroup) {
                showToast(t("s28_group_exists", [newGroupName]), true);
                newGroupInput.focus();
                newGroupInput.select();
                return;
            }

            const { addGroupToWorkspace } =
                await import("./workspaces/workspace-grid-sync.js");
            addGroupToWorkspace(newGroupName, [
                buildSpotlightLinkItem(item, chosenName),
            ]);
            close();
            showToast(t("s28_created_and_added", [newGroupName]));
            return;
        }

        const chosenGroup = groupSelect.value;
        const { saveWorkspacesToStorage } =
            await import("./workspaces/workspace-storage.js");
        const { createItems } = await import("./dom-manager/grid-renderer.js");

        const elements = getElements();
        const groupEl = elements.find(
            (w) => w.name === chosenGroup || w.content?.name === chosenGroup,
        );
        const items = groupEl?.items || groupEl?.content?.items;
        if (!items) {
            showToast(t("s28_group_not_found", [chosenGroup]), true);
            return;
        }

        items.push(buildSpotlightLinkItem(item, chosenName));
        items.forEach((it, i) => {
            it.y = i;
        });
        await saveWorkspacesToStorage();
        createItems(elements, true);

        close();
        showToast(t("s28_added_to", [chosenGroup]));
    });

    actions.append(cancelBtn, confirmBtn);
    form.append(titleField, groupField, newGroupField, actions);
    resultsEl.appendChild(form);
    syncNewGroupVisibility();
    if (groupSelect.value === NEW_GROUP_VALUE) {
        newGroupInput.focus();
    } else {
        nameInput.focus();
        nameInput.select();
    }
}

// ── Open / Close ──────────────────────────────────────────────────────────────

function open() {
    if (isOpen) return;
    buildDOM();
    isOpen = true;
    inputEl.value = "";
    resultsEl.innerHTML = "";
    currentResults = [];
    focusedIndex = -1;
    backdropEl.classList.add("active");
    renderRequestId += 1;

    // Capture-phase listener so Escape closes the modal even if focus is elsewhere.
    // We only intercept Escape here — character keys must NOT be prevented so the
    // input field can receive them normally.
    captureHandler = (e) => {
        if (!isOpen) return;
        if (e.key === "Escape") {
            close();
            e.preventDefault();
            e.stopPropagation();
        }
    };
    window.addEventListener("keydown", captureHandler, true);

    requestAnimationFrame(() => inputEl.focus());
}

function close() {
    if (!isOpen) return;
    isOpen = false;
    renderRequestId += 1;
    backdropEl.classList.remove("active");
    // Remove capture-phase listener
    if (captureHandler) {
        window.removeEventListener("keydown", captureHandler, true);
        captureHandler = null;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function openSpotlight() {
    open();
}

export function initSpotlight() {
    document.addEventListener("keydown", (e) => {
        const tag = document.activeElement?.tagName;
        const isEditable =
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            document.activeElement?.isContentEditable;

        // If spotlight is open, only handle Escape to close it
        // Let all other keys work normally for the input field
        if (isOpen) {
            if (e.key === "Escape") {
                close();
            }
            return;
        }

        // Ctrl+Space — works on all keyboard layouts (primary shortcut)
        const isCtrlSpace =
            e.key === " " && e.ctrlKey && !e.metaKey && !e.altKey;

        // '/' without any modifier — secondary shortcut for standard keyboards
        const isSlash =
            e.key === "/" &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            !e.shiftKey;

        if ((isCtrlSpace || isSlash) && !isEditable) {
            e.preventDefault();
            open();
        }
    });
}
