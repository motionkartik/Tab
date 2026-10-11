// section-renderer.js — top-level "section" widgets (heading / text / divider /
// callout / code) that live between groups on the main grid. They reuse theme CSS
// variables so they match every theme, and expose --section-* vars for the editor.

import {
    PRESET_AVATARS,
    PRESET_AVATAR_IDS,
    isPresetAvatar,
    getPresetAvatarSvg,
} from "./avatars.js";
import { t } from "../i18n.js";
import { faviconImage, letterAvatarElement, remoteFaviconsAllowed } from "../favicon.js";

// Grid/edit dependencies are injected (not imported) so this module stays free of
// extension-only code and can be reused by the public read-only reader. The host
// (extension) wires the real handlers via setSectionRenderHooks(); in read-only
// mode they stay no-ops (never called, since canEdit=false paths don't edit).
let _onChange = () => {};
let _getGrid = () => null;
export const setSectionRenderHooks = ({ onChange, getGrid } = {}) => {
    if (typeof onChange === "function") _onChange = onChange;
    if (typeof getGrid === "function") _getGrid = getGrid;
};

export const SECTION_TYPES = [
    "section-header",
    "section-stepheader",
    "section-text",
    "section-divider",
    "section-arrow",
    "section-callout",
    "section-code",
    "section-steps",
    "section-image",
    "section-profile",
    "section-linkcard",
    "section-file",
];

