// Routine steps editor — a self-contained component mounted into a host element
// inside both the top-level widget drawer and the in-group item modal.
// It manages an in-memory steps[] array and a stagger value; the host modal
// reads them back on save via getSteps()/getStagger().
//
// Each added step renders as a STATIC chip (kind tag + summary) that can be
// reordered by drag-and-drop and removed — it is not edited inline. New steps
// are built in a small composer, or added straight from existing board items.
//
// Phase 1 step kinds (no companion required):
//   url       → open a URL in a new tab        ({ kind, label, url })
//   app       → launch an app via URI scheme   ({ kind, label, target })
//   clipboard → copy text to the clipboard     ({ kind, label, content })
//   workspace → switch to a workspace          ({ kind, label, workspaceId })
//   delay     → wait N milliseconds            ({ kind, label, ms })

import { t } from "../i18n.js";
import {
    getWorkspacesData,
    workspaceNames,
} from "../workspaces/workspace-state.js";

// Label/tag text is resolved via i18n keys at use-time (this const is built at
// module load, before the i18n catalogs finish loading).
const STEP_KINDS = [
    { kind: "url", labelKey: "rse12_kind_url_label", tagKey: "rse12_kind_url_tag" },
    { kind: "app", labelKey: "rse12_kind_app_label", tagKey: "rse12_kind_app_tag" },
    { kind: "file", labelKey: "rse12_kind_file_label", tagKey: "rse12_kind_file_tag", needsCompanion: true },
    { kind: "folder", labelKey: "rse12_kind_folder_label", tagKey: "rse12_kind_folder_tag", needsCompanion: true },
    { kind: "clipboard", labelKey: "rse12_kind_clipboard_label", tagKey: "rse12_kind_clipboard_tag" },
    { kind: "workspace", labelKey: "rse12_kind_workspace_label", tagKey: "rse12_kind_workspace_tag" },
    { kind: "delay", labelKey: "rse12_kind_delay_label", tagKey: "rse12_kind_delay_tag" },
];

// Companion-app status, cached across editors. File/folder steps need it.
// Web build: no companion app exists, so this is always disconnected.
// File/folder step kinds render disabled via `needsCompanion`.
let companionConnected = false;
function pingCompanion(cb) {
    companionConnected = false;
    if (cb) cb(false);
}

const KIND_TAG = Object.fromEntries(STEP_KINDS.map((k) => [k.kind, k.tagKey]));
const KIND_LABEL = Object.fromEntries(STEP_KINDS.map((k) => [k.kind, k.labelKey]));

