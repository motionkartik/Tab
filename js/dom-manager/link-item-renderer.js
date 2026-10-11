import {
    addLinkButton,
    choosenIconAddLink,
    getElements,
    linkBackdrop,
    linkInput,
    setElements,
    setCurrentGroup,
    setLinkIndex,
    setLinkMode,
    svgInput,
    urlInput,
} from "../variables.js";
import { initIconPicker, setGroupIcons } from "../icon-picker.js";
import { showUndoToast, showToast } from "../undo-manager.js";
import {
    saveGridState,
    flushGridState,
    getWorkspaceUpdateCallback,
    autoGrowGroupToFitItems,
    autoShrinkGroupToFitItems,
} from "./grid-state.js";
import { activatePaintMode, getPaintMode } from "./paint-mode.js";
import { renderEmptyGroupActions } from "./empty-group-actions.js";
import { closeAllDrawers } from "../drawer-manager.js";
import { captureEditState } from "../event-handlers/item-editor-ui-handlers.js";
import { executeActionItem } from "../action-executor.js";
import { getItemRoutineEditor } from "../event-handlers/routine-steps-editor.js";
import { convertGroupItemToTopLevelButton } from "../event-handlers/workspace-item-handlers.js";
import { placeFixedPopover } from "../menu-flip.js";
import {
    isStoredIconUrl,
    renderStoredIcon,
    renderStoredIconPreview,
} from "../safe-svg.js";
import { sanitizeLinkTarget, sanitizeLinkUrl } from "../untrusted-input.js";
import { t } from "../i18n.js";

let createItemsHandler = null;

export const setCreateItemsHandler = (handler) => {
    createItemsHandler = handler;
};

const rerenderGrid = (elements) => {
    if (typeof createItemsHandler === "function") {
        createItemsHandler(elements, true);
    }
};

const renderIconPreview = (
    container,
    iconMarkup,
    fallbackText = t("lir6_no_icon"),
) => {
    if (!container) return;
    renderStoredIconPreview(container, iconMarkup, {
        emptyText: fallbackText,
    });

    if (isStoredIconUrl(iconMarkup)) {
        const img = container.querySelector("img");
        if (img) {
            img.onerror = () => {
                container.textContent = fallbackText;
            };
        }
    }
};

// Default glyph for clipboard items (no stored icon). Shared with the item
// editor so its live-preview/cancel paths can restore it instead of leaving
// the tile iconless.
export const CLIPBOARD_DEFAULT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>';

const renderWidgetIcon = (container, iconMarkup, iconColor = "", fallbackLetter = "") => {
    if (!container) return false;
    container.style.removeProperty("--icon-override");

    const rendered = renderStoredIcon(container, iconMarkup, {
        imgWidth: 16,
        imgHeight: 16,
        fallbackLetter,
    });
    if (!rendered) return false;

    // A user-picked color tints letter avatars too (not remote images).
    const avatar = container.querySelector(":scope > .letter-avatar");
    if (avatar && iconColor) avatar.style.background = iconColor;

    if (iconColor && !isStoredIconUrl(iconMarkup)) {
        container.style.setProperty("--icon-override", iconColor);
    }

    return true;
};