// Accept only http(s) URLs for image sources (no data:/javascript:).
const sanitizeImgUrl = (val) => {
    try {
        const u = new URL(String(val).trim());
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch {
        return "";
    }
};
export const isSectionType = (type) => SECTION_TYPES.includes(type);

const LEVELS = ["h1", "h2", "h3"];
const ALIGNS = ["left", "center", "right"];
const CALLOUT_VARIANTS = ["info", "tip", "warning", "success", "error"];
const IMAGE_FITS = ["cover", "contain"];
// Clockwise order so the direction button steps like a clock (8 positions).
const ARROW_DIRS = [
    "up",
    "up-right",
    "right",
    "down-right",
    "down",
    "down-left",
    "left",
    "up-left",
];

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};
const faviconUrl = (url) => {
    if (!remoteFaviconsAllowed()) return "";
    const h = hostOf(url);
    return h
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`
        : "";
};
// Link-card favicon element: remote image with a letter-avatar fallback, or
// the avatar directly when remote favicons are disabled / no host.
const linkcardFavIcon = (url) => {
    const host = hostOf(url) || url;
    const remote = faviconUrl(url);
    if (!remote) {
        const avatar = letterAvatarElement(host, 16);
        avatar.classList.add("linkcard-favicon");
        return avatar;
    }
    return faviconImage(remote, {
        size: 16,
        fallbackName: host,
        className: "linkcard-favicon",
    });
};
// Open a link, honouring the user's link-target setting (defaults to a new tab).
const openTarget = (url) => {
    if (!url) return;
    const target =
        typeof window !== "undefined" && window.linkTarget === "_self"
            ? "_self"
            : "_blank";
    window.open(url, target, "noopener,noreferrer");
};
// Files always open in a new tab (never navigate the board away to download).
const openNewTab = (url) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
};

// ── File-type detection ─────────────────────────────────────────────────────
const FILE_KINDS = [
    "generic",
    "pdf",
    "doc",
    "sheet",
    "slides",
    "archive",
    "image",
    "video",
    "audio",
];
const FILE_KIND_META = {
    generic: { label: "FILE", color: "#64748b" },
    pdf: { label: "PDF", color: "#e5484d" },
    doc: { label: "DOC", color: "#2563eb" },
    sheet: { label: "SHEET", color: "#16a34a" },
    slides: { label: "SLIDES", color: "#f59e0b" },
    archive: { label: "ZIP", color: "#8b5cf6" },
    image: { label: "IMAGE", color: "#ec4899" },
    video: { label: "VIDEO", color: "#ef4444" },
    audio: { label: "AUDIO", color: "#14b8a6" },
};
const EXT_KIND = {
    pdf: "pdf",
    doc: "doc",
    docx: "doc",
    rtf: "doc",
    txt: "doc",
    md: "doc",
    xls: "sheet",
    xlsx: "sheet",
    csv: "sheet",
    ppt: "slides",
    pptx: "slides",
    key: "slides",
    zip: "archive",
    rar: "archive",
    "7z": "archive",
    tar: "archive",
    gz: "archive",
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    webp: "image",
    svg: "image",
    mp4: "video",
    mov: "video",
    webm: "video",
    mkv: "video",
    avi: "video",
    mp3: "audio",
    wav: "audio",
    ogg: "audio",
    flac: "audio",
    m4a: "audio",
};
const fileNameFromUrl = (url) => {
    try {
        const seg =
            new URL(url).pathname.split("/").filter(Boolean).pop() || "";
        return decodeURIComponent(seg);
    } catch {
        return "";
    }
};
const detectFileKind = (url) => {
    const name = fileNameFromUrl(url);
    const m = name.match(/\.([a-z0-9]+)$/i);
    return (m && EXT_KIND[m[1].toLowerCase()]) || "generic";
};
const applyFileKind = (root, kind) => {
    const k = FILE_KINDS.includes(kind) ? kind : "generic";
    FILE_KINDS.forEach((x) => root.classList.toggle(`file-kind-${x}`, x === k));
    root.dataset.filekind = k;
    root.style.setProperty("--file-color", FILE_KIND_META[k].color);
};

const SVG = {
    grip: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    align: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
    surface:
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5L5 20"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    open: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    // Bold downward arrow (rotated per direction via CSS).
    arrow: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet"><line x1="12" y1="3" x2="12" y2="20"/><polyline points="5 13 12 20 19 13"/></svg>',
};

const CALLOUT_ICONS = {
    info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor"/></svg>',
    tip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.5.5 1 1.2 1 2.5h6c0-1.3.5-2 1-2.5A6 6 0 0 0 12 3z"/></svg>',
    warning:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
    success:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 16 9.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};

// Force plain-text paste so pasted markup never enters the editable.
const bindPlainPaste = (el) => {
    el.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain") ?? "";
        document.execCommand("insertText", false, text);
    });
};

const makeBtn = (title, html, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "section-ctrl-btn";
    b.title = title;
    b.innerHTML = html;
    b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(b);
    });
    return b;
};

const applyAlign = (root, align) => {
    ALIGNS.forEach((a) =>
        root.classList.toggle(`section-align-${a}`, a === align),
    );
    root.dataset.align = align;
};
const applyLevel = (root, level) => {
    LEVELS.forEach((l) =>
        root.classList.toggle(`section-level-${l}`, l === level),
    );
    root.dataset.level = level;
};
const applySurface = (root, surface) => {
    root.classList.toggle("section-surface-panel", surface === "panel");
    root.dataset.surface = surface;
};
const applyVariant = (root, variant, iconEl) => {
    CALLOUT_VARIANTS.forEach((v) =>
        root.classList.toggle(`callout-${v}`, v === variant),
    );
    root.dataset.variant = variant;
    if (iconEl) iconEl.innerHTML = CALLOUT_ICONS[variant] || CALLOUT_ICONS.info;
};
const applyThickness = (root, n) => {
    const px = Math.max(1, Math.min(15, parseInt(n, 10) || 1));
    root.style.setProperty("--divider-thickness", `${px}px`);
    root.dataset.thickness = String(px);
};
const applyFit = (root, fit) => {
    const f = IMAGE_FITS.includes(fit) ? fit : "cover";
    root.dataset.fit = f;
    root.style.setProperty("--img-fit", f);
};
const applyArrowDir = (root, dir) => {
    const d = ARROW_DIRS.includes(dir) ? dir : "down";
    ARROW_DIRS.forEach((x) => root.classList.toggle(`arrow-dir-${x}`, x === d));
    root.dataset.direction = d;
};
const clampStepNumber = (n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? Math.max(0, Math.min(999, v)) : 1;
};

const deleteSection = (root) => {
    const widgetEl = root.closest(".grid-stack-item");
    const grid = widgetEl?.gridstackNode?.grid || _getGrid();
    if (grid && widgetEl) grid.removeWidget(widgetEl);
    _onChange();
};

// ── Steps helpers ───────────────────────────────────────────────────────────
const stepsText = (ol) =>
    Array.from(ol.querySelectorAll("li"))
        .map((li) => li.textContent)
        .join("\n");

const focusInto = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
};

const addStep = (root) => {
    const ol = root.querySelector(".steps-list");
    if (!ol) return;
    const li = document.createElement("li");
    ol.appendChild(li);
    root.dataset.content = stepsText(ol);
    ol.focus();
    focusInto(li);
    _onChange();
};

const removeLastStep = (root) => {
    const ol = root.querySelector(".steps-list");
    if (!ol) return;
    const lis = ol.querySelectorAll("li");
    if (lis.length <= 1) {
        if (lis[0]) lis[0].textContent = "";
    } else {
        lis[lis.length - 1].remove();
    }
    root.dataset.content = stepsText(ol);
    _onChange();
};

// ── Image ───────────────────────────────────────────────────────────────────
// Renders the <img> (or the paste-URL form) into `container`; the URL is read
// from / written to `root.dataset.src`. Reused by the image element and the
// link-card thumbnail.
const renderImageInto = (container, root, canEdit, forceEdit = false) => {
    container
        .querySelectorAll(".section-img, .image-empty")
        .forEach((e) => e.remove());
    const src = root.dataset.src || "";
    if (src && !forceEdit) {
        const img = document.createElement("img");
        img.className = "section-img";
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        container.appendChild(img);
    } else if (canEdit) {
        const form = document.createElement("div");
        form.className = "image-empty";
        const input = document.createElement("input");
        input.type = "url";
        input.className = "image-url-input";
        input.placeholder = t("sr8_paste_image_url");
        input.value = root.dataset.src || "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "image-url-btn";
        btn.textContent = t("sr8_add");
        const apply = () => {
            const u = sanitizeImgUrl(input.value);
            if (!u) {
                input.classList.add("invalid");
                return;
            }
            root.dataset.src = u;
            renderImageInto(container, root, canEdit);
            _onChange();
        };
        btn.addEventListener("click", apply);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                apply();
            }
        });
        input.addEventListener("input", () =>
            input.classList.remove("invalid"),
        );
        form.append(input, btn);
        container.appendChild(form);
    }
};

// ── Profile avatar ───────────────────────────────────────────────────────────
const renderAvatar = (root) => {
    const av = root.dataset.avatar || "preset:a1";
    const box = root.querySelector(".profile-avatar");
    if (!box) return;
    if (isPresetAvatar(av)) {
        box.innerHTML = getPresetAvatarSvg(av);
    } else {
        const safe = sanitizeImgUrl(av);
        box.innerHTML = safe
            ? `<img src="${safe.replace(/"/g, "&quot;")}" alt="" referrerpolicy="no-referrer">`
            : getPresetAvatarSvg("preset:a1");
    }
};

