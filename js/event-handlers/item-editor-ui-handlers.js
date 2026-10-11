import {
    addLinkButton,
    getCurrentGroup,
    getLinkIndex,
    getLinkMode,
    itemTypeSelect,
    linkBackdrop,
    linkCloseButton,
    linkIconFields,
    linkInput,
    linkUrlFields,
    svgInput,
    urlInput,
} from "../variables.js";
import { getItemRoutineEditor } from "./routine-steps-editor.js";
import { renderStoredIcon } from "../safe-svg.js";
import { getNameFromUrl } from "../untrusted-input.js";
import { CLIPBOARD_DEFAULT_ICON_SVG } from "../dom-manager/link-item-renderer.js";
import { autofetchFaviconIntoPicker } from "../icon-picker.js";
import { t } from "../i18n.js";

// ── Edit state capture / revert ──────────────────────────────────────────────

let _capturedState = null;

const LINK_PICKER_OPTIONS = {
    key: "link",
    rootId: "link",
};

function _getLinkAutofetchElements() {
    return {
        toggleCard: document.getElementById("link-autofetch-icon-card"),
        toggle: document.getElementById("link-autofetch-icon-toggle"),
        manualControls: document.getElementById("link-manual-icon-controls"),
        clearBtn: document.getElementById("clear-icon-btn"),
        stripRow: document.getElementById("link-strip-icon-row"),
    };
}

function _syncLinkAutofetchUi() {
    const { toggleCard, toggle, manualControls, clearBtn, stripRow } =
        _getLinkAutofetchElements();
    const type = itemTypeSelect?.value || "link";
    // Favicon autofetch applies to links in both add and edit mode. The toggle's
    // initial state is set by the open handlers (off when editing a custom icon).
    const eligible = type === "link";
    const autofetchEnabled = eligible && !!toggle?.checked;

    if (toggleCard) toggleCard.style.display = eligible ? "" : "none";
    if (manualControls)
        manualControls.style.display = autofetchEnabled ? "none" : "";
    if (clearBtn) clearBtn.style.display = autofetchEnabled ? "none" : "";
    if (stripRow) stripRow.style.display = autofetchEnabled ? "none" : "";

    // When autofetch turns off we deliberately keep whatever icon is currently
    // selected (the fetched favicon or the original custom icon) as a starting
    // point — the user can change or clear it manually via the picker.
    if (autofetchEnabled) {
        autofetchFaviconIntoPicker(urlInput?.value || "", LINK_PICKER_OPTIONS);
    }
}

function _getEditTarget() {
    if (getLinkMode() !== "edit") return null;
    const groupName = getCurrentGroup();
    const itemY = String(getLinkIndex());
    const groupItemEl = document.querySelector(
        `.item[data-name="${CSS.escape(groupName)}"]`,
    );
    if (!groupItemEl) return null;
    return (
        groupItemEl.querySelector(
            `.link-widget-content[data-item-y="${CSS.escape(itemY)}"]`,
        ) ?? null
    );
}

export const captureEditState = () => {
    const el = _getEditTarget();
    if (!el) {
        _capturedState = null;
        return;
    }
    const iconEl = el.querySelector(".icon");
    // Snapshot every value the live-preview handlers mutate: the data-*
    // attributes are what grid-state.js serializes, so anything previewed but
    // not restored here gets persisted by the next save even after Cancel.
    _capturedState = {
        el,
        name: el.dataset.name,
        url: el.dataset.url,
        iconColor: el.dataset.iconColor,
        href: el.querySelector("a")?.getAttribute("href") ?? null,
        iconValue: el.dataset.icon ?? "",
        iconOverride: iconEl?.style.getPropertyValue("--icon-override") ?? "",
        linkColor: el.style.getPropertyValue("--link-color") ?? "",
    };
};

const _restoreDataAttr = (el, key, value) => {
    if (value === undefined) delete el.dataset[key];
    else el.dataset[key] = value;
};

