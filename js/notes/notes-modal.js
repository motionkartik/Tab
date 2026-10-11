import { getCurrentWorkspace } from "../workspaces/workspace-state.js";
import { renderMarkdown } from "../markdown.js";
import {
    loadNotes,
    saveNotes,
    createNote,
    areWorkspaceNotesLocked,
} from "./notes-storage.js";

// ─── Notes hub modal ───────────────────────────────────────────────────────
//
// A standalone, off-grid hub for a workspace's markdown notes. Structure and
// logic mirror the furnished "Notes Creator Modal" design: a sidebar listing
// the active workspace's notes (with search + new-note) and a markdown editor
// with Write / Split / Preview modes, a formatting toolbar, and autosave.

const ICON_ATTRS =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON_PATHS = {
    pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
    write: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="12" y1="4" x2="12" y2="20"></line>',
    preview:
        '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="2.6"></circle>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"></path><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"></path>',
    italic:
        '<line x1="19" y1="5" x2="11" y2="5"></line><line x1="13" y1="19" x2="5" y2="19"></line><line x1="15" y1="5" x2="9" y2="19"></line>',
    code: '<polyline points="8 7 3 12 8 17"></polyline><polyline points="16 7 21 12 16 17"></polyline>',
    h1: '<path d="M4 6v12"></path><path d="M12 6v12"></path><path d="M4 12h8"></path><path d="M17 10l3-1.5V18"></path>',
    h2: '<path d="M4 6v12"></path><path d="M11 6v12"></path><path d="M4 12h7"></path><path d="M15 16c0-2 4-2.5 4-5a2 2 0 0 0-3.8-.8"></path><path d="M15 18h4"></path>',
    ul: '<line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none"></circle>',
    ol: '<line x1="10" y1="6" x2="20" y2="6"></line><line x1="10" y1="12" x2="20" y2="12"></line><line x1="10" y1="18" x2="20" y2="18"></line><path d="M4 5.5l1-.5v3"></path><path d="M4 15h2v1.2l-1.6 1.8H6" stroke-width="1.7"></path>',
    quote: '<path d="M6 7H3v5h3l-2 4"></path><path d="M17 7h-3v5h3l-2 4"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"></path><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"></path>',
    search:
        '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    close: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
    trash: '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"></path><path d="M9 7V4h6v3"></path>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
};

/** Build an <svg> icon element from the named path set. */
function icon(name, size = 16) {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    // Parsing a trusted, hardcoded icon string from our own constant table.
    wrap.innerHTML = `<svg width="${size}" height="${size}" ${ICON_ATTRS}>${ICON_PATHS[name] || ""}</svg>`;
    return wrap.firstChild;
}

const el = (tag, className, props) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (props) Object.assign(node, props);
    return node;
};

// ── module state ──
let overlay = null;
let modal = null;
const refs = {};
let notes = [];
let activeId = null;
let mode = "split";
let searchQuery = "";
let workspaceId = null;
let isOpen = false;
let saveTimer = null;
let clock = () => Date.now();

const TOOLBAR = [
    { name: "bold", kind: "bold", title: "Bold  (**text**)" },
    { name: "italic", kind: "italic", title: "Italic  (*text*)" },
    { name: "code", kind: "code", title: "Inline code" },
    { name: "h1", kind: "h1", title: "Heading 1", divider: true },
    { name: "h2", kind: "h2", title: "Heading 2" },
    { name: "ul", kind: "ul", title: "Bulleted list", divider: true },
    { name: "ol", kind: "ol", title: "Numbered list" },
    { name: "quote", kind: "quote", title: "Quote" },
    { name: "link", kind: "link", title: "Link" },
];

function activeNote() {
    return notes.find((n) => n.id === activeId) || null;
}

function isEmptyNote(n) {
    return n && !n.title.trim() && !n.content.trim();
}

function relTime(ts) {
    const diff = clock() - ts;
    const m = 60e3,
        h = 60 * m,
        d = 24 * h;
    if (diff < m) return "just now";
    if (diff < h) return Math.floor(diff / m) + "m ago";
    if (diff < d) return Math.floor(diff / h) + "h ago";
    if (diff < 7 * d) return Math.floor(diff / d) + "d ago";
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function wordCount(s) {
    const t = (s || "").trim();
    return t ? t.split(/\s+/).length : 0;
}

// ── build overlay DOM once ──
function build() {
    overlay = el("div", "notes-modal-overlay");
    overlay.style.display = "none";
    modal = el("div", "notes-modal mode-split");

    // title bar
    const titlebar = el("div", "notes-titlebar");
    const tleft = el("div", "notes-titlebar-left");
    tleft.append(el("span", "notes-title-dot"));
    tleft.append(el("span", "notes-title-kicker", { textContent: "Notes" }));
    tleft.append(el("span", "notes-title-sep"));
    refs.subtitle = el("span", "notes-title-sub");
    tleft.append(refs.subtitle);
    const closeBtn = el("button", "notes-close", { type: "button", title: "Close" });
    closeBtn.append(icon("close", 17));
    closeBtn.addEventListener("click", close);
    titlebar.append(tleft, closeBtn);

    // body
    const body = el("div", "notes-body");
    body.append(buildSidebar(), buildEditor());

    modal.append(titlebar, body);
    overlay.append(modal);

    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });
    overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    });

    document.body.append(overlay);
}