const buildAvatarPicker = (root) => {
    const panel = document.createElement("div");
    panel.className = "avatar-picker";
    const grid = document.createElement("div");
    grid.className = "avatar-grid";
    PRESET_AVATAR_IDS.forEach((id) => {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "avatar-opt";
        opt.innerHTML = PRESET_AVATARS[id];
        opt.addEventListener("click", (e) => {
            e.stopPropagation();
            root.dataset.avatar = `preset:${id}`;
            renderAvatar(root);
            panel.remove();
            _onChange();
        });
        grid.appendChild(opt);
    });
    const input = document.createElement("input");
    input.type = "url";
    input.className = "avatar-url-input";
    input.placeholder = t("sr8_or_paste_image_url");
    input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const u = sanitizeImgUrl(input.value);
        if (!u) {
            input.classList.add("invalid");
            return;
        }
        root.dataset.avatar = u;
        renderAvatar(root);
        panel.remove();
        _onChange();
    });
    panel.append(grid, input);
    return panel;
};

// Unified section edit toggle, living in the .section-controls toolbar. Sections
// default to DISPLAY mode: rendered (markdown), not editable, and (for cards)
// clickable to open. The pencil flips to EDIT mode: raw text, contentEditable.
// Blurring out of the whole widget exits to display (renders + saves); toolbar
// buttons are blur-guarded so they don't drop you out mid-edit.
const attachSectionEdit = (
    root,
    controls,
    { editables = [], onEnter, onExit, open },
) => {
    let editing = false;
    const setEditing = (next) => {
        if (editing === next) return;
        editing = next;
        root.classList.toggle("section-editing", editing);
        editables.forEach((el) => {
            if (el) el.contentEditable = editing ? "true" : "false";
        });
        toggleBtn.classList.toggle("active", editing);
        toggleBtn.title = editing ? t("sr8_done") : t("sr8_edit");
        if (editing) {
            onEnter?.();
            editables.find(Boolean)?.focus();
        } else {
            onExit?.();
        }
    };

    const toggleBtn = makeBtn(t("sr8_edit"), SVG.pencil, () => setEditing(!editing));
    toggleBtn.classList.add("section-ctrl-edit");
    const handle = controls.querySelector(".section-drag-handle");
    controls.insertBefore(
        toggleBtn,
        handle ? handle.nextSibling : controls.firstChild,
    );

    editables.forEach((el) => {
        if (!el) return;
        el.addEventListener("blur", () => {
            // Defer: only exit if focus has left the whole widget (not a hop to
            // a toolbar button or sibling field).
            setTimeout(() => {
                if (!editing) return;
                if (
                    document.activeElement &&
                    root.contains(document.activeElement)
                )
                    return;
                setEditing(false);
            }, 0);
        });
    });

    if (open) {
        root.addEventListener("click", (e) => {
            if (editing) return;
            if (e.target.closest("button, input, a, .section-controls")) return;
            open();
        });
    }
};