// Clipboard items with no stored icon still RENDER a default glyph (accent
// clipboard). "No icon data" must therefore restore that default, not strip
// the icon element — both the live-preview and cancel paths use this.
const restoreDefaultTypeIcon = (el, iconEl) => {
    if ((el.dataset.type || "link") !== "clipboard") return false;
    let target = iconEl;
    if (!target) {
        target = document.createElement("span");
        target.classList.add("icon");
        const parent = el.querySelector(".clipboard-row") || el;
        parent.insertBefore(target, parent.firstChild);
    }
    target.classList.add("clipboard-type-icon");
    target.style.removeProperty("--icon-override");
    target.innerHTML = CLIPBOARD_DEFAULT_ICON_SVG;
    return true;
};

export const revertLinkEditState = () => {
    if (!_capturedState) return;
    const { el, name, url, iconColor, href, iconValue, iconOverride, linkColor } =
        _capturedState;

    _restoreDataAttr(el, "name", name);
    _restoreDataAttr(el, "url", url);
    _restoreDataAttr(el, "iconColor", iconColor);
    el.dataset.icon = iconValue;

    const type = el.dataset.type || "link";
    const textSelector =
        type === "header"
            ? ".item-header-text"
            : type === "text" || type === "note"
              ? ".item-note-text"
              : ".link-text";
    const textEl = el.querySelector(textSelector);
    if (textEl && name !== undefined) textEl.textContent = name;

    const anchor = el.querySelector("a");
    if (anchor && href !== null) anchor.setAttribute("href", href);

    let iconEl = el.querySelector(".icon");

    if (!iconValue) {
        if (restoreDefaultTypeIcon(el, iconEl)) {
            // No icon but a stored color: colored default, not accent default.
            const restored = el.querySelector(".icon");
            if (iconOverride && restored) {
                restored.style.setProperty("--icon-override", iconOverride);
                restored.classList.remove("clipboard-type-icon");
            }
        } else if (iconEl) {
            iconEl.remove();
        }
    } else {
        if (!iconEl) {
            iconEl = document.createElement("span");
            iconEl.classList.add("icon");
            const parent =
                el.querySelector(".clipboard-row, .launcher-row") ||
                el.querySelector("a") ||
                el;
            parent.insertBefore(iconEl, parent.firstChild);
        }
        iconEl.classList.remove("clipboard-type-icon");

        renderStoredIcon(iconEl, iconValue, {
            imgWidth: 16,
            imgHeight: 16,
        });

        if (iconOverride)
            iconEl.style.setProperty("--icon-override", iconOverride);
        else iconEl.style.removeProperty("--icon-override");
    }

    if (linkColor) el.style.setProperty("--link-color", linkColor);
    else el.style.removeProperty("--link-color");
    _capturedState = null;
};

export const clearCapturedState = () => {
    _capturedState = null;
};

// ── Main init ────────────────────────────────────────────────────────────────