function buildSidebar() {
    const sidebar = el("div", "notes-sidebar");
    const head = el("div", "notes-sidebar-head");

    const search = el("div", "notes-search");
    search.append(icon("search", 16));
    refs.search = el("input", null, { type: "text", placeholder: "Search notes…" });
    refs.search.addEventListener("input", () => {
        searchQuery = refs.search.value;
        renderList();
    });
    refs.searchClear = el("button", "notes-search-clear", {
        type: "button",
        textContent: "✕",
    });
    refs.searchClear.addEventListener("click", () => {
        searchQuery = "";
        refs.search.value = "";
        renderList();
        refs.search.focus();
    });
    search.append(refs.search, refs.searchClear);

    const newBtn = el("button", "notes-new-btn", { type: "button" });
    newBtn.append(icon("plus", 16), document.createTextNode("New note"));
    newBtn.addEventListener("click", newNote);
    head.append(search, newBtn);

    const countRow = el("div", "notes-count-row");
    refs.countLabel = el("span", "notes-count-label", { textContent: "All notes" });
    refs.countPill = el("span", "notes-count-pill", { textContent: "0" });
    countRow.append(refs.countLabel, refs.countPill);

    refs.list = el("div", "notes-list");
    sidebar.append(head, countRow, refs.list);
    return sidebar;
}

function buildEditor() {
    refs.editor = el("div", "notes-editor");

    // header: title + mode toggle
    const head = el("div", "notes-editor-head");
    refs.titleInput = el("input", "notes-title-input", {
        type: "text",
        placeholder: "Untitled note",
    });
    refs.titleInput.addEventListener("input", () => {
        const n = activeNote();
        if (!n) return;
        n.title = refs.titleInput.value;
        touch(n);
    });

    const toggle = el("div", "notes-mode-toggle");
    [
        ["write", "Write"],
        ["split", "Split"],
        ["preview", "Preview"],
    ].forEach(([key, label]) => {
        const btn = el("button", "notes-mode-btn", { type: "button" });
        btn.dataset.mode = key;
        btn.append(icon(key, 15), document.createTextNode(label));
        btn.addEventListener("click", () => setMode(key));
        toggle.append(btn);
    });
    refs.modeToggle = toggle;
    head.append(refs.titleInput, toggle);

    // toolbar
    const toolbar = el("div", "notes-toolbar");
    TOOLBAR.forEach((t) => {
        const btn = el("button", "notes-tool" + (t.divider ? " has-divider" : ""), {
            type: "button",
            title: t.title,
        });
        btn.append(icon(t.name, 16));
        btn.addEventListener("click", () => applyTool(t.kind));
        toolbar.append(btn);
    });
    toolbar.append(el("div", "notes-toolbar-spacer"));
    refs.metaLine = el("span", "notes-meta-line");
    toolbar.append(refs.metaLine);

    // surface
    const surface = el("div", "notes-surface");
    const writePane = el("div", "notes-write-pane");
    refs.textarea = el("textarea", null, {
        placeholder:
            "Start writing in Markdown…\n\n# A heading\n**bold**, *italic*, `code`\n- a list item\n> a quote",
    });
    refs.textarea.addEventListener("input", () => {
        const n = activeNote();
        if (!n) return;
        n.content = refs.textarea.value;
        touch(n);
    });
    writePane.append(refs.textarea);
    refs.divider = el("div", "notes-pane-divider");
    refs.previewPane = el("div", "notes-preview-pane");
    refs.preview = el("div", "notes-md");
    refs.previewPane.append(refs.preview);
    surface.append(writePane, refs.divider, refs.previewPane);

    // footer
    const footer = el("div", "notes-footer");
    refs.savedLine = el("span", "notes-saved-line");
    const actions = el("div", "notes-footer-actions");
    const delBtn = el("button", "notes-btn-delete", {
        type: "button",
        textContent: "Delete",
    });
    delBtn.addEventListener("click", deleteActive);
    const cancelBtn = el("button", "notes-btn-cancel", {
        type: "button",
        textContent: "Close",
    });
    cancelBtn.addEventListener("click", close);
    const saveBtn = el("button", "notes-btn-save", {
        type: "button",
        textContent: "Save note",
    });
    // Save persists only — it does NOT close the modal. The modal is closed
    // via Escape, the title-bar ✕, or the footer Close button.
    saveBtn.addEventListener("click", () => {
        flushSave();
        if (refs.savedLine) refs.savedLine.textContent = "Saved";
    });
    actions.append(delBtn, cancelBtn, saveBtn);
    footer.append(refs.savedLine, actions);

    refs.editor.append(head, toolbar, surface, footer);
    return refs.editor;
}