const openAvatarPicker = (root) => {
    const existing = root.querySelector(".avatar-picker");
    if (existing) {
        existing.remove();
        return;
    }
    const avatarBox = root.querySelector(".profile-avatar");
    const picker = buildAvatarPicker(root);
    root.appendChild(picker);
    const close = (ev) => {
        if (
            !picker.contains(ev.target) &&
            ev.target !== avatarBox &&
            !avatarBox?.contains(ev.target)
        ) {
            picker.remove();
            document.removeEventListener("mousedown", close, true);
        }
    };
    // Defer so the click that opened the picker doesn't immediately close it.
    setTimeout(() => document.addEventListener("mousedown", close, true), 0);
};

// ── Inline markdown (bold / italic / inline code) ───────────────────────────
// Rendered only in read-only views (the public reader, subscribed boards). In
// the editor the raw source is shown so it stays directly editable. Output is
// HTML-escaped first, so only the <strong>/<em>/<code> tags we add are live.
const escapeHtml = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

export const renderInlineMarkdown = (text) => {
    let out = escapeHtml(text);
    // Inline code first so ** / * inside backticks aren't treated as emphasis.
    const codes = [];
    out = out.replace(/`([^`\n]+)`/g, (_, c) => {
        codes.push(c);
        return `${codes.length - 1}`;
    });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    out = out.replace(/(\d+)/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
    return out;
};

// Text body for text/callout/code. Built in DISPLAY mode (markdown rendered for
// markdown kinds); the toolbar edit toggle (attachSectionEdit) drives editing.
const makeEditable = (
    root,
    className,
    value,
    placeholder,
    markdown = false,
) => {
    const el = document.createElement("div");
    el.className = className;
    el.dataset.placeholder = placeholder;
    el.spellcheck = false;
    bindPlainPaste(el);
    if (markdown) el.innerHTML = renderInlineMarkdown(value || "");
    else el.textContent = value || "";
    root.dataset.content = value || "";
    return el;
};

// Edit config for a text body: swap to raw on enter, render + save on exit.
const bodyEditConfig = (root, el, markdown) => ({
    editables: [el],
    onEnter: () => {
        el.textContent = root.dataset.content || "";
    },
    onExit: () => {
        const raw = el.textContent;
        root.dataset.content = raw;
        if (markdown) el.innerHTML = renderInlineMarkdown(raw);
        else el.textContent = raw;
        _onChange();
    },
});

/**
 * Build a section widget's content node (the `.item` element the serializer reads).
 */
export const createSectionDOM = (data, canEdit = true) => {
    const type = data.type;
    const kind = type.replace("section-", ""); // header|text|divider|callout|code

    const root = document.createElement("div");
    root.className = `item section-content section-${kind}`;
    root.dataset.name = data.name;
    root.dataset.groupType = type;

    applyAlign(root, ALIGNS.includes(data.align) ? data.align : "left");
    // Only an explicit alignment goes into the dataset — the visual class
    // above still applies the default, but the default must not be baked
    // into the serialized data (WI-1 round-trip).
    if (!ALIGNS.includes(data.align)) delete root.dataset.align;
    applySurface(root, data.surface === "panel" ? "panel" : "bare");

    let calloutIcon = null;
    let editControls = null;
    let sectionEdit = null; // { editables, onEnter, onExit, open } for the toolbar toggle

    // ── Edit controls ──
    if (canEdit) {
        const controls = document.createElement("div");
        editControls = controls;
        controls.className = "section-controls";

        const handle = document.createElement("div");
        handle.className = "group-drag-handle section-drag-handle";
        handle.title = t("sr8_drag_to_move");
        handle.innerHTML = SVG.grip;
        controls.appendChild(handle);

        if (kind === "header") {
            const lvlBtn = makeBtn(t("sr8_heading_level"), "", (b) => {
                const next =
                    LEVELS[
                        (LEVELS.indexOf(root.dataset.level) + 1) % LEVELS.length
                    ];
                applyLevel(root, next);
                b.textContent = next.toUpperCase();
                _onChange();
            });
            lvlBtn.classList.add("section-ctrl-text");
            controls.appendChild(lvlBtn);
        }

        if (kind === "callout") {
            const varBtn = makeBtn(t("sr8_callout_type"), "", (b) => {
                const next =
                    CALLOUT_VARIANTS[
                        (CALLOUT_VARIANTS.indexOf(root.dataset.variant) + 1) %
                            CALLOUT_VARIANTS.length
                    ];
                applyVariant(root, next, calloutIcon);
                b.textContent = next.toUpperCase();
                _onChange();
            });
            varBtn.classList.add("section-ctrl-text");
            controls.appendChild(varBtn);
        }

        if (kind === "arrow") {
            const dirBtn = makeBtn(t("sr8_arrow_direction"), SVG.arrow, () => {
                const next =
                    ARROW_DIRS[
                        (ARROW_DIRS.indexOf(root.dataset.direction) + 1) %
                            ARROW_DIRS.length
                    ];
                applyArrowDir(root, next);
                _onChange();
            });
            dirBtn.classList.add("section-ctrl-arrowdir");
            controls.appendChild(dirBtn);
        }

        if (kind === "divider") {
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "1";
            slider.max = "15";
            slider.className = "section-thickness-slider";
            slider.title = t("sr8_thickness");
            slider.value = String(
                Math.max(1, Math.min(15, parseInt(data.thickness, 10) || 1)),
            );
            slider.addEventListener("input", () => {
                applyThickness(root, slider.value);
                _onChange();
            });
            slider.addEventListener("pointerdown", (e) => e.stopPropagation());
            controls.appendChild(slider);
        }

        if (
            kind === "text" ||
            kind === "callout" ||
            kind === "profile" ||
            kind === "stepheader"
        ) {
            controls.appendChild(
                makeBtn(t("sr8_alignment"), SVG.align, () => {
                    // Missing dataset means the default ("left"), so the
                    // first click moves to the next alignment, not back to
                    // an explicit "left".
                    const current = root.dataset.align || "left";
                    const next =
                        ALIGNS[
                            (ALIGNS.indexOf(current) + 1) % ALIGNS.length
                        ];
                    applyAlign(root, next);
                    _onChange();
                }),
            );
        }
        if (kind === "image") {
            controls.appendChild(
                makeBtn(t("sr8_change_image"), SVG.image, () => {
                    renderImageInto(root, root, true, true);
                    root.querySelector(".image-url-input")?.focus();
                }),
            );
            const fitBtn = makeBtn(t("sr8_fit"), "", (b) => {
                const next =
                    IMAGE_FITS[
                        (IMAGE_FITS.indexOf(root.dataset.fit) + 1) %
                            IMAGE_FITS.length
                    ];
                applyFit(root, next);
                b.textContent = next.toUpperCase();
                _onChange();
            });
            fitBtn.classList.add("section-ctrl-text");
            controls.appendChild(fitBtn);
        }
        if (kind === "steps") {
            controls.appendChild(
                makeBtn(t("sr8_add_step"), "+", (b) => {
                    addStep(root);
                    b.blur();
                }),
            );
            const minus = makeBtn(t("sr8_remove_last_step"), "−", () =>
                removeLastStep(root),
            );
            controls.appendChild(minus);
        }
        if (kind === "profile") {
            controls.appendChild(
                makeBtn(t("sr8_change_avatar"), SVG.image, () => {
                    openAvatarPicker(root);
                }),
            );
        }
        if (kind === "file") {
            const typeBtn = makeBtn(t("sr8_file_type"), "", (b) => {
                const next =
                    FILE_KINDS[
                        (FILE_KINDS.indexOf(root.dataset.filekind) + 1) %
                            FILE_KINDS.length
                    ];
                applyFileKind(root, next);
                b.textContent = FILE_KIND_META[next].label;
                const badge = root.querySelector(".file-kind-label");
                if (badge) badge.textContent = FILE_KIND_META[next].label;
                _onChange();
            });
            typeBtn.classList.add("section-ctrl-text");
            controls.appendChild(typeBtn);
        }
        if (kind === "linkcard") {
            controls.appendChild(
                makeBtn(t("sr8_change_thumbnail"), SVG.image, () => {
                    const thumb = root.querySelector(".linkcard-thumb");
                    if (thumb) {
                        renderImageInto(thumb, root, true, true);
                        thumb.querySelector(".image-url-input")?.focus();
                    }
                }),
            );
        }
        if (kind === "text") {
            controls.appendChild(
                makeBtn(t("sr8_panel_background"), SVG.surface, () => {
                    applySurface(
                        root,
                        root.dataset.surface === "panel" ? "bare" : "panel",
                    );
                    _onChange();
                }),
            );
        }

        controls.appendChild(
            makeBtn(t("sr8_delete"), SVG.trash, () => {
                if (confirm(t("sr8_delete_element_confirm"))) deleteSection(root);
            }),
        );
        root.appendChild(controls);
    }

    // ── Content per kind ──
    if (kind === "header") {
        const level = LEVELS.includes(data.level) ? data.level : "h2";
        applyLevel(root, level);
        const lvlTextBtn = root.querySelector(".section-ctrl-text");
        if (lvlTextBtn) lvlTextBtn.textContent = level.toUpperCase();

        const title = document.createElement("div");
        title.className = "section-title";
        title.dataset.placeholder = t("sr8_ph_heading");
        title.spellcheck = false;
        bindPlainPaste(title);
        title.innerHTML = renderInlineMarkdown(data.text || "");
        root.dataset.text = data.text || "";
        if (canEdit) {
            title.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    title.blur();
                }
            });
            sectionEdit = {
                editables: [title],
                onEnter: () => {
                    title.textContent = root.dataset.text || "";
                },
                onExit: () => {
                    const raw = title.textContent.trim();
                    root.dataset.text = raw;
                    title.innerHTML = renderInlineMarkdown(raw);
                    _onChange();
                },
            };
        }
        root.appendChild(title);
    } else if (kind === "stepheader") {
        applyAlign(root, ALIGNS.includes(data.align) ? data.align : "left");
        if (!ALIGNS.includes(data.align)) delete root.dataset.align;
        root.dataset.number = String(clampStepNumber(data.number ?? 1));

        const badge = document.createElement("div");
        badge.className = "stepheader-num";
        badge.textContent = root.dataset.number;

        const title = document.createElement("div");
        title.className = "stepheader-title";
        title.dataset.placeholder = t("sr8_ph_step_title");
        title.spellcheck = false;
        bindPlainPaste(title);
        title.innerHTML = renderInlineMarkdown(data.text || "");
        root.dataset.text = data.text || "";

        if (canEdit) {
            const enterBlur = (el) =>
                el.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        el.blur();
                    }
                });
            enterBlur(badge);
            enterBlur(title);
            sectionEdit = {
                editables: [badge, title],
                onEnter: () => {
                    badge.textContent = root.dataset.number;
                    title.textContent = root.dataset.text || "";
                },
                onExit: () => {
                    root.dataset.number = String(
                        clampStepNumber(badge.textContent),
                    );
                    badge.textContent = root.dataset.number;
                    const raw = title.textContent.trim();
                    root.dataset.text = raw;
                    title.innerHTML = renderInlineMarkdown(raw);
                    _onChange();
                },
            };
        }
        root.append(badge, title);
    } else if (kind === "arrow") {
        applyArrowDir(root, data.direction);
        const glyph = document.createElement("div");
        glyph.className = "arrow-glyph";
        glyph.innerHTML = SVG.arrow;
        root.appendChild(glyph);
    } else if (kind === "text") {
        const body = makeEditable(
            root,
            "section-body",
            data.content,
            t("sr8_ph_write_text"),
            true,
        );
        root.appendChild(body);
        if (canEdit) sectionEdit = bodyEditConfig(root, body, true);
    } else if (kind === "callout") {
        const variant = CALLOUT_VARIANTS.includes(data.variant)
            ? data.variant
            : "info";
        const icon = document.createElement("div");
        icon.className = "callout-icon";
        calloutIcon = icon;
        applyVariant(root, variant, icon);
        const varTextBtn = root.querySelector(".section-ctrl-text");
        if (varTextBtn) varTextBtn.textContent = variant.toUpperCase();

        root.appendChild(icon);
        const calloutBody = makeEditable(
            root,
            "callout-body",
            data.content,
            t("sr8_ph_callout_text"),
            true,
        );
        root.appendChild(calloutBody);
        if (canEdit) sectionEdit = bodyEditConfig(root, calloutBody, true);
    } else if (kind === "code") {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "code-copy-btn";
        copyBtn.title = t("sr8_copy");
        copyBtn.innerHTML = SVG.copy;
        copyBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const code = root.querySelector(".code-body")?.textContent || "";
            try {
                await navigator.clipboard.writeText(code);
                copyBtn.classList.add("copied");
                setTimeout(() => copyBtn.classList.remove("copied"), 1200);
            } catch {
                // Clipboard access can be absent or denied in a public reader.
                copyBtn.classList.remove("copied");
            }
        });
        root.appendChild(copyBtn);
        const codeBody = makeEditable(
            root,
            "code-body",
            data.content,
            t("sr8_ph_code"),
            false,
        );
        root.appendChild(codeBody);
        if (canEdit) sectionEdit = bodyEditConfig(root, codeBody, false);
    } else if (kind === "steps") {
        const ol = document.createElement("ol");
        ol.className = "steps-list";
        const lines = (data.content || "").split("\n");
        const steps = lines.some((l) => l.trim()) ? lines : [""];
        steps.forEach((s) => {
            const li = document.createElement("li");
            // Render inline markdown in read-only views; keep raw text editable.
            if (canEdit) li.textContent = s;
            else li.innerHTML = renderInlineMarkdown(s);
            ol.appendChild(li);
        });
        if (canEdit) {
            ol.contentEditable = "true";
            ol.spellcheck = false;
            bindPlainPaste(ol);
            ol.addEventListener("blur", () => {
                root.dataset.content = Array.from(ol.querySelectorAll("li"))
                    .map((li) => li.textContent)
                    .join("\n");
                _onChange();
            });
        }
        root.dataset.content = data.content || "";
        root.appendChild(ol);
    } else if (kind === "image") {
        root.dataset.src = sanitizeImgUrl(data.src || "") || "";
        applyFit(root, data.fit);
        const fitBtn = root.querySelector(".section-ctrl-text");
        if (fitBtn)
            fitBtn.textContent = (root.dataset.fit || "cover").toUpperCase();
        renderImageInto(root, root, canEdit);
    } else if (kind === "profile") {
        root.dataset.avatar = data.avatar || "preset:a1";
        root.dataset.text = data.text || "";
        root.dataset.content = data.content || "";

        const avatarBox = document.createElement("div");
        avatarBox.className = "profile-avatar";
        if (canEdit) {
            avatarBox.classList.add("editable");
            avatarBox.title = t("sr8_change_avatar");
            avatarBox.addEventListener("click", (e) => {
                e.stopPropagation();
                openAvatarPicker(root);
            });
        }
        root.appendChild(avatarBox);
        renderAvatar(root);

        const info = document.createElement("div");
        info.className = "profile-info";
        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = data.text || "";
        const bio = document.createElement("div");
        bio.className = "profile-bio";
        bio.textContent = data.content || "";
        if (canEdit) {
            name.contentEditable = "true";
            name.spellcheck = false;
            name.dataset.placeholder = t("sr8_ph_name");
            bindPlainPaste(name);
            name.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    name.blur();
                }
            });
            name.addEventListener("blur", () => {
                root.dataset.text = name.textContent.trim();
                _onChange();
            });
            bio.contentEditable = "true";
            bio.spellcheck = false;
            bio.dataset.placeholder = t("sr8_ph_short_bio");
            bindPlainPaste(bio);
            bio.addEventListener("blur", () => {
                root.dataset.content = bio.textContent;
                _onChange();
            });
        }
        info.append(name, bio);
        root.appendChild(info);
    } else if (kind === "linkcard") {
        root.dataset.src = sanitizeImgUrl(data.src || "") || "";
        root.dataset.url = sanitizeImgUrl(data.url || "") || "";
        root.dataset.text = data.text || "";
        root.dataset.content = data.content || "";
        root.classList.add("section-surface-panel");

        const thumb = document.createElement("div");
        thumb.className = "linkcard-thumb";
        const body = document.createElement("div");
        body.className = "linkcard-body";
        const title = document.createElement("div");
        title.className = "linkcard-title";
        title.textContent = data.text || "";
        const desc = document.createElement("div");
        desc.className = "linkcard-desc";
        desc.textContent = data.content || "";
        body.append(title, desc);

        // Link/host row: favicon + host in display mode, URL input in edit mode.
        const linkRow = document.createElement("div");
        linkRow.className = "linkcard-url-row";
        const renderLinkRow = (editing) => {
            linkRow.innerHTML = "";
            const url = root.dataset.url;
            if (editing && canEdit) {
                const input = document.createElement("input");
                input.type = "url";
                input.className = "linkcard-url-input";
                input.placeholder = t("sr8_ph_link_url");
                input.value = root.dataset.url || "";
                const save = () => {
                    const u = sanitizeImgUrl(input.value);
                    if (input.value.trim() && !u) {
                        input.classList.add("invalid");
                        return;
                    }
                    root.dataset.url = u || "";
                    _onChange();
                };
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        input.blur();
                    }
                });
                input.addEventListener("blur", save);
                input.addEventListener("input", () =>
                    input.classList.remove("invalid"),
                );
                linkRow.appendChild(input);
            } else if (url) {
                const meta = document.createElement("span");
                meta.className = "linkcard-link-meta";
                const fav = linkcardFavIcon(url);
                fav.alt = "";
                const host = document.createElement("span");
                host.className = "linkcard-host";
                host.textContent = hostOf(url) || url;
                meta.append(fav, host);
                linkRow.appendChild(meta);
            }
        };

        renderImageInto(thumb, root, canEdit);
        title.dataset.placeholder = t("sr8_ph_title");
        desc.dataset.placeholder = t("sr8_ph_description");

        if (canEdit) {
            title.spellcheck = false;
            bindPlainPaste(title);
            title.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    title.blur();
                }
            });
            desc.spellcheck = false;
            bindPlainPaste(desc);
            renderLinkRow(false);
            body.appendChild(linkRow);
            root.append(thumb, body);
            sectionEdit = {
                editables: [title, desc],
                onEnter: () => renderLinkRow(true),
                onExit: () => {
                    root.dataset.text = title.textContent.trim();
                    root.dataset.content = desc.textContent;
                    renderLinkRow(false);
                    _onChange();
                },
                open: () => openTarget(root.dataset.url),
            };
        } else {
            // Read-only (public reader): the whole card is a link.
            const meta = document.createElement("div");
            meta.className = "linkcard-link-meta";
            if (root.dataset.url) {
                const fav = linkcardFavIcon(root.dataset.url);
                const h = document.createElement("span");
                h.className = "linkcard-host";
                h.textContent = hostOf(root.dataset.url);
                meta.append(fav, h);
            }
            body.appendChild(meta);
            const a = document.createElement("a");
            a.className = "linkcard-link";
            a.href = root.dataset.url || "#";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.append(thumb, body);
            root.appendChild(a);
        }
    } else if (kind === "file") {
        root.dataset.url = sanitizeImgUrl(data.url || "") || "";
        root.dataset.text = data.text || "";
        applyFileKind(
            root,
            data.filekind || detectFileKind(root.dataset.url) || "generic",
        );
        root.classList.add("section-surface-panel");
        const typeTextBtn = root.querySelector(".section-ctrl-text");
        if (typeTextBtn)
            typeTextBtn.textContent =
                FILE_KIND_META[root.dataset.filekind].label;

        const icon = document.createElement("div");
        icon.className = "file-icon";
        icon.innerHTML = SVG.file;

        const info = document.createElement("div");
        info.className = "file-info";
        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = data.text || fileNameFromUrl(root.dataset.url) || "";
        const meta = document.createElement("div");
        meta.className = "file-meta";
        const kindLabel = document.createElement("span");
        kindLabel.className = "file-kind-label";
        kindLabel.textContent = FILE_KIND_META[root.dataset.filekind].label;
        const host = document.createElement("span");
        host.className = "file-host";
        info.append(name, meta);
        meta.append(kindLabel, host);

        const refreshMeta = () => {
            host.textContent = root.dataset.url ? hostOf(root.dataset.url) : "";
            kindLabel.textContent = FILE_KIND_META[root.dataset.filekind].label;
        };

        // URL set-row: input when empty, host + pencil once set.
        const linkRow = document.createElement("div");
        linkRow.className = "file-url-row";
        const renderLinkRow = (editing) => {
            linkRow.innerHTML = "";
            if (!editing || !canEdit) return;
            const input = document.createElement("input");
            input.type = "url";
            input.className = "file-url-input";
            input.placeholder = t("sr8_ph_file_url");
            input.value = root.dataset.url || "";
            const save = () => {
                const u = sanitizeImgUrl(input.value);
                if (input.value.trim() && !u) {
                    input.classList.add("invalid");
                    return;
                }
                root.dataset.url = u || "";
                if (u) {
                    if (
                        !root.dataset.filekind ||
                        root.dataset.filekind === "generic"
                    )
                        applyFileKind(root, detectFileKind(u));
                    if (!name.textContent.trim()) {
                        const fn = fileNameFromUrl(u);
                        if (fn) {
                            name.textContent = fn;
                            root.dataset.text = fn;
                        }
                    }
                }
                refreshMeta();
                _onChange();
            };
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    input.blur();
                }
            });
            input.addEventListener("blur", save);
            input.addEventListener("input", () =>
                input.classList.remove("invalid"),
            );
            linkRow.appendChild(input);
        };

        refreshMeta();

        if (canEdit) {
            name.spellcheck = false;
            name.dataset.placeholder = t("sr8_ph_file_name");
            bindPlainPaste(name);
            name.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    name.blur();
                }
            });
            const openIcon = document.createElement("span");
            openIcon.className = "file-open-icon";
            openIcon.innerHTML = SVG.open;
            info.appendChild(linkRow);
            root.classList.add("file-card");
            root.append(icon, info, openIcon);
            sectionEdit = {
                editables: [name],
                onEnter: () => renderLinkRow(true),
                onExit: () => {
                    root.dataset.text = name.textContent.trim();
                    renderLinkRow(false);
                    refreshMeta();
                    _onChange();
                },
                open: () => openNewTab(root.dataset.url),
            };
        } else {
            // Read-only: the whole card is a new-tab link to the file.
            const a = document.createElement("a");
            a.className = "file-link";
            a.href = root.dataset.url || "#";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            const openIcon = document.createElement("span");
            openIcon.className = "file-open-icon";
            openIcon.innerHTML = SVG.open;
            a.append(icon, info, openIcon);
            root.appendChild(a);
        }
    } else {
        // divider
        applyThickness(root, data.thickness);
        const line = document.createElement("div");
        line.className = "section-line";
        root.appendChild(line);
    }

    if (canEdit && sectionEdit && editControls) {
        attachSectionEdit(root, editControls, sectionEdit);
    }

    return root;
};