export const initItemEditorUiHandlers = () => {
    if (linkBackdrop) {
        linkBackdrop.addEventListener("click", (event) => {
            if (event.target === linkBackdrop) {
                linkCloseButton.click();
            }
        });
    }

    const linkHeaderFields = document.getElementById("link-header-fields");
    if (itemTypeSelect) {
        itemTypeSelect.addEventListener("change", function onItemTypeChange() {
            const type = this.value;
            const nameLabel = document.getElementById("label-link-name");
            const showName = type !== "divider";
            const showUrl = type === "link";
            const showIcon =
                type === "link" ||
                type === "launcher" ||
                type === "routine" ||
                type === "clipboard";
            const showHeaderOpts = type === "header";
            const showColorSection =
                type === "link" ||
                type === "divider" ||
                type === "launcher" ||
                type === "routine" ||
                type === "clipboard";
            const showTextColorOverride = type === "link";
            const showTextStyle = type === "text";
            const showClipboardContent = type === "clipboard";
            const showLauncherFields = type === "launcher";
            const showRoutineFields = type === "routine";
            const showTodoCompleted = type === "todo";

            const nameField = document.getElementById("link-name-field");
            if (nameField) nameField.style.display = showName ? "" : "none";

            const generalSection = document.getElementById(
                "link-general-section",
            );
            if (generalSection)
                generalSection.style.display = type === "divider" ? "none" : "";
            if (linkHeaderFields)
                linkHeaderFields.style.display = showHeaderOpts ? "" : "none";
            if (linkUrlFields)
                linkUrlFields.style.display = showUrl ? "" : "none";
            if (linkIconFields)
                linkIconFields.style.display = showIcon ? "" : "none";

            _syncLinkAutofetchUi();

            const iconColorRow = document.getElementById("icon-color-row");
            const iconColorLabelEl =
                document.getElementById("icon-color-label");
            const linkColorSection =
                document.getElementById("link-color-section");
            if (iconColorRow)
                iconColorRow.style.display = showColorSection ? "" : "none";
            if (iconColorLabelEl)
                iconColorLabelEl.textContent =
                    type === "divider"
                        ? t("ieuh11_divider_color")
                        : t("ieuh11_icon_color");

            const linkTextColorRow = document.getElementById(
                "link-text-color-row",
            );
            if (linkTextColorRow)
                linkTextColorRow.style.display = showTextColorOverride
                    ? ""
                    : "none";
            if (linkColorSection)
                linkColorSection.style.display =
                    showColorSection || showTextColorOverride ? "" : "none";

            const descField = document.getElementById("link-description-field");
            if (descField)
                descField.style.display = type === "link" ? "" : "none";

            const targetOverrideField = document.getElementById(
                "link-target-override-field",
            );
            if (targetOverrideField)
                targetOverrideField.style.display =
                    type === "link" ? "" : "none";

            const resetAllBtn = document.getElementById("link-reset-all-btn");
            if (resetAllBtn)
                resetAllBtn.style.display = type === "link" ? "" : "none";

            const textStyleRow = document.getElementById("text-style-row");
            if (textStyleRow)
                textStyleRow.style.display = showTextStyle ? "" : "none";

            const clipboardContentField = document.getElementById(
                "clipboard-content-field",
            );
            if (clipboardContentField)
                clipboardContentField.style.display = showClipboardContent
                    ? ""
                    : "none";

            const todoCompletedField = document.getElementById(
                "todo-completed-field",
            );
            if (todoCompletedField)
                todoCompletedField.style.display = showTodoCompleted
                    ? ""
                    : "none";

            const launcherFields = document.getElementById("launcher-fields");
            if (launcherFields)
                launcherFields.style.display = showLauncherFields ? "" : "none";

            const routineFields = document.getElementById("routine-fields");
            if (routineFields) {
                routineFields.style.display = showRoutineFields ? "" : "none";
                if (showRoutineFields) getItemRoutineEditor();
            }

            if (linkInput) {
                if (type === "header")
                    linkInput.placeholder = t("ieuh11_ph_section_title");
                else if (type === "note" || type === "text")
                    linkInput.placeholder = t("ieuh11_ph_text_content");
                else if (type === "todo")
                    linkInput.placeholder = t("ieuh11_ph_task");
                else if (type === "clipboard")
                    linkInput.placeholder = t("ieuh11_ph_label");
                else if (type === "launcher")
                    linkInput.placeholder = t("ieuh11_ph_name");
                else linkInput.placeholder = t("ieuh11_ph_name");
            }

            if (nameLabel) {
                if (type === "todo")
                    nameLabel.textContent = t("ieuh11_label_task");
                else if (type === "header")
                    nameLabel.textContent = t("ieuh11_label_title");
                else nameLabel.textContent = t("ieuh11_label_name");
            }

            if (getLinkMode() === "new") {
                const labels = {
                    link: t("ieuh11_add_link"),
                    header: t("ieuh11_add_header"),
                    divider: t("ieuh11_add_divider"),
                    note: t("ieuh11_add_note"),
                    text: t("ieuh11_add_text"),
                    todo: t("ieuh11_add_todo"),
                    clipboard: t("ieuh11_add_clipboard"),
                    launcher: t("ieuh11_add_launcher"),
                };
                addLinkButton.innerHTML = labels[type] || t("ieuh11_add_item");
            }
        });
    }

    document.querySelectorAll(".header-align-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".header-align-btn")
                .forEach((button) => button.classList.remove("active"));
            btn.classList.add("active");
            const alignInput = document.getElementById("header-align");
            if (alignInput) alignInput.value = btn.dataset.align;
        });
    });

    document.querySelectorAll(".launcher-example-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = document.getElementById("launcher-target");
            if (!target) return;
            target.value = btn.dataset.uri;
            target.focus();
        });
    });

    const launcherKindEl = document.getElementById("launcher-kind");
    const launcherTargetLabelEl = document.getElementById(
        "launcher-target-label",
    );
    const launcherBrowseBtn = document.getElementById("launcher-browse-btn");
    const launcherPsRowEl = document.getElementById("launcher-ps-row");
    const launcherExamplesEl = document.querySelector(".launcher-examples");
    const launcherTargetEl = document.getElementById("launcher-target");

    if (launcherKindEl) {
        launcherKindEl.addEventListener(
            "change",
            function onLauncherKindChange() {
                const kind = this.value;
                const isApp = kind === "app";
                const isFolder = kind === "folder";
                const isFile = kind === "file";
                const isPs = kind === "powershell";

                if (launcherTargetLabelEl) {
                    launcherTargetLabelEl.textContent = isPs
                        ? t("ieuh11_launcher_command")
                        : isApp
                          ? t("ieuh11_launcher_target_uri")
                          : t("ieuh11_launcher_path");
                }

                if (launcherTargetEl) {
                    if (isFolder)
                        launcherTargetEl.placeholder =
                            "C:\\Users\\you\\Projects";
                    else if (isFile)
                        launcherTargetEl.placeholder =
                            "C:\\Users\\you\\document.pdf";
                    else if (isPs)
                        launcherTargetEl.placeholder =
                            "/path/to/script.sh --flag";
                    else
                        launcherTargetEl.placeholder =
                            "vscode://file/C:/Projects/myapp";
                }

                if (launcherBrowseBtn)
                    launcherBrowseBtn.style.display =
                        isFolder || isFile ? "" : "none";
                if (launcherPsRowEl)
                    launcherPsRowEl.style.display = isPs ? "" : "none";
                if (launcherExamplesEl)
                    launcherExamplesEl.style.display = isApp ? "" : "none";
            },
        );
    }

    if (launcherBrowseBtn) {
        launcherBrowseBtn.addEventListener("click", () => {
            // Web build: no native file picker (needed the companion app).
            alert(t("ieuh11_picker_failed"));
        });
    }

    document.querySelectorAll(".text-style-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".text-style-btn")
                .forEach((button) => button.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // ── Color helpers ────────────────────────────────────────────────────────────
    function _buildColorVal(hex, alphaInt) {
        const a = alphaInt / 100;
        if (a >= 1) return hex;
        const r = parseInt(hex.slice(1, 3), 16),
            g = parseInt(hex.slice(3, 5), 16),
            b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${+a.toFixed(2)})`;
    }

    // ── Icon color ────────────────────────────────────────────────────────────────
    const iconColorValueInput = document.getElementById("icon-color-value");
    const iconColorPickerEl = document.getElementById("icon-color-picker");
    const iconColorAlpha = document.getElementById("icon-color-alpha");
    const iconColorAlphaLabel = document.getElementById(
        "icon-color-alpha-label",
    );
    const iconColorResetBtn = document.getElementById("icon-color-reset");

    function _livePreviewIconColor(color) {
        const el = _getEditTarget();
        if (!el) return;
        const iconEl = el.querySelector(".icon");
        if (!iconEl) return;
        if (color) iconEl.style.setProperty("--icon-override", color);
        else iconEl.style.removeProperty("--icon-override");
        // The clipboard default's accent rule outranks --icon-override; drop
        // the class while a color is chosen, restore it when cleared.
        if ((el.dataset.type || "link") === "clipboard" && !el.dataset.icon) {
            iconEl.classList.toggle("clipboard-type-icon", !color);
        }
        el.dataset.iconColor = color;
    }

    function _onIconColorChange() {
        const val = _buildColorVal(
            iconColorPickerEl?.value || "#888888",
            +(iconColorAlpha?.value ?? 100),
        );
        if (iconColorValueInput) iconColorValueInput.value = val;
        if (iconColorAlphaLabel)
            iconColorAlphaLabel.textContent = `${iconColorAlpha?.value ?? 100}%`;
        _livePreviewIconColor(val);
    }
    if (iconColorPickerEl)
        iconColorPickerEl.addEventListener("input", _onIconColorChange);
    if (iconColorAlpha)
        iconColorAlpha.addEventListener("input", _onIconColorChange);
    if (iconColorResetBtn) {
        iconColorResetBtn.addEventListener("click", () => {
            if (iconColorValueInput) iconColorValueInput.value = "";
            if (iconColorPickerEl) iconColorPickerEl.value = "#888888";
            if (iconColorAlpha) iconColorAlpha.value = "100";
            if (iconColorAlphaLabel) iconColorAlphaLabel.textContent = "100%";
            _livePreviewIconColor("");
        });
    }

    // ── Text color ────────────────────────────────────────────────────────────────
    const linkStyleTextColor = document.getElementById("link-style-text-color");
    const linkStyleTextAlpha = document.getElementById("link-style-text-alpha");
    const linkStyleTextAlphaLabel = document.getElementById(
        "link-style-text-alpha-label",
    );
    const linkStyleTextValue = document.getElementById("link-style-text-value");
    const linkStyleTextReset = document.getElementById("link-style-text-reset");

    function _livePreviewTextColor(color) {
        const el = _getEditTarget();
        if (!el) return;
        if (color) el.style.setProperty("--link-color", color);
        else el.style.removeProperty("--link-color");
    }

    function _onLinkTextColorChange() {
        const val = _buildColorVal(
            linkStyleTextColor?.value || "#888888",
            +(linkStyleTextAlpha?.value ?? 100),
        );
        if (linkStyleTextValue) linkStyleTextValue.value = val;
        if (linkStyleTextAlphaLabel)
            linkStyleTextAlphaLabel.textContent = `${linkStyleTextAlpha?.value ?? 100}%`;
        _livePreviewTextColor(val);
    }
    if (linkStyleTextColor)
        linkStyleTextColor.addEventListener("input", _onLinkTextColorChange);
    if (linkStyleTextAlpha)
        linkStyleTextAlpha.addEventListener("input", _onLinkTextColorChange);
    if (linkStyleTextReset) {
        linkStyleTextReset.addEventListener("click", () => {
            if (linkStyleTextValue) linkStyleTextValue.value = "";
            if (linkStyleTextColor) linkStyleTextColor.value = "#888888";
            if (linkStyleTextAlpha) linkStyleTextAlpha.value = "100";
            if (linkStyleTextAlphaLabel)
                linkStyleTextAlphaLabel.textContent = "100%";
            _livePreviewTextColor("");
        });
    }

    // ── Reset all overrides ───────────────────────────────────────────────────────
    const resetAllBtn = document.getElementById("link-reset-all-btn");
    if (resetAllBtn) {
        resetAllBtn.addEventListener("click", () => {
            if (iconColorValueInput) iconColorValueInput.value = "";
            if (iconColorPickerEl) iconColorPickerEl.value = "#888888";
            if (iconColorAlpha) iconColorAlpha.value = "100";
            if (iconColorAlphaLabel) iconColorAlphaLabel.textContent = "100%";
            _livePreviewIconColor("");

            if (linkStyleTextValue) linkStyleTextValue.value = "";
            if (linkStyleTextColor) linkStyleTextColor.value = "#888888";
            if (linkStyleTextAlpha) linkStyleTextAlpha.value = "100";
            if (linkStyleTextAlphaLabel)
                linkStyleTextAlphaLabel.textContent = "100%";
            _livePreviewTextColor("");
        });
    }

    // ── Live preview — reflect changes immediately in the rendered link ──────────

    if (linkInput) {
        linkInput.addEventListener("input", () => {
            const el = _getEditTarget();
            if (!el) return;
            const type = el.dataset.type || "link";
            const selector =
                type === "header"
                    ? ".item-header-text"
                    : type === "text" || type === "note"
                      ? ".item-note-text"
                      : ".link-text";
            const textEl = el.querySelector(selector);
            if (textEl) textEl.textContent = linkInput.value;
            el.dataset.name = linkInput.value;
        });
    }

    if (urlInput) {
        urlInput.addEventListener("input", () => {
            _syncLinkAutofetchUi();
            // Autofill the title from the URL when the user hasn't typed one.
            if (linkInput && !linkInput.value.trim()) {
                const derived = getNameFromUrl(urlInput.value.trim());
                if (derived) {
                    linkInput.value = derived;
                    linkInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
            }
            const el = _getEditTarget();
            if (!el) return;
            const a = el.querySelector("a");
            if (a) a.href = urlInput.value || "#";
            el.dataset.url = urlInput.value;
        });
    }

    const linkAutofetchToggle = document.getElementById(
        "link-autofetch-icon-toggle",
    );
    if (linkAutofetchToggle && !linkAutofetchToggle.dataset.drawerBound) {
        linkAutofetchToggle.dataset.drawerBound = "1";
        linkAutofetchToggle.addEventListener("change", () => {
            _syncLinkAutofetchUi();
        });
    }

    if (svgInput) {
        svgInput.addEventListener("input", () => {
            const el = _getEditTarget();
            if (!el) return;
            let val = svgInput.value;
            const stripCheckbox = document.getElementById("strip-icon-colors");
            if (val && stripCheckbox?.checked) {
                val = val.replace(/ (fill|stroke)="[^"]*"/g, "");
            }
            let iconEl = el.querySelector(".icon");
            if (!val) {
                if (!restoreDefaultTypeIcon(el, iconEl) && iconEl)
                    iconEl.remove();
                el.dataset.icon = "";
                return;
            }
            if (!iconEl) {
                iconEl = document.createElement("span");
                iconEl.classList.add("icon");
                // Rows (clipboard/launcher) keep their icon inside the row,
                // not at the container root.
                const parent =
                    el.querySelector(".clipboard-row, .launcher-row") ||
                    el.querySelector("a") ||
                    el;
                parent.insertBefore(iconEl, parent.firstChild);
            }
            // A custom icon replaces the accent-tinted default styling.
            iconEl.classList.remove("clipboard-type-icon");
            const rendered = renderStoredIcon(iconEl, val, {
                imgWidth: 16,
                imgHeight: 16,
            });
            if (!rendered) {
                iconEl.remove();
                el.dataset.icon = "";
                return;
            }
            const color = iconColorValueInput?.value;
            if (
                color &&
                !val.startsWith("http://") &&
                !val.startsWith("https://")
            ) {
                iconEl.style.setProperty("--icon-override", color);
            } else {
                iconEl.style.removeProperty("--icon-override");
            }
            el.dataset.icon = svgInput.value;
        });
    }

    if (iconColorValueInput) {
        iconColorValueInput.addEventListener("input", () => {
            _livePreviewIconColor(iconColorValueInput.value);
        });
    }

    if (linkStyleTextValue) {
        linkStyleTextValue.addEventListener("input", () => {
            _livePreviewTextColor(linkStyleTextValue.value);
        });
    }
};