// ── editing / persistence ──
function touch(n) {
    n.updatedAt = clock();
    updateEditorMeta();
    renderList();
    scheduleSave();
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
}

function flushSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!workspaceId) return;
    // Never attempt a write for a locked workspace (would throw / can't encrypt).
    if (areWorkspaceNotesLocked(workspaceId)) return;
    // Persist only notes with real content; empty drafts stay in memory only.
    const toSave = notes.filter((n) => n.title.trim() || n.content.trim());
    saveNotes(toSave, workspaceId).catch((e) =>
        console.warn("[notes] save failed", e),
    );
}

function setMode(next) {
    mode = next;
    modal.classList.remove("mode-write", "mode-split", "mode-preview");
    modal.classList.add("mode-" + mode);
    refs.modeToggle.querySelectorAll(".notes-mode-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === mode);
    });
}

function applyTool(kind) {
    const ta = refs.textarea;
    if (!ta) return;
    const start = ta.selectionStart,
        end = ta.selectionEnd;
    const val = ta.value;
    const lineTools = { h1: "# ", h2: "## ", ul: "- ", ol: "1. ", quote: "> " };
    if (lineTools[kind]) {
        const ls = val.lastIndexOf("\n", start - 1) + 1;
        const pre = lineTools[kind];
        ta.value = val.slice(0, ls) + pre + val.slice(ls);
        commit(ta, start + pre.length, end + pre.length);
        return;
    }
    const wrap = {
        bold: ["**", "**", "bold text"],
        italic: ["*", "*", "italic text"],
        code: ["`", "`", "code"],
        link: ["[", "](https://)", "label"],
    }[kind];
    const [l, r, ph] = wrap;
    const inner = val.slice(start, end) || ph;
    ta.value = val.slice(0, start) + l + inner + r + val.slice(end);
    if (kind === "link") commit(ta, start + 1, start + 1 + inner.length);
    else commit(ta, start + l.length, start + l.length + inner.length);
}

function commit(ta, selStart, selEnd) {
    const n = activeNote();
    if (n) {
        n.content = ta.value;
        touch(n);
    }
    requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(selStart, selEnd);
    });
}