export const createItemControls = (container, item, itemIndex, groupName) => {
    // Sortable drags reorder the DOM without re-rendering, so the render-time
    // `item.y` / `itemIndex` / `groupName` captured in these closures go stale
    // and later resolve to whatever item now sits at the old position. Resolve
    // the row's current group and index from the live DOM at click time,
    // mirroring how grid-state.js serializes them (`.items-container` >
    // `.link-item`, sequential order; group name off the enclosing `.item`).
    const resolveLiveLocation = () => {
        const row = container.closest(".link-item");
        const itemsContainer = row && row.closest(".items-container");
        const groupEl = row && row.closest(".item");
        let y = item.y ?? itemIndex;
        if (row && itemsContainer) {
            const idx = Array.from(
                itemsContainer.querySelectorAll(".link-item"),
            ).indexOf(row);
            if (idx >= 0) y = idx;
        }
        return {
            group: (groupEl && groupEl.dataset.name) || groupName,
            y,
        };
    };
    const linkButtonsGroup = document.createElement("div");
    linkButtonsGroup.classList.add("link-buttons-group");

    const dragButtonLink = document.createElement("div");
    dragButtonLink.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2h4v4H2V2zm8 0h4v4h-4V2zM2 10h4v4H2v-4zm8 0h4v4h-4v-4z" fill="currentColor"/></svg>';
    dragButtonLink.classList.add("dragHandle");

    const overflowBtn = document.createElement("button");
    overflowBtn.classList.add("link-overflow-btn");
    overflowBtn.title = t("lir6_more_options");
    overflowBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 512"><path d="M64 360a56 56 0 1 0 0 112A56 56 0 1 0 64 360zm0-160a56 56 0 1 0 0 112A56 56 0 1 0 64 200zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/></svg>';

    let popover = null;
    const ensureLinkPopover = () => {
        if (popover?.isConnected) return popover;
        popover = document.createElement("div");
        popover.classList.add("link-overflow-popover");

        const editMenuItem = document.createElement("button");
        editMenuItem.classList.add("link-menu-item");
        editMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1 0 32c0 8.8 7.2 16 16 16l32 0zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z"/></svg> ' + t("lir6_edit");
        editMenuItem.addEventListener("click", () => {
            popover.remove();
            // Sync in-memory state to the current DOM order, then target this
            // row's live position so a prior drag can't misdirect the save.
            flushGridState();
            const live = resolveLiveLocation();
            setCurrentGroup(live.group);
            linkInput.value = item.name;
            svgInput.value = item.icon || "";
            urlInput.value = item.url || "";
            addLinkButton.innerHTML = t("lir6_update_item");
            const typeLabels = {
                link: t("lir6_type_link"),
                header: t("lir6_type_header"),
                divider: t("lir6_type_divider"),
                note: t("lir6_type_note"),
                text: t("lir6_type_text"),
                todo: t("lir6_type_todo"),
                clipboard: t("lir6_type_clipboard"),
                launcher: t("lir6_type_launcher"),
                routine: t("lir6_type_routine"),
            };
            const drawerTitle = document.getElementById("link-drawer-title");
            if (drawerTitle)
                drawerTitle.textContent = t("lir6_edit_type", [
                    typeLabels[item.type || "link"] || t("lir6_item_fallback"),
                ]);
            setLinkMode("edit");
            setLinkIndex(live.y);
            // Seed the favicon-autofetch toggle before the type-change sync runs:
            // off when the item already has a custom (non-URL) icon so we don't
            // clobber it, otherwise follow the general fetch-favicon setting.
            const linkAutofetchToggle = document.getElementById(
                "link-autofetch-icon-toggle",
            );
            if (linkAutofetchToggle) {
                const hasCustomIcon =
                    !!item.icon && !isStoredIconUrl(item.icon);
                linkAutofetchToggle.checked = hasCustomIcon
                    ? false
                    : !!window.autoFaviconEnabled;
            }
            const typeSelect = document.getElementById("item-type");
            if (typeSelect) {
                typeSelect.value = item.type || "link";
                typeSelect.dispatchEvent(new Event("change"));
            }
            if (item.type === "note" || item.type === "text") {
                const savedStyle = item.textStyle || "normal";
                document
                    .querySelectorAll(".text-style-btn")
                    .forEach((b) =>
                        b.classList.toggle(
                            "active",
                            b.dataset.style === savedStyle,
                        ),
                    );
            }
            if (item.type === "clipboard") {
                const clipboardContent =
                    document.getElementById("clipboard-content");
                if (clipboardContent)
                    clipboardContent.value = item.content || "";
            }
            if (item.type === "todo") {
                const todoCompletedToggle = document.getElementById(
                    "todo-completed-toggle",
                );
                if (todoCompletedToggle)
                    todoCompletedToggle.checked = !!item.done;
            }
            if (item.type === "launcher") {
                const launcherKindEl = document.getElementById("launcher-kind");
                if (launcherKindEl) {
                    launcherKindEl.value = item.launcherKind || "app";
                    launcherKindEl.dispatchEvent(new Event("change"));
                }
                const launcherTargetEl =
                    document.getElementById("launcher-target");
                if (launcherTargetEl)
                    launcherTargetEl.value = item.target || "";
                if ((item.launcherKind || "app") === "powershell") {
                    const psVisible = document.getElementById(
                        "launcher-ps-visible",
                    );
                    if (psVisible) psVisible.checked = item.visible || false;
                }
            }
            if (item.type === "routine") {
                const editor = getItemRoutineEditor();
                if (editor) {
                    editor.setSteps(
                        Array.isArray(item.steps) ? item.steps : [],
                    );
                    editor.setStagger(item.stagger || 0);
                }
            }
            if ((item.type || "link") === "header") {
                const alignInput = document.getElementById("header-align");
                if (alignInput) alignInput.value = item.align || "center";
                document
                    .querySelectorAll(".header-align-btn")
                    .forEach((btn) => {
                        btn.classList.toggle(
                            "active",
                            btn.dataset.align === (item.align || "center"),
                        );
                    });
                const sepToggle = document.getElementById(
                    "header-separator-toggle",
                );
                if (sepToggle) sepToggle.checked = item.separator !== false;
            }
            function _parseForPicker(val) {
                if (!val) return { hex: "#888888", alpha: 100 };
                val = val.trim();
                const m = val.match(
                    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
                );
                if (m) {
                    const r = Math.round(+m[1]),
                        g = Math.round(+m[2]),
                        b = Math.round(+m[3]);
                    const hex =
                        "#" +
                        [r, g, b]
                            .map((x) => x.toString(16).padStart(2, "0"))
                            .join("");
                    return {
                        hex,
                        alpha: Math.round(
                            (m[4] !== undefined ? +m[4] : 1) * 100,
                        ),
                    };
                }
                return { hex: toHexSimple(val) || "#888888", alpha: 100 };
            }
            const iconColorInput = document.getElementById("icon-color-value");
            const iconColorPicker =
                document.getElementById("icon-color-picker");
            const iconColorAlpha = document.getElementById("icon-color-alpha");
            const iconColorAlphaLbl = document.getElementById(
                "icon-color-alpha-label",
            );
            if (iconColorInput) iconColorInput.value = item.iconColor || "";
            const icParsed = _parseForPicker(item.iconColor);
            if (iconColorPicker) iconColorPicker.value = icParsed.hex;
            if (iconColorAlpha) iconColorAlpha.value = icParsed.alpha;
            if (iconColorAlphaLbl)
                iconColorAlphaLbl.textContent = `${icParsed.alpha}%`;

            const linkStyleTextValue = document.getElementById(
                "link-style-text-value",
            );
            const linkStyleColorPicker = document.getElementById(
                "link-style-text-color",
            );
            const linkStyleAlpha = document.getElementById(
                "link-style-text-alpha",
            );
            const linkStyleAlphaLbl = document.getElementById(
                "link-style-text-alpha-label",
            );
            const linkColorRaw = item.style?.["--link-color"] || "";
            if (linkStyleTextValue) linkStyleTextValue.value = linkColorRaw;
            const lcParsed = _parseForPicker(linkColorRaw);
            if (linkStyleColorPicker) linkStyleColorPicker.value = lcParsed.hex;
            if (linkStyleAlpha) linkStyleAlpha.value = lcParsed.alpha;
            if (linkStyleAlphaLbl)
                linkStyleAlphaLbl.textContent = `${lcParsed.alpha}%`;
            const descInput = document.getElementById("linkDescription");
            if (descInput) descInput.value = item.description || "";
            const targetOverrideEl = document.getElementById(
                "link-target-override",
            );
            if (targetOverrideEl)
                targetOverrideEl.value = item.targetOverride || "";
            closeAllDrawers();
            linkBackdrop.classList.add("active");
            captureEditState();
            initIconPicker();
            const allWorkspaceItems = (getElements() || []).flatMap(
                (w) => w.items || w.content?.items || [],
            );
            setGroupIcons(allWorkspaceItems);
            if (choosenIconAddLink) {
                renderIconPreview(choosenIconAddLink, item.icon);
            }
        });

        const duplicateMenuItem = document.createElement("button");
        duplicateMenuItem.classList.add("link-menu-item");
        duplicateMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z"/></svg> ' + t("lir6_duplicate");
        duplicateMenuItem.addEventListener("click", () => {
            popover.remove();
            // Sync in-memory state to the DOM order before mutating so the
            // clone lands next to this row's live position, not a stale one.
            flushGridState();
            const live = resolveLiveLocation();
            const localElements = getElements();
            const groupEl = localElements.find(
                (w) =>
                    w.name === live.group ||
                    (w.content && w.content.name === live.group),
            );
            if (!groupEl) return;
            const items =
                groupEl.items || (groupEl.content && groupEl.content.items);
            if (!items) return;
            const clonedItem = JSON.parse(JSON.stringify(item));
            const originalY = live.y;
            items.forEach((it) => {
                if ((it.y ?? 0) > originalY) it.y = (it.y ?? 0) + 1;
            });
            clonedItem.y = originalY + 1;
            items.splice(live.y + 1, 0, clonedItem);
            setElements(localElements);
            const workspaceUpdateCallback = getWorkspaceUpdateCallback();
            if (workspaceUpdateCallback) workspaceUpdateCallback(localElements);
            rerenderGrid(localElements);
        });

        const copyStyleMenuItem = document.createElement("button");
        copyStyleMenuItem.classList.add("link-menu-item");
        copyStyleMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M339.3 367.1c27.3-3.9 51.9-19.4 67.2-42.9L568.2 74.1c12.6-19.5 9.4-45.3-7.6-61.2S516.7.5 499.1 9.2L200.9 215.3c-20.8 12.8-33.4 35.9-33.4 60.7V360c0-1.3-.1-2.6-.1-3.9 0 0 0 0 0 0L120 360.2c-17.7 0-32 14.3-32 32l0 .2 0 72.2c0 17.7 14.3 32 32 32s32-14.3 32-32l0-72.1c.1-17.7 14.3-32 31.9-32c.1 0 .2 0 .3 0l166.7-.3c2.5 0 4.9.1 7.4.2zM512 384c0 35.3-28.7 64-64 64c-17.7 0-32 14.3-32 32s14.3 32 32 32c70.7 0 128-57.3 128-128c0-17.7-14.3-32-32-32s-32 14.3-32 32z"/></svg> ' + t("lir6_copy_style");
        copyStyleMenuItem.addEventListener("click", () => {
            popover.remove();
            let linkColor = "";
            if (container.dataset.linkStyle) {
                try {
                    linkColor =
                        JSON.parse(container.dataset.linkStyle)?.[
                            "--link-color"
                        ] || "";
                } catch (e) {
                    console.warn(
                        "[dom-manager] Invalid linkStyle JSON:",
                        e.message,
                    );
                }
            }
            activatePaintMode("link", {
                iconColor: container.dataset.iconColor || "",
                linkColor,
                icon: container.dataset.icon || "",
            });
        });

        const copyTitleMenuItem = document.createElement("button");
        copyTitleMenuItem.classList.add("link-menu-item");
        copyTitleMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM64 112c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-16 0 0 24c0 13.3-10.7 24-24 24l-88 0-88 0c-13.3 0-24-10.7-24-24l0-24-16 0zm128-64a24 24 0 1 0 0 48 24 24 0 1 0 0-48z"/></svg> ' + t("lir6_copy_title");
        copyTitleMenuItem.addEventListener("click", () => {
            popover.remove();
            navigator.clipboard.writeText(item.name || "").then(
                () => showToast(t("lir6_title_copied")),
                () => showToast(t("lir6_copy_failed"), true),
            );
        });

        const copyUrlMenuItem = document.createElement("button");
        copyUrlMenuItem.classList.add("link-menu-item");
        copyUrlMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C75 372.5 75 321.5 106.5 290L217.7 178.8c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.8l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg> ' + t("lir6_copy_url");
        copyUrlMenuItem.addEventListener("click", () => {
            popover.remove();
            navigator.clipboard.writeText(item.url || "").then(
                () => showToast(t("lir6_url_copied")),
                () => showToast(t("lir6_copy_failed"), true),
            );
        });

        let convertMenuItem = null;
        let convertTileMenuItem = null;
        let convertTile2MenuItem = null;
        if (
            ["link", "clipboard", "launcher", "routine"].includes(
                item.type || "link",
            )
        ) {
            const convertLabel =
                (item.type || "link") === "clipboard"
                    ? t("lir6_type_clipboard")
                    : (item.type || "link") === "launcher"
                      ? t("lir6_type_launcher")
                      : (item.type || "link") === "routine"
                        ? t("lir6_type_routine")
                        : t("lir6_type_link");
            const makeConvertItem = (label, display) => {
                const entry = document.createElement("button");
                entry.classList.add("link-menu-item");
                entry.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 64 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l338.7 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128z"/></svg> ${t("lir6_convert_to", [label])}`;
                entry.addEventListener("click", async () => {
                    popover.remove();
                    flushGridState();
                    const live = resolveLiveLocation();
                    await convertGroupItemToTopLevelButton({
                        groupName: live.group,
                        itemY: live.y,
                        display,
                    });
                });
                return entry;
            };
            convertMenuItem = makeConvertItem(convertLabel, undefined);
            convertTileMenuItem = makeConvertItem(
                t("wih20_opt_tile_label"),
                "tile",
            );
            convertTile2MenuItem = makeConvertItem(
                t("wih20_opt_tile2_label"),
                "tile2",
            );
        }

        const menuSeparator = document.createElement("div");
        menuSeparator.classList.add("link-menu-separator");

        const deleteMenuItem = document.createElement("button");
        deleteMenuItem.classList.add("link-menu-item", "danger");
        deleteMenuItem.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg> ' + t("lir6_delete");
        deleteMenuItem.addEventListener("click", () => {
            popover.remove();
            const snapshot = JSON.parse(JSON.stringify(getElements()));
            const linkItem = container.closest(".link-item");
            if (linkItem) {
                const itemsContainer = linkItem.closest(".items-container");
                const groupEl = linkItem.closest(".item");
                linkItem.remove();
                saveGridState();
                // Close the gap a removed item leaves: shrink the group to fit
                // its remaining content and pull the widgets below it up. Gated
                // by the same setting as auto-grow.
                const shrinkGroupName = groupEl?.dataset.name;
                if (
                    shrinkGroupName &&
                    window.autoGrowGroupsOnItemAdd !== false
                ) {
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() =>
                            autoShrinkGroupToFitItems(shrinkGroupName),
                        ),
                    );
                }
                // If that was the last item, draw the empty-group quick-fill
                // buttons so an emptied group matches a freshly-created one.
                if (
                    itemsContainer &&
                    groupEl &&
                    (groupEl.dataset.groupType || "standard") !== "todo-list" &&
                    !itemsContainer.querySelector(".link-item")
                ) {
                    const groupName = groupEl.dataset.name;
                    renderEmptyGroupActions(itemsContainer, {
                        name: groupName,
                        type: groupEl.dataset.groupType || "standard",
                    });
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() =>
                            autoGrowGroupToFitItems(groupName),
                        ),
                    );
                }
                showUndoToast(t("lir6_item_deleted"), () => {
                    setElements(snapshot);
                    const workspaceUpdateCallback =
                        getWorkspaceUpdateCallback();
                    if (workspaceUpdateCallback)
                        workspaceUpdateCallback(snapshot);
                    rerenderGrid(snapshot);
                    saveGridState();
                });
            }
        });

        const appendItems = [editMenuItem, duplicateMenuItem];
        if (convertMenuItem) appendItems.push(convertMenuItem);
        if (convertTileMenuItem) appendItems.push(convertTileMenuItem);
        if (convertTile2MenuItem) appendItems.push(convertTile2MenuItem);
        appendItems.push(copyStyleMenuItem, copyTitleMenuItem);
        if (item.url) appendItems.push(copyUrlMenuItem);
        appendItems.push(menuSeparator, deleteMenuItem);
        popover.append(...appendItems);
        document.body.appendChild(popover);
        return popover;
    };

    overflowBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = ensureLinkPopover();
        const isOpen = p.classList.contains("open");
        document
            .querySelectorAll(
                ".link-overflow-popover.open, .group-menu-popover.open",
            )
            .forEach((el) => el.remove());
        if (!isOpen) {
            // Show first so the popover has a measurable height, then position
            // it — dropping below the button, or flipping above when it would
            // run off the bottom of the viewport.
            p.classList.add("open");
            placeFixedPopover(p, overflowBtn);
        }
    });

    linkButtonsGroup.append(dragButtonLink, overflowBtn);
    return linkButtonsGroup;
};