function workspaceDisplayName(id) {
    return (
        workspaceNames[id] ||
        (id === "default" ? t("rse12_ws_default") : id.replace(/-/g, " "))
    );
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

// Last segment of a Windows or POSIX path, for compact file/folder summaries.
function baseName(path) {
    const parts = String(path).split(/[\\/]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : path;
}

// Human-readable one-liner for a step chip.
function stepSummary(step) {
    if (!step) return t("rse12_summary_step");
    switch (step.kind) {
        case "url":
            return step.url
                ? t("rse12_summary_open_host", [hostnameOf(step.url)])
                : t("rse12_summary_open_url");
        case "app":
            return step.target
                ? t("rse12_summary_launch_target", [step.target])
                : t("rse12_summary_launch_app");
        case "file":
            return step.target
                ? t("rse12_summary_open_file_name", [baseName(step.target)])
                : t("rse12_summary_open_file");
        case "folder":
            return step.target
                ? t("rse12_summary_open_folder_name", [baseName(step.target)])
                : t("rse12_summary_open_folder");
        case "clipboard": {
            const c = (step.content || "").replace(/\s+/g, " ").trim();
            const preview = `${c.slice(0, 40)}${c.length > 40 ? "…" : ""}`;
            return c
                ? t("rse12_summary_copy_text", [preview])
                : t("rse12_summary_copy");
        }
        case "workspace":
            return step.workspaceId
                ? t("rse12_summary_switch_to", [
                      workspaceDisplayName(step.workspaceId),
                  ])
                : t("rse12_summary_switch_workspace");
        case "delay":
            return t("rse12_summary_wait", [(Number(step.ms) || 0) / 1000]);
        default:
            return t("rse12_summary_step");
    }
}

function workspaceOptions() {
    const data = getWorkspacesData();
    const ids = Object.keys(data?.workspaces || {});
    return ids.map((id) => ({ id, name: workspaceDisplayName(id) }));
}

// Gather existing actionable items across all workspaces so a routine step can
// be built from something already on the user's boards.
function collectExistingItems() {
    const data = getWorkspacesData();
    const workspaces = data?.workspaces || {};
    const out = [];
    for (const [wsId, entries] of Object.entries(workspaces)) {
        const wsName = workspaceDisplayName(wsId);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
            if (entry?.type === "link-button" && entry.url) {
                out.push({
                    label: entry.name || entry.url,
                    sub: t("rse12_sub_shortcut", [wsName]),
                    step: { kind: "url", label: entry.name || entry.url, url: entry.url },
                });
            } else if (entry?.type === "clipboard-button") {
                out.push({
                    label: entry.name || t("rse12_label_clipboard"),
                    sub: t("rse12_sub_clipboard", [wsName]),
                    step: {
                        kind: "clipboard",
                        label: entry.name || t("rse12_label_copy"),
                        content: entry.content || "",
                    },
                });
            } else if (entry?.type === "launcher-button") {
                const lk = entry.launcherKind || "app";
                if (lk === "app" || lk === "file" || lk === "folder") {
                    out.push({
                        label: entry.name || entry.target,
                        sub: t("rse12_sub_launcher", [wsName]),
                        step: {
                            kind: lk,
                            label: entry.name || entry.target,
                            target: entry.target || "",
                        },
                    });
                }
            }
            if (Array.isArray(entry?.items)) {
                for (const item of entry.items) {
                    if (item?.type === "link" || (!item?.type && item?.url)) {
                        if (!item.url) continue;
                        out.push({
                            label: item.name || item.url,
                            sub: t("rse12_sub_group", [
                                wsName,
                                entry.name || t("rse12_label_group"),
                            ]),
                            step: {
                                kind: "url",
                                label: item.name || item.url,
                                url: item.url,
                            },
                        });
                    } else if (item?.type === "clipboard") {
                        out.push({
                            label: item.name || t("rse12_label_clipboard"),
                            sub: t("rse12_sub_group", [
                                wsName,
                                entry.name || t("rse12_label_group"),
                            ]),
                            step: {
                                kind: "clipboard",
                                label: item.name || t("rse12_label_copy"),
                                content: item.content || "",
                            },
                        });
                    } else if (item?.type === "launcher") {
                        const lk = item.launcherKind || "app";
                        if (lk === "app" || lk === "file" || lk === "folder") {
                            out.push({
                                label: item.name || item.target,
                                sub: t("rse12_sub_group", [
                                    wsName,
                                    entry.name || t("rse12_label_group"),
                                ]),
                                step: {
                                    kind: lk,
                                    label: item.name || item.target,
                                    target: item.target || "",
                                },
                            });
                        }
                    }
                }
            }
        }
    }
    return out;
}

export function createRoutineStepsEditor(host) {
    let steps = [];
    let dragIndex = null;

    const list = document.createElement("div");
    list.className = "routine-steps-list";

    const composer = document.createElement("div");
    composer.className = "routine-step-composer";
    composer.style.display = "none";

    const controls = document.createElement("div");
    controls.className = "routine-steps-controls";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "routine-add-step-btn";
    addBtn.textContent = t("rse12_add_step_btn");

    const addExistingBtn = document.createElement("button");
    addExistingBtn.type = "button";
    addExistingBtn.className = "routine-add-existing-btn";
    addExistingBtn.textContent = t("rse12_add_from_board");

    controls.append(addBtn, addExistingBtn);

    // Use the app's standard form-field structure so the label sits above
    // the input and both inherit the modal's native styling.
    const staggerRow = document.createElement("div");
    staggerRow.className = "link-form-field routine-stagger-field";
    const staggerLabel = document.createElement("label");
    staggerLabel.textContent = t("rse12_stagger_label");
    const staggerInput = document.createElement("input");
    staggerInput.type = "number";
    staggerInput.min = "0";
    staggerInput.step = "0.1";
    staggerInput.value = "0";
    staggerInput.className = "routine-stagger-input";
    staggerRow.append(staggerLabel, staggerInput);

    host.innerHTML = "";
    host.append(list, composer, controls, staggerRow);

    // ── Static step chips ──────────────────────────────────────────────
    function renderChip(step, index) {
        const chip = document.createElement("div");
        chip.className = "routine-step-chip";
        chip.draggable = true;
        chip.dataset.index = String(index);

        const grip = document.createElement("span");
        grip.className = "routine-step-grip";
        grip.setAttribute("aria-hidden", "true");
        grip.textContent = "⠿";

        const tag = document.createElement("span");
        tag.className = `routine-step-tag routine-step-tag--${step.kind}`;
        tag.textContent = KIND_TAG[step.kind]
            ? t(KIND_TAG[step.kind])
            : t("rse12_tag_step_fallback");

        const summary = document.createElement("span");
        summary.className = "routine-step-summary";
        summary.textContent = stepSummary(step);
        summary.title = summary.textContent;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "routine-step-remove";
        remove.setAttribute("aria-label", t("rse12_remove_step_aria"));
        remove.textContent = "✕";
        remove.addEventListener("click", () => {
            steps.splice(index, 1);
            render();
        });

        chip.append(grip, tag, summary, remove);

        chip.addEventListener("dragstart", (e) => {
            dragIndex = index;
            chip.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            // Firefox requires data to be set for dragging to start.
            try {
                e.dataTransfer.setData("text/plain", String(index));
            } catch {
                /* noop */
            }
        });
        chip.addEventListener("dragend", () => {
            dragIndex = null;
            chip.classList.remove("dragging");
            list.querySelectorAll(".drag-over").forEach((el) =>
                el.classList.remove("drag-over"),
            );
        });
        chip.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragIndex !== null && dragIndex !== index) {
                chip.classList.add("drag-over");
            }
        });
        chip.addEventListener("dragleave", () => {
            chip.classList.remove("drag-over");
        });
        chip.addEventListener("drop", (e) => {
            e.preventDefault();
            chip.classList.remove("drag-over");
            if (dragIndex === null || dragIndex === index) return;
            const [moved] = steps.splice(dragIndex, 1);
            steps.splice(index, 0, moved);
            dragIndex = null;
            render();
        });

        return chip;
    }

    function render() {
        list.innerHTML = "";
        if (steps.length === 0) {
            const empty = document.createElement("div");
            empty.className = "routine-steps-empty";
            empty.textContent = t("rse12_empty_steps");
            list.append(empty);
        }
        steps.forEach((step, i) => list.append(renderChip(step, i)));
    }

    // ── Composer (build one new step, then commit as a chip) ───────────
    function buildComposerValueField(draft) {
        const kind = draft.kind;
        if (kind === "url") {
            const input = document.createElement("input");
            input.type = "url";
            input.placeholder = "https://example.com";
            input.value = draft.url || "";
            input.addEventListener("input", () => (draft.url = input.value));
            return input;
        }
        if (kind === "app") {
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = t("rse12_app_placeholder");
            input.value = draft.target || "";
            input.addEventListener("input", () => (draft.target = input.value));
            return input;
        }
        if (kind === "file" || kind === "folder") {
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder =
                kind === "file"
                    ? t("rse12_file_placeholder")
                    : t("rse12_folder_placeholder");
            input.value = draft.target || "";
            input.addEventListener("input", () => (draft.target = input.value));
            return input;
        }
        if (kind === "clipboard") {
            const input = document.createElement("textarea");
            input.rows = 2;
            input.placeholder = t("rse12_clipboard_placeholder");
            input.value = draft.content || "";
            input.addEventListener("input", () => (draft.content = input.value));
            return input;
        }
        if (kind === "workspace") {
            const select = document.createElement("select");
            for (const ws of workspaceOptions()) {
                const opt = document.createElement("option");
                opt.value = ws.id;
                opt.textContent = ws.name;
                if (ws.id === draft.workspaceId) opt.selected = true;
                select.append(opt);
            }
            if (!draft.workspaceId && select.options.length) {
                draft.workspaceId = select.value;
            }
            select.addEventListener(
                "change",
                () => (draft.workspaceId = select.value),
            );
            return select;
        }
        if (kind === "delay") {
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = "0.5";
            input.placeholder = t("rse12_delay_placeholder");
            input.value = draft.ms != null ? String(draft.ms / 1000) : "";
            input.addEventListener("input", () => {
                draft.ms = Math.round((Number(input.value) || 0) * 1000);
            });
            return input;
        }
        return document.createElement("span");
    }

    function isDraftValid(draft) {
        if (draft.kind === "url") return !!draft.url;
        if (draft.kind === "app") return !!draft.target;
        if (draft.kind === "file" || draft.kind === "folder")
            return !!draft.target;
        if (draft.kind === "clipboard") return !!draft.content;
        if (draft.kind === "workspace") return !!draft.workspaceId;
        if (draft.kind === "delay") return Number(draft.ms) > 0;
        return false;
    }

    function availableKinds() {
        return STEP_KINDS.filter(
            (k) => !k.needsCompanion || companionConnected,
        );
    }

    function openComposer() {
        const draft = { kind: "url" };
        composer.innerHTML = "";

        // Top row: kind + value (+ Browse for file/folder)
        const inputRow = document.createElement("div");
        inputRow.className = "routine-composer-input-row";

        const kindSelect = document.createElement("select");
        kindSelect.className = "routine-composer-kind";

        const valueWrap = document.createElement("div");
        valueWrap.className = "routine-composer-value";

        const browseBtn = document.createElement("button");
        browseBtn.type = "button";
        browseBtn.className = "routine-composer-browse";
        browseBtn.textContent = t("rse12_browse_btn");
        browseBtn.style.display = "none";
        browseBtn.addEventListener("click", () => browseForPath(draft, valueWrap));

        const note = document.createElement("div");
        note.className = "routine-composer-note";
        note.style.display = "none";

        function populateKinds() {
            kindSelect.innerHTML = "";
            for (const k of availableKinds()) {
                const opt = document.createElement("option");
                opt.value = k.kind;
                opt.textContent = t(k.labelKey);
                if (k.kind === draft.kind) opt.selected = true;
                kindSelect.append(opt);
            }
            if (!availableKinds().some((k) => k.kind === draft.kind)) {
                draft.kind = kindSelect.value || "url";
            }
        }

        function syncForKind() {
            valueWrap.innerHTML = "";
            valueWrap.append(buildComposerValueField(draft));
            const isPath = draft.kind === "file" || draft.kind === "folder";
            browseBtn.style.display = isPath ? "" : "none";
            if (isPath && !companionConnected) {
                note.textContent = t("rse12_companion_note");
                note.style.display = "";
            } else {
                note.style.display = "none";
            }
        }

        populateKinds();
        syncForKind();

        kindSelect.addEventListener("change", () => {
            draft.kind = kindSelect.value;
            for (const key of ["url", "target", "content", "workspaceId", "ms"]) {
                delete draft[key];
            }
            syncForKind();
        });

        inputRow.append(kindSelect, valueWrap, browseBtn);

        // Bottom row: actions on their own line
        const actions = document.createElement("div");
        actions.className = "routine-composer-actions";
        const add = document.createElement("button");
        add.type = "button";
        add.className = "routine-composer-add";
        add.textContent = t("rse12_composer_add");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "routine-composer-cancel";
        cancel.textContent = t("rse12_cancel");
        actions.append(cancel, add);

        add.addEventListener("click", () => {
            if (!isDraftValid(draft)) {
                composer.classList.add("routine-composer-invalid");
                return;
            }
            steps.push({ ...draft, label: stepSummary(draft) });
            closeComposer();
            render();
        });
        cancel.addEventListener("click", closeComposer);

        composer.append(inputRow, note, actions);
        composer.style.display = "";
        addBtn.disabled = true;
        kindSelect.focus();

        // Refresh companion status; if it changes availability, rebuild kinds.
        pingCompanion(() => {
            if (composer.style.display === "none") return;
            populateKinds();
            syncForKind();
        });
    }

    function browseForPath(draft, valueWrap) {
        // Web build: no native file picker — file/folder routine steps that
        // need the companion app are unavailable.
        alert(t("rse12_picker_alert"));
    }

    function closeComposer() {
        composer.style.display = "none";
        composer.innerHTML = "";
        composer.classList.remove("routine-composer-invalid");
        addBtn.disabled = false;
    }

    addBtn.addEventListener("click", openComposer);

    // ── "Add from board" — centered modal with live search ─────────────
    let pickerOverlay = null;
    addExistingBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openExistingModal();
    });

    function closeExistingModal() {
        if (!pickerOverlay) return;
        document.removeEventListener("keydown", onPickerKeydown);
        pickerOverlay.remove();
        pickerOverlay = null;
    }

    function onPickerKeydown(e) {
        if (e.key === "Escape") {
            e.stopPropagation();
            closeExistingModal();
        }
    }

    function openExistingModal() {
        if (pickerOverlay) return;
        const items = collectExistingItems();

        const overlay = document.createElement("div");
        overlay.className = "routine-picker-overlay";
        overlay.addEventListener("mousedown", (e) => {
            if (e.target === overlay) closeExistingModal();
        });

        const modal = document.createElement("div");
        modal.className = "routine-picker-modal";

        const header = document.createElement("div");
        header.className = "routine-picker-header";
        const title = document.createElement("h3");
        title.className = "routine-picker-title";
        title.textContent = t("rse12_picker_title");
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "routine-picker-close";
        closeBtn.setAttribute("aria-label", t("rse12_close_aria"));
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", closeExistingModal);
        header.append(title, closeBtn);

        const search = document.createElement("input");
        search.type = "search";
        search.className = "routine-picker-search";
        search.placeholder = t("rse12_picker_search");

        const listEl = document.createElement("div");
        listEl.className = "routine-picker-list";

        function renderList(query) {
            const q = query.trim().toLowerCase();
            listEl.innerHTML = "";
            const matches = items.filter(
                (it) =>
                    !q ||
                    it.label.toLowerCase().includes(q) ||
                    it.sub.toLowerCase().includes(q),
            );
            if (matches.length === 0) {
                const none = document.createElement("div");
                none.className = "routine-picker-empty";
                none.textContent = items.length
                    ? t("rse12_picker_no_matches")
                    : t("rse12_picker_none");
                listEl.append(none);
                return;
            }
            matches.forEach((it) => {
                const row = document.createElement("button");
                row.type = "button";
                row.className = "routine-picker-item";
                const lbl = document.createElement("span");
                lbl.className = "routine-picker-item-label";
                lbl.textContent = it.label;
                const sub = document.createElement("span");
                sub.className = "routine-picker-item-sub";
                sub.textContent = it.sub;
                const add = document.createElement("span");
                add.className = "routine-picker-item-add";
                add.textContent = t("rse12_picker_add");
                row.append(lbl, sub, add);
                row.addEventListener("click", () => {
                    steps.push({ ...it.step });
                    render();
                    add.textContent = t("rse12_picker_added");
                    row.classList.add("added");
                    setTimeout(() => {
                        add.textContent = t("rse12_picker_add");
                        row.classList.remove("added");
                    }, 900);
                });
                listEl.append(row);
            });
        }

        search.addEventListener("input", () => renderList(search.value));
        renderList("");

        modal.append(header, search, listEl);
        overlay.append(modal);
        document.body.append(overlay);
        pickerOverlay = overlay;
        document.addEventListener("keydown", onPickerKeydown);
        search.focus();
    }

    render();
    pingCompanion();

    return {
        setSteps(arr) {
            steps = Array.isArray(arr) ? arr.map((s) => ({ ...s })) : [];
            closeComposer();
            render();
        },
        getSteps() {
            return steps
                .filter((s) => isDraftValid(s))
                .map((s) => ({ ...s, label: s.label || stepSummary(s) }));
        },
        setStagger(ms) {
            staggerInput.value =
                ms != null ? String((Number(ms) || 0) / 1000) : "0";
        },
        getStagger() {
            return Math.round((Number(staggerInput.value) || 0) * 1000);
        },
    };
}

// Shared lazily-mounted singletons, one per modal host, so the field-toggle
// code and the load/save code (in different modules) share one instance.
let sharedGroupEditor = null;
let sharedItemEditor = null;

export function getGroupRoutineEditor() {
    if (!sharedGroupEditor) {
        const host = document.getElementById("group-routine-steps-host");
        if (host) sharedGroupEditor = createRoutineStepsEditor(host);
    }
    return sharedGroupEditor;
}

export function getItemRoutineEditor() {
    if (!sharedItemEditor) {
        const host = document.getElementById("routine-steps-host");
        if (host) sharedItemEditor = createRoutineStepsEditor(host);
    }
    return sharedItemEditor;
}

export { KIND_LABEL, stepSummary };