// ── rendering ──
function renderList() {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    const shown = sorted.filter(
        (n) => !q || (n.title + " " + n.content).toLowerCase().includes(q),
    );

    refs.countLabel.textContent = q ? "Results" : "All notes";
    refs.countPill.textContent = String(shown.length);
    refs.searchClear.style.display = q ? "" : "none";

    refs.list.replaceChildren();
    shown.forEach((n) => {
        const row = el("div", "notes-row" + (n.id === activeId ? " active" : ""));
        const top = el("div", "notes-row-top");
        if (isEmptyNote(n)) {
            top.append(el("span", "notes-draft-badge", { textContent: "Draft" }));
        }
        top.append(
            el("span", "notes-row-title", {
                textContent: n.title.trim() || "Untitled note",
            }),
        );
        row.append(top);

        const plain = n.content
            .replace(/[#>*`\-\[\]()!]/g, "")
            .replace(/\n+/g, " ")
            .trim();
        row.append(
            el("div", "notes-row-preview", { textContent: plain || "No content yet" }),
        );
        row.append(el("div", "notes-row-meta", { textContent: relTime(n.updatedAt) }));

        row.addEventListener("click", () => selectNote(n.id));
        refs.list.append(row);
    });

    if (q && shown.length === 0) {
        refs.list.append(
            el("div", "notes-empty", {
                textContent: `No notes match “${searchQuery}”.`,
            }),
        );
    }
}

function renderEditor() {
    const n = activeNote();
    if (!n) return;
    refs.titleInput.value = n.title;
    refs.textarea.value = n.content;
    updatePreview();
    updateEditorMeta();
}

function updatePreview() {
    const n = activeNote();
    const src = n ? n.content : "";
    if (!src.trim()) {
        refs.preview.replaceChildren(
            el("p", "notes-md-empty", {
                textContent: "Nothing to preview yet — start writing on the left.",
            }),
        );
        return;
    }
    refs.preview.replaceChildren(renderMarkdown(src));
}

function updateEditorMeta() {
    const n = activeNote();
    if (!n) return;
    const words = wordCount(n.content);
    const chars = n.content.length;
    refs.metaLine.textContent = `${words} words · ${chars} chars`;
    refs.savedLine.textContent = isEmptyNote(n)
        ? "New note · not saved"
        : "Edited " + relTime(n.updatedAt);
    updatePreview();
}

// ── actions ──
function newNote() {
    // Drop empty drafts so we never accumulate blanks.
    notes = notes.filter((n) => n.title.trim() || n.content.trim());
    const fresh = createNote(clock());
    notes.unshift(fresh);
    activeId = fresh.id;
    searchQuery = "";
    refs.search.value = "";
    if (mode === "preview") setMode("split");
    renderList();
    renderEditor();
    requestAnimationFrame(() => refs.textarea.focus());
}

function selectNote(id) {
    if (id === activeId) return;
    const current = activeNote();
    if (current && isEmptyNote(current)) {
        notes = notes.filter((n) => n.id !== current.id);
    }
    activeId = id;
    renderList();
    renderEditor();
}

function deleteActive() {
    const n = activeNote();
    if (!n) return;
    if (!isEmptyNote(n) && !window.confirm(`Delete “${n.title.trim() || "Untitled note"}”?`)) {
        return;
    }
    notes = notes.filter((x) => x.id !== n.id);
    flushSave();
    // Pick the next most-recent note, or start a fresh draft.
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    if (sorted.length) {
        activeId = sorted[0].id;
        renderList();
        renderEditor();
    } else {
        newNote();
    }
}

// ── open / close ──
export async function openNotesModal() {
    if (!overlay) build();
    workspaceId = getCurrentWorkspace();
    refs.subtitle.textContent = workspaceLabel(workspaceId);

    if (areWorkspaceNotesLocked(workspaceId)) {
        showLocked();
        return;
    }

    const { locked, notes: loaded } = await loadNotes(workspaceId);
    if (locked) {
        showLocked();
        return;
    }

    hideLocked();
    notes = loaded;
    if (notes.length) {
        const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
        activeId = sorted[0].id;
        renderList();
        renderEditor();
    } else {
        newNote();
    }
    setMode(mode);
    present();
}

function present() {
    overlay.style.display = "flex";
    isOpen = true;
    document.addEventListener("keydown", onGlobalKey, true);
    requestAnimationFrame(() => {
        (refs.textarea || overlay).focus();
    });
}

function onGlobalKey(e) {
    if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
    }
}

export function close() {
    if (!overlay || !isOpen) return;
    // Drop empty draft, persist the rest.
    const current = activeNote();
    if (current && isEmptyNote(current)) {
        notes = notes.filter((n) => n.id !== current.id);
    }
    flushSave();
    overlay.style.display = "none";
    isOpen = false;
    document.removeEventListener("keydown", onGlobalKey, true);
}

export function isNotesModalOpen() {
    return isOpen;
}

function workspaceLabel(id) {
    if (!id || id === "default") return "Start";
    return id.replace(/-/g, " ");
}

function showLocked() {
    if (!overlay) build();
    refs.editor.style.display = "none";
    // reuse: hide sidebar list interactions by showing a locked panel over body
    if (!refs.lockedPanel) {
        refs.lockedPanel = el("div", "notes-locked");
        refs.lockedPanel.append(icon("lock", 34));
        refs.lockedPanel.append(
            el("div", "notes-locked-title", { textContent: "Workspace locked" }),
        );
        refs.lockedPanel.append(
            el("div", "notes-locked-desc", {
                textContent:
                    "This workspace is protected. Unlock it (open the workspace and enter its passphrase) to read and edit its notes.",
            }),
        );
        modal.querySelector(".notes-body").append(refs.lockedPanel);
    }
    refs.lockedPanel.style.display = "flex";
    modal.querySelector(".notes-sidebar").style.display = "none";
    refs.subtitle.textContent = workspaceLabel(getCurrentWorkspace());
    present();
}

function hideLocked() {
    if (refs.lockedPanel) refs.lockedPanel.style.display = "none";
    if (refs.editor) refs.editor.style.display = "";
    const sb = modal && modal.querySelector(".notes-sidebar");
    if (sb) sb.style.display = "";
}

// Close the modal if the workspace changes underneath it (e.g. tab switch).
export function handleWorkspaceSwitched() {
    if (isOpen) close();
}