export function toHexSimple(val) {
    if (!val) return null;
    val = val.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(val)) {
        if (val.length === 4)
            return "#" + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
        return val.slice(0, 7);
    }
    try {
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.fillStyle = "#888";
        ctx.fillStyle = val;
        const c = ctx.fillStyle;
        if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    } catch {}
    return null;
}

export const createLinkWidgetContent = (
    item,
    itemIndex,
    groupName,
    canEdit = true,
) => {
    const itemType = item.type || "link";
    const container = document.createElement("div");
    const displayType = itemType === "note" ? "text" : itemType;
    container.classList.add("link-widget-content", `item-type-${displayType}`);
    container.style.height = "100%";
    container.style.display = "flex";
    container.style.alignItems = "center";

    container.dataset.url = item.url || "";
    container.dataset.name = item.name || "";
    container.dataset.icon = item.icon || "";
    container.dataset.iconColor = item.iconColor || "";
    container.dataset.type = itemType;
    container.dataset.itemY = String(item.y ?? itemIndex);
    if (item.description) container.dataset.description = item.description;
    if (item.targetOverride)
        container.dataset.targetOverride = item.targetOverride;

    if (item.style && Object.keys(item.style).length) {
        container.dataset.linkStyle = JSON.stringify(item.style);
        Object.entries(item.style).forEach(([prop, val]) => {
            if (val) container.style.setProperty(prop, val);
        });
    }

    if (itemType === "divider") {
        const hr = document.createElement("hr");
        hr.classList.add("item-divider");
        if (item.iconColor) {
            container.style.setProperty("--divider-color", item.iconColor);
        }
        container.appendChild(hr);
        container.classList.add("item-type-divider-wrap");
        const controls = createItemControls(
            container,
            item,
            itemIndex,
            groupName,
        );
        container.append(controls);
        return container;
    }

    if (itemType === "header") {
        const headerEl = document.createElement("span");
        headerEl.classList.add("item-header-text");
        headerEl.textContent = item.name || "";
        container.dataset.align = item.align || "center";
        container.dataset.separator =
            item.separator !== false ? "true" : "false";
        container.append(headerEl);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );
        return container;
    }

    if (itemType === "note" || itemType === "text") {
        container.style.justifyContent = "space-between";
        container.style.padding = "2px 0";
        const textStyle = item.textStyle || "normal";
        container.classList.add(`text-style-${textStyle}`);
        // Only an explicit choice goes into the dataset: the default must not
        // be baked into the serialized data (WI-1 round-trip).
        if (item.textStyle) container.dataset.textStyle = item.textStyle;
        const noteEl = document.createElement("span");
        noteEl.classList.add("item-note-text");
        noteEl.textContent = item.name || "";
        container.append(noteEl);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );
        return container;
    }

    if (itemType === "todo") {
        container.style.justifyContent = "space-between";
        container.dataset.done = item.done ? "true" : "false";
        container.classList.toggle("is-complete", !!item.done);

        const todoRow = document.createElement("div");
        todoRow.classList.add("todo-row");

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.classList.add("todo-toggle-btn");
        toggleBtn.setAttribute(
            "aria-label",
            item.done ? t("lir6_todo_mark_incomplete") : t("lir6_todo_mark_complete"),
        );
        toggleBtn.setAttribute("aria-pressed", item.done ? "true" : "false");

        const checkmark = document.createElement("span");
        checkmark.classList.add("todo-checkmark");
        checkmark.textContent = "✓";
        toggleBtn.append(checkmark);

        const todoLabel = document.createElement("span");
        todoLabel.classList.add("todo-label");
        todoLabel.textContent = item.name || "";

        const setDone = (done) => {
            item.done = done;
            container.dataset.done = done ? "true" : "false";
            container.classList.toggle("is-complete", done);
            toggleBtn.setAttribute(
                "aria-label",
                done ? t("lir6_todo_mark_incomplete") : t("lir6_todo_mark_complete"),
            );
            toggleBtn.setAttribute("aria-pressed", done ? "true" : "false");
            saveGridState();
        };

        const toggleDone = () => {
            setDone(container.dataset.done !== "true");
        };

        // Read-only boards (e.g. managed-board subscriptions) must not let the
        // viewer change todo state — render the checkbox but keep it inert.
        if (canEdit) {
            toggleBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleDone();
            });

            container.addEventListener("click", (e) => {
                if (e.target.closest(".link-buttons-group")) return;
                e.preventDefault();
                toggleDone();
            });
        } else {
            toggleBtn.disabled = true;
            container.classList.add("todo-readonly");
        }

        todoRow.append(toggleBtn, todoLabel);
        container.append(todoRow);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );
        return container;
    }

    if (itemType === "launcher") {
        const launcherKind = item.launcherKind || "app";
        container.dataset.launcherKind = launcherKind;
        container.dataset.target = item.target || "";
        container.style.justifyContent = "space-between";

        const launcherRow = document.createElement("div");
        launcherRow.classList.add("launcher-row");

        const iconEl = document.createElement("span");
        iconEl.classList.add("icon", "launcher-type-icon");

        const kindDefaultIcons = {
            app: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>',
            folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 480H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H298.5c-17 0-33.3-6.7-45.3-18.7L226.7 50.7c-12-12-28.3-18.7-45.3-18.7H64C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64z"/></svg>',
            file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M0 64C0 28.7 28.7 0 64 0H224V128c0 17.7 14.3 32 32 32H384V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zm384 64H256V0L384 128z"/></svg>',
            powershell:
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416H544c17.7 0 32 14.3 32 32s-14.3 32-32 32H256c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/></svg>',
        };

        if (item.icon) {
            if (!renderWidgetIcon(iconEl, item.icon, item.iconColor)) {
                renderWidgetIcon(
                    iconEl,
                    kindDefaultIcons[launcherKind] || kindDefaultIcons.app,
                );
            }
        } else {
            renderWidgetIcon(
                iconEl,
                kindDefaultIcons[launcherKind] || kindDefaultIcons.app,
            );
        }

        const labelEl = document.createElement("span");
        labelEl.classList.add("link-text");
        labelEl.textContent = item.name || "";

        launcherRow.append(iconEl, labelEl);
        if (launcherKind === "powershell") {
            container.dataset.psVisible = item.visible ? "true" : "false";
        }

        container.append(launcherRow);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );

        container.addEventListener("click", (e) => {
            if (e.target.closest(".link-buttons-group")) return;
            e.preventDefault();
            executeActionItem({
                ...item,
                type: itemType,
                launcherKind,
            });
        });
        return container;
    }

    if (itemType === "routine") {
        const steps = Array.isArray(item.steps) ? item.steps : [];
        container.dataset.routineSteps = JSON.stringify(steps);
        container.dataset.routineStagger =
            item.stagger != null ? String(item.stagger) : "";
        container.style.justifyContent = "space-between";

        const routineRow = document.createElement("div");
        routineRow.classList.add("launcher-row");

        const iconEl = document.createElement("span");
        iconEl.classList.add("icon", "launcher-type-icon");
        const routineDefaultIcon =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.3-23-41L73 39z"/></svg>';
        if (item.icon) {
            if (!renderWidgetIcon(iconEl, item.icon, item.iconColor)) {
                renderWidgetIcon(iconEl, routineDefaultIcon);
            }
        } else {
            renderWidgetIcon(iconEl, routineDefaultIcon);
        }

        const labelEl = document.createElement("span");
        labelEl.classList.add("link-text");
        labelEl.textContent = item.name || "";

        const badge = document.createElement("span");
        badge.classList.add("routine-step-badge");
        badge.textContent = String(steps.length);
        badge.title =
            steps.length === 1
                ? t("lir6_step_count_one", [String(steps.length)])
                : t("lir6_step_count_other", [String(steps.length)]);

        routineRow.append(iconEl, badge, labelEl);
        container.append(routineRow);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );

        container.addEventListener("click", (e) => {
            if (e.target.closest(".link-buttons-group")) return;
            e.preventDefault();
            executeActionItem({ ...item, type: itemType });
        });
        return container;
    }

    if (itemType === "clipboard") {
        container.style.justifyContent = "space-between";
        container.dataset.content = item.content || "";
        const clipboardRow = document.createElement("div");
        clipboardRow.classList.add("clipboard-row");
        const clipIcon = document.createElement("span");
        clipIcon.classList.add("icon");
        // A custom icon (set in the item editor) wins; otherwise the default
        // clipboard glyph — user-picked color if set, else the accent tint
        // (.clipboard-type-icon, whose rule would override a color choice).
        if (!(item.icon && renderWidgetIcon(clipIcon, item.icon, item.iconColor))) {
            clipIcon.innerHTML = CLIPBOARD_DEFAULT_ICON_SVG;
            if (item.iconColor) {
                clipIcon.style.setProperty("--icon-override", item.iconColor);
            } else {
                clipIcon.classList.add("clipboard-type-icon");
            }
        }
        const clipLabel = document.createElement("span");
        clipLabel.classList.add("link-text");
        clipLabel.textContent = item.name || "";
        clipboardRow.append(clipIcon, clipLabel);
        container.append(clipboardRow);
        container.append(
            createItemControls(container, item, itemIndex, groupName),
        );
        container.addEventListener("click", (e) => {
            if (e.target.closest(".link-buttons-group")) return;
            e.preventDefault();
            executeActionItem({
                ...item,
                type: itemType,
            });
        });
        return container;
    }

    container.style.justifyContent = "space-between";

    const linkContainer = document.createElement("div");
    linkContainer.classList.add("link-container");
    linkContainer.style.flex = "1";
    linkContainer.style.minWidth = "0";

    const link = document.createElement("a");
    const safeLinkUrl = sanitizeLinkUrl(item.url);
    link.href = safeLinkUrl || "#";
    link.target =
        sanitizeLinkTarget(item.targetOverride) ||
        sanitizeLinkTarget(window.linkTarget) ||
        "_self";
    const linkText = document.createElement("span");
    linkText.classList.add("link-text");
    linkText.textContent = item.name;
    if (item.name) {
        const icon = document.createElement("span");
        icon.classList.add("icon");
        // Plain links always show an icon: stored icon, remote favicon, or a
        // letter-avatar fallback (also when the remote image fails to load).
        if (renderWidgetIcon(icon, item.icon, item.iconColor, item.name)) {
            link.append(icon);
        }
    }
    link.append(linkText);
    linkContainer.append(link);
    if (item.description) {
        const desc = document.createElement("span");
        desc.classList.add("link-description");
        desc.textContent = item.description;
        linkContainer.append(desc);
    }
    container.append(linkContainer);
    container.append(createItemControls(container, item, itemIndex, groupName));

    container.addEventListener("click", (e) => {
        const paintMode = getPaintMode();
        if (!paintMode || paintMode.type !== "link") return;
        if (e.target.closest(".link-buttons-group")) return;
        e.preventDefault();
        e.stopPropagation();
        const { iconColor, linkColor, icon } = paintMode.style;

        // Apply icon color
        container.dataset.iconColor = iconColor || "";
        const iconEl = container.querySelector("a .icon");
        if (iconEl) {
            if (iconColor)
                iconEl.style.setProperty("--icon-override", iconColor);
            else iconEl.style.removeProperty("--icon-override");
        }

        // Apply icon
        if (icon !== undefined) {
            container.dataset.icon = icon;
            const linkEl = container.querySelector("a");
            if (linkEl) {
                let targetIconEl = linkEl.querySelector(".icon");
                if (!icon) {
                    if (targetIconEl) targetIconEl.remove();
                } else {
                    if (!targetIconEl) {
                        targetIconEl = document.createElement("span");
                        targetIconEl.classList.add("icon");
                        linkEl.insertBefore(targetIconEl, linkEl.firstChild);
                    }
                    if (!renderWidgetIcon(targetIconEl, icon, iconColor)) {
                        targetIconEl.remove();
                    }
                }
            }
        }

        // Apply link color
        let existingStyle = {};
        if (container.dataset.linkStyle) {
            try {
                existingStyle = JSON.parse(container.dataset.linkStyle);
            } catch (e) {
                console.warn(
                    "[dom-manager] Invalid linkStyle JSON:",
                    e.message,
                );
            }
        }
        if (linkColor) {
            existingStyle["--link-color"] = linkColor;
            container.style.setProperty("--link-color", linkColor);
        } else {
            delete existingStyle["--link-color"];
            container.style.removeProperty("--link-color");
        }
        if (Object.keys(existingStyle).length) {
            container.dataset.linkStyle = JSON.stringify(existingStyle);
        } else {
            delete container.dataset.linkStyle;
        }
        container.classList.add("paint-applied");
        setTimeout(() => container.classList.remove("paint-applied"), 600);
        saveGridState();
        showToast(t("lir6_style_applied"));
    });

    return container;
};
