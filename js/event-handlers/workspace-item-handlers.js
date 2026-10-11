import {
    addGroupButton,
    addLinkButton,
    choosenIconAddLink,
    getCurrentGroup,
    getElements,
    getLinkIndex,
    getLinkMode,
    groupBackdrop,
    groupCloseButton,
    groupInput,
    itemTypeSelect,
    linkCloseButton,
    linkInput,
    setLinkMode,
    svgInput,
    urlInput,
} from "../variables.js";

import { createItems } from "../dom-manager/grid-renderer.js";
import {
    autoGrowGroupToFitItems,
    flushGridState,
} from "../dom-manager/grid-state.js";
import {
    addClipboardButtonToWorkspace,
    addGroupToWorkspace,
    addLauncherButtonToWorkspace,
    addLinkButtonToWorkspace,
    addRoutineButtonToWorkspace,
    addSectionToWorkspace,
    loadCurrentWorkspace,
} from "../workspaces/workspace-grid-sync.js";
import { saveWorkspacesToStorage } from "../workspaces/workspace-storage.js";
import {
    getCurrentWorkspace,
    getWorkspaceGroups,
    getWorkspacesData,
    setWorkspaceGroups,
} from "../workspaces/workspace-state.js";
import {
    revertLinkEditState,
    clearCapturedState,
} from "./item-editor-ui-handlers.js";
import {
    resetIconPicker,
    initIconPicker,
    setGroupIcons,
    autofetchFaviconIntoPicker,
} from "../icon-picker.js";
import { closeAllDrawers } from "../drawer-manager.js";
import {
    getGroupRoutineEditor,
    getItemRoutineEditor,
} from "./routine-steps-editor.js";
import {
    renderStoredIcon,
    renderStoredIconPreview,
    isStoredIconUrl,
} from "../safe-svg.js";
import { getNameFromUrl, normalizeLinkUrl, sanitizeLinkUrl } from "../untrusted-input.js";
import { PRESET_AVATARS, PRESET_AVATAR_IDS } from "../dom-manager/avatars.js";
import { showToast } from "../undo-manager.js";
import { t } from "../i18n.js";
import { remoteFaviconsAllowed } from "../favicon.js";

const GROUP_PICKER_OPTIONS = {
    key: "group",
    rootId: "group",
};

const LINK_PICKER_OPTIONS = {
    key: "link",
    rootId: "link",
};

const getWidgetItems = (widget) =>
    widget?.items || (widget?.content ? widget.content.items : null);

const findWidgetByGroupName = (elements, groupName) =>
    elements.find(
        (w) =>
            w.name === groupName || (w.content && w.content.name === groupName),
    );

const findItemIndexByY = (items, itemY) =>
    items.findIndex((item, index) => (item.y ?? index) === itemY);

// Builds the Google faviconV2 URL for a link's hostname. Throws if the URL is unparseable.
// Returns "" when remote favicons are disabled in Settings → Favicons.
const buildFaviconUrl = (url) => {
    if (!remoteFaviconsAllowed()) return "";
    const domain = new URL(url).hostname;
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
};

const probeImage = (src) =>
    new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
    });

export const FAVICON_FETCH_CONCURRENCY = 8;

/**
 * Fetch and assign favicons for every iconless link across all workspaces.
 * Existing icons are never overwritten. Returns { total, updated }.
 */
export const fetchAllFavicons = async ({
    probe = probeImage,
    concurrency = FAVICON_FETCH_CONCURRENCY,
    includeExisting = false,
} = {}) => {
    const workspaces = getWorkspacesData()?.workspaces || {};

    const candidates = [];
    Object.values(workspaces).forEach((groups) => {
        if (!Array.isArray(groups)) return;
        groups.forEach((group) => {
            if (getWidgetElementType(group) === "link-button") {
                if (!group.url || (group.icon && !includeExisting)) return;
                let faviconUrl;
                try {
                    faviconUrl = buildFaviconUrl(group.url);
                } catch {
                    return;
                }
                candidates.push({ item: group, faviconUrl });
                return;
            }

            const items = getWidgetItems(group);
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || (item.type || "link") !== "link") return;
                if (!item.url || (item.icon && !includeExisting)) return;
                let faviconUrl;
                try {
                    faviconUrl = buildFaviconUrl(item.url);
                } catch {
                    return;
                }
                candidates.push({ item, faviconUrl });
            });
        });
    });

    if (!candidates.length) return { total: 0, updated: 0 };

    let updated = 0;
    const batchSize = Math.max(
        1,
        Number(concurrency) || FAVICON_FETCH_CONCURRENCY,
    );
    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async ({ item, faviconUrl }) => {
                const ok = await probe(faviconUrl);
                // Re-check icon: when only filling gaps, an edit could have
                // assigned one while probing. When includeExisting, overwrite.
                if (ok && (includeExisting || !item.icon)) {
                    item.icon = faviconUrl;
                    updated += 1;
                }
            }),
        );
    }

    if (updated > 0) {
        await saveWorkspacesToStorage();
        loadCurrentWorkspace();
    }

    return { total: candidates.length, updated };
};

// Clear the icon on every link and link-button in the ACTIVE workspace only
// (not all tabs). Returns how many icons were removed.
export const removeAllIcons = async () => {
    const activeId = getCurrentWorkspace();
    const groups = getWorkspacesData()?.workspaces?.[activeId];
    if (!Array.isArray(groups)) return { removed: 0 };

    let removed = 0;
    groups.forEach((group) => {
        if (getWidgetElementType(group) === "link-button") {
            if (group.icon) {
                group.icon = "";
                removed += 1;
            }
            return;
        }

        const items = getWidgetItems(group);
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
            if (item && item.icon) {
                item.icon = "";
                removed += 1;
            }
        });
    });

    if (removed > 0) {
        await saveWorkspacesToStorage();
        loadCurrentWorkspace();
    }

    return { removed };
};

const updateAutoFaviconTarget = async ({
    workspaceId,
    groupName,
    itemY,
    expectedUrl,
    faviconUrl,
}) => {
    const groups = getWorkspaceGroups(workspaceId);
    const widget = findWidgetByGroupName(groups, groupName);
    const items = getWidgetItems(widget);
    if (!items) return;

    const itemIndex = findItemIndexByY(items, itemY);
    if (itemIndex === -1) return;

    const targetItem = items[itemIndex];
    if (
        !targetItem ||
        targetItem.icon ||
        (targetItem.url || "") !== expectedUrl
    ) {
        return;
    }

    targetItem.icon = faviconUrl;
    await saveWorkspacesToStorage();

    if (getCurrentWorkspace() === workspaceId) {
        loadCurrentWorkspace();
        autoGrowGroupToFitItems(groupName);
    }
};

const updateAutoFaviconWidgetTarget = async ({
    workspaceId,
    widgetName,
    expectedUrl,
    faviconUrl,
}) => {
    const groups = getWorkspaceGroups(workspaceId);
    const widget = findWidgetByGroupName(groups, widgetName);
    if (!widget) return;
    if (getWidgetElementType(widget) !== "link-button") return;
    if (widget.icon || (widget.url || "") !== expectedUrl) return;

    widget.icon = faviconUrl;
    await saveWorkspacesToStorage();

    if (getCurrentWorkspace() === workspaceId) {
        loadCurrentWorkspace();
    }
};

const getGroupDrawerElements = () => ({
    drawerTitle: document.getElementById("group-drawer-title"),
    groupTypePickerStep: document.getElementById("group-drawer-type-step"),
    groupStyleStep: document.getElementById("group-drawer-style-step"),
    groupFormStep: document.getElementById("group-drawer-form-step"),
    groupTypePickerGroups: document.getElementById("group-type-picker-groups"),
    groupStylePickerGroups: document.getElementById(
        "group-style-picker-groups",
    ),
    groupStyleActionLabel: document.getElementById("group-style-action-label"),
    groupStyleBackButton: document.getElementById("group-drawer-style-back-btn"),
    groupBackButton: document.getElementById("group-drawer-back-btn"),
    groupSelectedTypeLabel: document.getElementById(
        "group-selected-type-label",
    ),
    groupElementTypeField: document.getElementById("group-element-type-field"),
    groupElementTypeSelect: document.getElementById(
        "group-element-type-select",
    ),
    groupElementTypeHint: document.getElementById("group-element-type-hint"),
    groupNameField: document.getElementById("group-name-field"),
    groupNameLabel: document.getElementById("group-name-label"),
    groupSectionTextareaField: document.getElementById(
        "group-section-textarea-field",
    ),
    groupSectionTextareaInput: document.getElementById(
        "group-section-textarea",
    ),
    groupLinkButtonUrlField: document.getElementById(
        "group-link-button-url-field",
    ),
    groupLinkButtonUrlInput: document.getElementById("group-link-button-url"),
    groupLinkButtonDisplayField: document.getElementById(
        "group-link-button-display-field",
    ),
    groupLinkButtonDisplaySelect: document.getElementById(
        "group-link-button-display",
    ),
    groupClipboardContentField: document.getElementById(
        "group-clipboard-content-field",
    ),
    groupSectionProfileAvatarPresetField: document.getElementById(
        "group-section-profile-avatar-preset-field",
    ),
    groupSectionProfileAvatarGrid: document.getElementById(
        "group-section-profile-avatar-grid",
    ),
    groupSectionProfileAvatarUrlField: document.getElementById(
        "group-section-profile-avatar-url-field",
    ),
    groupSectionProfileAvatarUrlInput: document.getElementById(
        "group-section-profile-avatar-url",
    ),
    groupSectionFileUrlField: document.getElementById(
        "group-section-file-url-field",
    ),
    groupSectionFileUrlInput: document.getElementById("group-section-file-url"),
    groupSectionLinkcardUrlField: document.getElementById(
        "group-section-linkcard-url-field",
    ),
    groupSectionLinkcardUrlInput: document.getElementById(
        "group-section-linkcard-url",
    ),
    groupSectionLinkcardHint: document.getElementById(
        "group-section-linkcard-hint",
    ),
    groupClipboardContentInput: document.getElementById(
        "group-clipboard-content",
    ),
    groupLauncherFields: document.getElementById("group-launcher-fields"),
    groupRoutineFields: document.getElementById("group-routine-fields"),
    groupLauncherKind: document.getElementById("group-launcher-kind"),
    groupLauncherTargetLabel: document.getElementById(
        "group-launcher-target-label",
    ),
    groupLauncherTarget: document.getElementById("group-launcher-target"),
    groupLauncherBrowseBtn: document.getElementById(
        "group-launcher-browse-btn",
    ),
    groupLauncherPsRow: document.getElementById("group-launcher-ps-row"),
    groupLauncherPsVisible: document.getElementById(
        "group-launcher-ps-visible",
    ),
    groupLauncherExamples: document.querySelector(".group-launcher-examples"),
    groupLinkButtonBgRow: document.getElementById("group-link-button-bg-row"),
    groupLinkButtonBgValue: document.getElementById(
        "group-link-button-bg-value",
    ),
    groupLinkButtonBgPicker: document.getElementById(
        "group-link-button-bg-picker",
    ),
    groupLinkButtonBgAlpha: document.getElementById(
        "group-link-button-bg-alpha",
    ),
    groupLinkButtonBgAlphaLabel: document.getElementById(
        "group-link-button-bg-alpha-label",
    ),
    groupLinkButtonBgReset: document.getElementById(
        "group-link-button-bg-reset",
    ),
    groupLinkButtonFontSizeRow: document.getElementById(
        "group-link-button-font-size-row",
    ),
    groupLinkButtonFontSizeValue: document.getElementById(
        "group-link-button-font-size-value",
    ),
    groupLinkButtonFontSizeSlider: document.getElementById(
        "group-link-button-font-size-slider",
    ),
    groupLinkButtonFontSizeLabel: document.getElementById(
        "group-link-button-font-size-label",
    ),
    groupLinkButtonFontSizeReset: document.getElementById(
        "group-link-button-font-size-reset",
    ),
    groupSvgInput: document.getElementById("group-svg"),
    groupChosenIcon: document.getElementById("group-chosen-icon"),
    groupStripColors: document.getElementById("group-strip-icon-colors"),
    groupIconColorInput: document.getElementById("group-icon-color-value"),
    groupIconColorPicker: document.getElementById("group-icon-color-picker"),
    groupIconColorAlpha: document.getElementById("group-icon-color-alpha"),
    groupIconColorAlphaLabel: document.getElementById(
        "group-icon-color-alpha-label",
    ),
    groupIconColorReset: document.getElementById("group-icon-color-reset"),
    groupIconSizeInput: document.getElementById("group-icon-size-value"),
    groupIconSizeSlider: document.getElementById("group-icon-size-slider"),
    groupIconSizeValueLabel: document.getElementById(
        "group-icon-size-value-label",
    ),
    groupIconSizeReset: document.getElementById("group-icon-size-reset"),
    groupClearIconBtn: document.getElementById("group-clear-icon-btn"),
    groupColorSection: document.getElementById("group-color-section"),
});

const TOP_LEVEL_BUTTON_TYPES = new Set([
    "link-button",
    "clipboard-button",
    "launcher-button",
    "routine-button",
]);

const SECTION_TYPES = new Set([
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
]);

const SECTION_LABELS = {
    "section-header": t("wih20_label_heading"),
    "section-stepheader": t("wih20_label_step_heading"),
    "section-text": t("wih20_label_text"),
    "section-divider": t("wih20_label_divider"),
    "section-arrow": t("wih20_label_arrow"),
    "section-callout": t("wih20_label_callout"),
    "section-code": t("wih20_label_code_block"),
    "section-steps": t("wih20_label_steps"),
    "section-image": t("wih20_label_image"),
    "section-profile": t("wih20_label_profile_avatar"),
    "section-linkcard": t("wih20_label_link_card"),
    "section-file": t("wih20_label_file"),
};

const GROUP_DRAWER_STEP_PICKER = "picker";
const GROUP_DRAWER_STEP_STYLE = "style";
const GROUP_DRAWER_STEP_FORM = "form";

// The action widget types (all share one graphical family and gain a Style
// step between the type picker and the form).
const ACTION_FAMILY_TYPES = new Set([
    "link-button",
    "clipboard-button",
    "launcher-button",
    "routine-button",
]);

// Canonical grid geometry each display shape pins. Standard ("") keeps the
// factory 6x8; the square variants are fixed-size.
const DISPLAY_GEOMETRY = {
    tile: { w: 1, h: 8 },
    tile2: { w: 2, h: 16 },
};
const isSquareDisplay = (display) =>
    display === "tile" || display === "tile2";

// Apply a display shape (+ its canonical geometry) to a widget in place.
// Shared by the edit save path across all action types.
const _applyDisplayToWidget = (widget, display) => {
    const wasSquare = isSquareDisplay(widget.display);

    if (display === "tile" || display === "tile2") {
        widget.display = display;
    } else {
        delete widget.display;
    }
    // labelHidden is retired; scrub it off anything this touches.
    delete widget.labelHidden;

    if (isSquareDisplay(display)) {
        const geo = DISPLAY_GEOMETRY[display];
        widget.w = geo.w;
        widget.h = geo.h;
    } else if (wasSquare) {
        // Square → standard: restore the factory size.
        widget.w = 6;
        widget.h = 8;
    }
};

// The Style step's options, grouped into the two graphical families. `display`
// is written to the hidden display select before the form opens.
const GROUP_DRAWER_STYLE_OPTIONS = [
    {
        display: "",
        family: () => t("wih20_style_fam_buttons"),
        label: () => t("grp_display_standard"),
        description: () => t("wih20_style_standard_desc"),
        preview: "shortcut",
    },
    {
        display: "tile",
        family: () => t("wih20_style_fam_tiles"),
        label: () => t("wih20_opt_tile_label"),
        description: () => t("wih20_style_tile_desc"),
        preview: "tilecard",
    },
    {
        display: "tile2",
        family: () => t("wih20_style_fam_tiles"),
        label: () => t("wih20_opt_tile2_label"),
        description: () => t("wih20_style_tile2_desc"),
        preview: "tilecard2",
    },
];

// The action chosen in the type step, held while the user picks a style.
let pendingActionType = null;

const GROUP_DRAWER_TYPE_OPTIONS = [
    {
        type: "group",
        category: t("wih20_cat_containers"),
        label: t("wih20_opt_group_label"),
        description: t("wih20_opt_group_desc"),
        preview: "group",
        featured: true,
        supports: [
            t("wih20_sup_links"),
            t("wih20_sup_headings"),
            t("wih20_sup_dividers"),
            t("wih20_sup_text"),
            t("wih20_sup_clipboard"),
            t("wih20_sup_launchers"),
        ],
    },
    {
        type: "todo-list",
        category: t("wih20_cat_containers"),
        label: t("wih20_opt_todo_label"),
        description: t("wih20_opt_todo_desc"),
        preview: "todo-list",
        featured: true,
        supports: [
            t("wih20_sup_tasks"),
            t("wih20_sup_headings"),
            t("wih20_sup_dividers"),
            t("wih20_sup_text"),
        ],
    },
    // The action family: pick what it DOES here; the next step picks how it
    // LOOKS (standard button / banner / icon / tile / large tile).
    {
        type: "link-button",
        category: t("wih20_cat_actions"),
        label: t("wih20_opt_link_label"),
        description: t("wih20_opt_link_desc"),
        preview: "shortcut",
    },
    {
        type: "clipboard-button",
        category: t("wih20_cat_actions"),
        label: t("wih20_opt_clipboard_label"),
        description: t("wih20_opt_clipboard_desc"),
        preview: "clipboard",
    },
    {
        type: "launcher-button",
        category: t("wih20_cat_actions"),
        label: t("wih20_opt_launcher_label"),
        description: t("wih20_opt_launcher_desc"),
        preview: "launcher",
    },
    {
        type: "routine-button",
        category: t("wih20_cat_actions"),
        label: t("wih20_opt_routine_label"),
        description: t("wih20_opt_routine_desc"),
        preview: "routine",
    },
    {
        type: "section-header",
        category: t("wih20_cat_text"),
        label: t("wih20_opt_header_label"),
        description: t("wih20_opt_header_desc"),
        preview: "heading",
    },
    {
        type: "section-text",
        category: t("wih20_cat_text"),
        label: t("wih20_opt_text_label"),
        description: t("wih20_opt_text_desc"),
        preview: "text",
    },
    {
        type: "section-callout",
        category: t("wih20_cat_text"),
        label: t("wih20_opt_callout_label"),
        description: t("wih20_opt_callout_desc"),
        preview: "callout",
    },
    {
        type: "section-code",
        category: t("wih20_cat_text"),
        label: t("wih20_opt_code_label"),
        description: t("wih20_opt_code_desc"),
        preview: "code",
    },
    {
        type: "section-stepheader",
        category: t("wih20_cat_steps"),
        label: t("wih20_opt_stepheader_label"),
        description: t("wih20_opt_stepheader_desc"),
        preview: "stepheading",
    },
    {
        type: "section-steps",
        category: t("wih20_cat_steps"),
        label: t("wih20_opt_steps_label"),
        description: t("wih20_opt_steps_desc"),
        preview: "steps",
    },
    {
        type: "section-image",
        category: t("wih20_cat_media"),
        label: t("wih20_opt_image_label"),
        description: t("wih20_opt_image_desc"),
        preview: "image",
        directAdd: true,
    },
    {
        type: "section-profile",
        category: t("wih20_cat_media"),
        label: t("wih20_opt_profile_label"),
        description: t("wih20_opt_profile_desc"),
        preview: "profile",
    },
    {
        type: "section-linkcard",
        category: t("wih20_cat_media"),
        label: t("wih20_opt_linkcard_label"),
        description: t("wih20_opt_linkcard_desc"),
        preview: "linkcard",
    },
    {
        type: "section-file",
        category: t("wih20_cat_media"),
        label: t("wih20_opt_file_label"),
        description: t("wih20_opt_file_desc"),
        preview: "file",
    },
    {
        type: "section-divider",
        category: t("wih20_cat_structure"),
        label: t("wih20_opt_divider_label"),
        description: t("wih20_opt_divider_desc"),
        preview: "divider",
        directAdd: true,
    },
    // Arrow element temporarily disabled — hidden from the add panel until its
    // sizing/direction behavior is reworked. Rendering/serialization for any
    // existing arrows is left intact; users just can't add new ones.
    // {
    //     type: "section-arrow",
    //     category: "Structure",
    //     label: "Arrow",
    //     description: "Point attention with a directional marker.",
    //     preview: "arrow",
    //     directAdd: true,
    // },
];

const GROUP_DRAWER_TYPE_OPTION_MAP = new Map(
    GROUP_DRAWER_TYPE_OPTIONS.map((option) => [option.type, option]),
);

const GROUP_ITEM_TO_BUTTON_TYPE = {
    link: "link-button",
    clipboard: "clipboard-button",
    launcher: "launcher-button",
    routine: "routine-button",
};

const BUTTON_TO_GROUP_ITEM_TYPE = {
    "link-button": "link",
    "clipboard-button": "clipboard",
    "launcher-button": "launcher",
    "routine-button": "routine",
};

const getWidgetElementType = (widget) => {
    const widgetType = widget?.type || widget?.content?.type;
    if (TOP_LEVEL_BUTTON_TYPES.has(widgetType)) return widgetType;
    if (widgetType === "todo-list") return "todo-list";
    return "group";
};

const getGroupDrawerElementType = () =>
    getGroupDrawerElements().groupElementTypeSelect?.value || "group";

const getElementTypeLabel = (elementType) =>
    SECTION_LABELS[elementType] ||
    (elementType === "link-button"
        ? t("wih20_opt_link_label")
        : elementType === "clipboard-button"
          ? t("wih20_opt_clipboard_label")
          : elementType === "launcher-button"
            ? t("wih20_opt_launcher_label")
            : elementType === "routine-button"
              ? t("wih20_opt_routine_label")
              : elementType === "todo-list"
                ? t("wih20_opt_todo_label")
                : t("wih20_opt_group_label"));

const _isGroupDrawerCreateMode = () =>
    (groupBackdrop?.dataset.mode || "new") !== "edit";

const _getGroupDrawerStep = () =>
    groupBackdrop?.dataset.step || GROUP_DRAWER_STEP_PICKER;

const _isElementVisible = (element) =>
    !!element &&
    element.offsetParent !== null &&
    getComputedStyle(element).display !== "none" &&
    getComputedStyle(element).visibility !== "hidden";

const DIRECT_ADD_SECTION_TYPES = new Set([
    "section-divider",
    "section-arrow",
    "section-image",
]);

const sanitizeSectionHttpUrl = (rawValue) => {
    const candidates = [rawValue, normalizeLinkUrl(rawValue)];
    for (const candidate of candidates) {
        try {
            const value = String(candidate || "").trim();
            if (!value) continue;
            const url = new URL(value);
            if (["http:", "https:"].includes(url.protocol)) return url.href;
        } catch {
            /* try next */
        }
    }
    return "";
};

const _showElementAddedToast = (elementType) => {
    showToast(t("wih20_added_x", [getElementTypeLabel(elementType)]), false, {
        durationMs: 5000,
        dismissible: true,
        singletonKey: "element-added",
    });
};

const _renderProfileAvatarPresetSelection = (selectedAvatar = "preset:a1") => {
    const { groupSectionProfileAvatarGrid } = getGroupDrawerElements();
    if (!groupSectionProfileAvatarGrid) return;

    groupSectionProfileAvatarGrid.dataset.selectedAvatar = selectedAvatar;
    groupSectionProfileAvatarGrid
        .querySelectorAll(".avatar-opt")
        .forEach((button) => {
            const isSelected = button.dataset.avatar === selectedAvatar;
            button.classList.toggle("selected", isSelected);
            button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
};

const _ensureProfileAvatarPresetOptions = () => {
    const { groupSectionProfileAvatarGrid } = getGroupDrawerElements();
    if (
        !groupSectionProfileAvatarGrid ||
        groupSectionProfileAvatarGrid.dataset.optionsBuilt === "1"
    ) {
        return;
    }

    groupSectionProfileAvatarGrid.replaceChildren();
    PRESET_AVATAR_IDS.forEach((id, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "avatar-opt";
        button.dataset.avatar = `preset:${id}`;
        button.setAttribute("aria-label", t("wih20_preset_avatar_n", [index + 1]));
        button.setAttribute("aria-pressed", "false");
        button.innerHTML = PRESET_AVATARS[id];
        groupSectionProfileAvatarGrid.appendChild(button);
    });

    groupSectionProfileAvatarGrid.dataset.optionsBuilt = "1";
    _renderProfileAvatarPresetSelection("preset:a1");
};

const _buildGroupTypePreviewMarkup = (preview) => {
    switch (preview) {
        case "group":
            return '<div class="group-type-card-preview group-type-card-preview--group"><span></span><span></span><span></span></div>';
        case "todo-list":
            return '<div class="group-type-card-preview group-type-card-preview--todo-list"><span></span><span></span><span></span></div>';
        case "shortcut":
            return '<div class="group-type-card-preview group-type-card-preview--shortcut"><span></span></div>';
        case "tilecard":
            return '<div class="group-type-card-preview group-type-card-preview--tilecard"><span></span></div>';
        case "tilecard2":
            return '<div class="group-type-card-preview group-type-card-preview--tilecard group-type-card-preview--tilecard2"><span></span></div>';
        case "routine":
            return '<div class="group-type-card-preview group-type-card-preview--routine"><span></span><span></span></div>';
        case "clipboard":
            return '<div class="group-type-card-preview group-type-card-preview--clipboard"><span></span><span></span></div>';
        case "launcher":
            return '<div class="group-type-card-preview group-type-card-preview--launcher"><span></span><span></span></div>';
        case "heading":
            return '<div class="group-type-card-preview group-type-card-preview--heading"><span></span><span></span></div>';
        case "stepheading":
            return '<div class="group-type-card-preview group-type-card-preview--stepheading"><span></span><span></span></div>';
        case "text":
            return '<div class="group-type-card-preview group-type-card-preview--text"><span></span><span></span><span></span></div>';
        case "callout":
            return '<div class="group-type-card-preview group-type-card-preview--callout"><span></span><span></span></div>';
        case "code":
            return '<div class="group-type-card-preview group-type-card-preview--code"><span></span><span></span><span></span></div>';
        case "steps":
            return '<div class="group-type-card-preview group-type-card-preview--steps"><span></span><span></span><span></span></div>';
        case "image":
            return '<div class="group-type-card-preview group-type-card-preview--image"><span></span></div>';
        case "profile":
            return '<div class="group-type-card-preview group-type-card-preview--profile"><span></span><span></span><span></span></div>';
        case "linkcard":
            return '<div class="group-type-card-preview group-type-card-preview--linkcard"><span></span><span></span></div>';
        case "file":
            return '<div class="group-type-card-preview group-type-card-preview--file"><span></span><span></span></div>';
        case "divider":
            return '<div class="group-type-card-preview group-type-card-preview--divider"><span></span></div>';
        case "arrow":
            return '<div class="group-type-card-preview group-type-card-preview--arrow"><span></span></div>';
        default:
            return '<div class="group-type-card-preview"><span></span></div>';
    }
};

const _syncGroupTypePickerSelection = (selectedType) => {
    const {
        groupTypePickerGroups,
        groupSelectedTypeLabel,
        groupLinkButtonDisplaySelect,
    } = getGroupDrawerElements();
    // Shortcut and the two tiles share the link-button type; the display
    // select decides which of the cards is the selected one.
    const selectedDisplay =
        selectedType === "link-button" &&
        ["tile", "tile2"].includes(groupLinkButtonDisplaySelect?.value)
            ? groupLinkButtonDisplaySelect.value
            : "";
    if (groupSelectedTypeLabel) {
        groupSelectedTypeLabel.textContent =
            selectedDisplay === "tile"
                ? t("wih20_opt_tile_label")
                : selectedDisplay === "tile2"
                    ? t("wih20_opt_tile2_label")
                    : getElementTypeLabel(selectedType);
    }
    if (!groupTypePickerGroups) return;
    groupTypePickerGroups
        .querySelectorAll(".group-type-card")
        .forEach((card) => {
            const isSelected =
                card.dataset.elementType === selectedType &&
                (card.dataset.display || "") === selectedDisplay;
            card.classList.toggle("selected", isSelected);
            card.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
};

const _getGroupDrawerFocusTarget = () => {
    const {
        groupSectionTextareaInput,
        groupSectionProfileAvatarGrid,
        groupSectionProfileAvatarUrlInput,
        groupSectionFileUrlInput,
        groupSectionLinkcardUrlInput,
    } = getGroupDrawerElements();
    const elementType = getGroupDrawerElementType();

    if (
        (elementType === "section-text" || elementType === "section-code") &&
        _isElementVisible(groupSectionTextareaInput)
    ) {
        return groupSectionTextareaInput;
    }

    if (
        elementType === "section-profile" &&
        _isElementVisible(groupSectionProfileAvatarGrid)
    ) {
        return (
            groupSectionProfileAvatarGrid.querySelector(".avatar-opt") ||
            groupSectionProfileAvatarUrlInput
        );
    }

    if (
        elementType === "section-file" &&
        _isElementVisible(groupSectionFileUrlInput)
    ) {
        return groupSectionFileUrlInput;
    }

    if (
        elementType === "section-linkcard" &&
        _isElementVisible(groupSectionLinkcardUrlInput)
    ) {
        return groupSectionLinkcardUrlInput;
    }

    return _isElementVisible(groupInput) ? groupInput : addGroupButton;
};

const _setGroupDrawerStep = (step, { focus = false } = {}) => {
    if (!groupBackdrop) return;

    groupBackdrop.dataset.step = step;

    const { drawerTitle, groupBackButton, groupStyleActionLabel } =
        getGroupDrawerElements();
    if (drawerTitle && step === GROUP_DRAWER_STEP_PICKER) {
        drawerTitle.textContent = t("wih20_add_element");
    } else if (drawerTitle && step === GROUP_DRAWER_STEP_STYLE) {
        drawerTitle.textContent = t("grp_choose_style");
        _renderGroupStylePicker();
        // Breadcrumb: which action the style will apply to.
        if (groupStyleActionLabel) {
            groupStyleActionLabel.textContent = getElementTypeLabel(
                pendingActionType || "link-button",
            );
        }
    } else {
        updateGroupDrawerLabels({
            mode: groupBackdrop.dataset.mode || "new",
            elementType: getGroupDrawerElementType(),
        });
    }

    if (groupBackButton) {
        groupBackButton.hidden =
            step !== GROUP_DRAWER_STEP_FORM || !_isGroupDrawerCreateMode();
    }

    if (!focus) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const current = _getGroupDrawerStep();
            if (current === GROUP_DRAWER_STEP_PICKER) {
                document
                    .querySelector("#group-type-picker-groups .group-type-card")
                    ?.focus({ preventScroll: true });
                return;
            }
            if (current === GROUP_DRAWER_STEP_STYLE) {
                document
                    .querySelector(
                        "#group-style-picker-groups .group-type-card",
                    )
                    ?.focus({ preventScroll: true });
                return;
            }
            _getGroupDrawerFocusTarget()?.focus?.({ preventScroll: true });
        });
    });
};

const _selectGroupDrawerType = (elementType, { focus = true } = {}) => {
    const { groupElementTypeSelect } = getGroupDrawerElements();
    if (!groupElementTypeSelect) return;

    groupElementTypeSelect.value = elementType;
    groupElementTypeSelect.dispatchEvent(new Event("change"));
    _setGroupDrawerStep(GROUP_DRAWER_STEP_FORM, { focus });
};

const _renderGroupTypePicker = () => {
    const { groupTypePickerGroups } = getGroupDrawerElements();
    if (
        !groupTypePickerGroups ||
        groupTypePickerGroups.dataset.rendered === "1"
    ) {
        _syncGroupTypePickerSelection(getGroupDrawerElementType());
        return;
    }

    const groups = GROUP_DRAWER_TYPE_OPTIONS.reduce((map, option) => {
        if (!map.has(option.category)) map.set(option.category, []);
        map.get(option.category).push(option);
        return map;
    }, new Map());

    groupTypePickerGroups.replaceChildren();
    groups.forEach((options, category) => {
        const section = document.createElement("section");
        section.className = "group-type-picker-category";

        const heading = document.createElement("h3");
        heading.className = "group-type-picker-category-title";
        heading.textContent = category;
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "group-type-picker-grid";

        options.forEach((option) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = `group-type-card${option.featured ? " group-type-card--featured" : ""}`;
            card.dataset.elementType = option.type;
            if (option.display) card.dataset.display = option.display;
            card.setAttribute("aria-pressed", "false");
            const supportsMarkup = Array.isArray(option.supports)
                ? `<span class="group-type-card-supports-label">${t("wih20_can_contain")}</span>
                   <span class="group-type-card-supports">${option.supports.join(" · ")}</span>`
                : "";
            const directAddMarkup = option.directAdd
                ? `<span class="group-type-card-meta-badge">${t("wih20_adds_immediately")}</span>`
                : "";
            card.innerHTML = `
                ${_buildGroupTypePreviewMarkup(option.preview)}
                <span class="group-type-card-title">${option.label}</span>
                <span class="group-type-card-description">${option.description}</span>
                ${directAddMarkup}
                ${supportsMarkup}
            `;
            grid.appendChild(card);
        });

        section.appendChild(grid);
        groupTypePickerGroups.appendChild(section);
    });

    groupTypePickerGroups.dataset.rendered = "1";
    _syncGroupTypePickerSelection(getGroupDrawerElementType());
};

// Render the Style step's cards (grouped by graphical family). Built once;
// each card carries data-display, read by the click handler.
const _renderGroupStylePicker = () => {
    const { groupStylePickerGroups } = getGroupDrawerElements();
    if (!groupStylePickerGroups || groupStylePickerGroups.dataset.rendered === "1")
        return;

    const families = GROUP_DRAWER_STYLE_OPTIONS.reduce((map, option) => {
        const family = option.family();
        if (!map.has(family)) map.set(family, []);
        map.get(family).push(option);
        return map;
    }, new Map());

    groupStylePickerGroups.replaceChildren();
    families.forEach((options, family) => {
        const section = document.createElement("section");
        section.className = "group-type-picker-category";

        const heading = document.createElement("h3");
        heading.className = "group-type-picker-category-title";
        heading.textContent = family;
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "group-type-picker-grid";

        options.forEach((option) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "group-type-card";
            card.dataset.display = option.display;
            card.setAttribute("aria-pressed", "false");
            card.innerHTML = `
                ${_buildGroupTypePreviewMarkup(option.preview)}
                <span class="group-type-card-title">${option.label()}</span>
                <span class="group-type-card-description">${option.description()}</span>
            `;
            grid.appendChild(card);
        });

        section.appendChild(grid);
        groupStylePickerGroups.appendChild(section);
    });

    groupStylePickerGroups.dataset.rendered = "1";
};

const isStandardGroupWidget = (widget) =>
    getWidgetElementType(widget) === "group" &&
    (widget?.type || widget?.content?.type || "standard") !== "todo-list";

const normalizeGroupItems = (items = []) =>
    [...items]
        .sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0))
        .map((entry, index) => ({
            ...entry,
            y: index,
        }));

// Converted items land in the TOP (shortcuts) zone, so the insertion row must
// come from that zone's own bottom edge — reducing over ALL elements let the
// main board's groups push the y far below the actual shortcuts (visible ever
// since the top zone stopped auto-packing with float:true).
const getNextTopZoneY = (elements = []) =>
    elements.reduce(
        (maxBottom, widget) =>
            String(widget?.type || "").endsWith("-button") &&
            widget?.zone !== "main"
                ? Math.max(maxBottom, (widget?.y || 0) + (widget?.h || 12))
                : maxBottom,
        0,
    );

const buildUniqueConvertedWidgetName = (elements, preferredName) => {
    const trimmedPreferredName =
        String(preferredName || "").trim() || t("wih20_converted_button");
    const existingNames = new Set(
        (elements || [])
            .map((entry) => entry?.name || entry?.content?.name || "")
            .filter(Boolean),
    );

    if (!existingNames.has(trimmedPreferredName)) {
        return trimmedPreferredName;
    }

    let suffix = 1;
    let candidate = `${trimmedPreferredName} (button)`;
    while (existingNames.has(candidate)) {
        suffix += 1;
        candidate = `${trimmedPreferredName} (button ${suffix})`;
    }
    return candidate;
};

const cloneTransferValue = (value) => {
    if (value && typeof value === "object") {
        return JSON.parse(JSON.stringify(value));
    }
    return value;
};

const copyMappedFields = (target, source, keys) => {
    if (!source || !target) return target;
    keys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(source, key)) return;
        const value = source[key];
        if (typeof value === "undefined") return;
        target[key] = cloneTransferValue(value);
    });
    return target;
};

const SHARED_ITEM_VISUAL_FIELDS = ["icon", "iconColor", "style"];
const LINK_CONVERSION_FIELDS = ["url", "targetOverride"];
const CLIPBOARD_CONVERSION_FIELDS = ["content"];
const LAUNCHER_CONVERSION_FIELDS = ["launcherKind", "target", "visible"];
const ROUTINE_CONVERSION_FIELDS = ["steps", "stagger"];


const buildTopLevelWidgetFromGroupItem = (elements, item, display) => {
    const itemType = item?.type || "link";
    const widgetType = GROUP_ITEM_TO_BUTTON_TYPE[itemType] || "link-button";
    const widgetName = buildUniqueConvertedWidgetName(
        elements,
        item?.name || "",
    );
    // Same geometry the add-elements drawer uses per display: standard 6×8,
    // square tiles use their pinned column spans (renderer re-derives h).
    const size =
        display === "tile"
            ? { w: 1, h: 8 }
            : display === "tile2"
              ? { w: 2, h: 16 }
              : { w: 6, h: 8 };
    const widget = {
        name: widgetName,
        type: widgetType,
        x: 0,
        y: getNextTopZoneY(elements),
        w: size.w,
        h: size.h,
        id: widgetName,
    };
    if (display === "tile" || display === "tile2") widget.display = display;

    copyMappedFields(widget, item, SHARED_ITEM_VISUAL_FIELDS);

    if (itemType === "link") {
        copyMappedFields(widget, item, LINK_CONVERSION_FIELDS);
        return widget;
    }

    if (itemType === "clipboard") {
        copyMappedFields(widget, item, CLIPBOARD_CONVERSION_FIELDS);
        return widget;
    }

    if (itemType === "routine") {
        copyMappedFields(widget, item, ROUTINE_CONVERSION_FIELDS);
        return widget;
    }

    copyMappedFields(widget, item, LAUNCHER_CONVERSION_FIELDS);
    if ((widget.launcherKind || "app") !== "powershell") {
        delete widget.visible;
    }
    return widget;
};

const buildGroupItemFromTopLevelWidget = (widget) => {
    const widgetType = getWidgetElementType(widget);
    const itemType = BUTTON_TO_GROUP_ITEM_TYPE[widgetType] || "link";
    const item = {
        name: widget?.name || "",
        type: itemType,
    };

    copyMappedFields(item, widget, SHARED_ITEM_VISUAL_FIELDS);

    if (itemType === "link") {
        copyMappedFields(item, widget, LINK_CONVERSION_FIELDS);
        return item;
    }

    if (itemType === "clipboard") {
        copyMappedFields(item, widget, CLIPBOARD_CONVERSION_FIELDS);
        return item;
    }

    if (itemType === "routine") {
        copyMappedFields(item, widget, ROUTINE_CONVERSION_FIELDS);
        return item;
    }

    copyMappedFields(item, widget, LAUNCHER_CONVERSION_FIELDS);
    if ((item.launcherKind || "app") !== "powershell") {
        delete item.visible;
    }
    return item;
};

const persistCurrentWorkspaceElements = async (elements) => {
    setWorkspaceGroups(getCurrentWorkspace(), elements);
    await saveWorkspacesToStorage();
    createItems(elements, true);
};

let closeConvertButtonToGroupModal = null;


// Mirror of the link editor's autofetch-favicon card, for Shortcut-family
// widgets in the drawer: while the toggle is on the manual picker is hidden
// and the icon tracks the URL field's favicon. The toggle's initial state is
// set by the open/populate paths (off when editing a custom icon).
const _getGroupAutofetchElements = () => ({
    card: document.getElementById("group-autofetch-icon-card"),
    toggle: document.getElementById("group-autofetch-icon-toggle"),
    body: document.querySelector(
        ".group-drawer-icon-collapsible-content .add-drawer-card-body--icon",
    ),
});

const _syncGroupAutofetchUi = () => {
    const { card, toggle, body } = _getGroupAutofetchElements();
    const eligible =
        getGroupDrawerElementType() === "link-button" &&
        window.autoFaviconEnabled !== false;
    const on = eligible && !!toggle?.checked;
    if (card) card.style.display = eligible ? "" : "none";
    if (body) body.classList.toggle("rt-autofetch-on", on);
    if (on) {
        const { groupLinkButtonUrlInput } = getGroupDrawerElements();
        autofetchFaviconIntoPicker(
            groupLinkButtonUrlInput?.value || "",
            GROUP_PICKER_OPTIONS,
        );
    }
};

const _bindGroupAutofetchOnce = () => {
    const { toggle } = _getGroupAutofetchElements();
    if (toggle && !toggle.dataset.drawerBound) {
        toggle.dataset.drawerBound = "1";
        toggle.addEventListener("change", _syncGroupAutofetchUi);
    }
    const { groupLinkButtonUrlInput } = getGroupDrawerElements();
    if (
        groupLinkButtonUrlInput &&
        !groupLinkButtonUrlInput.dataset.autofetchBound
    ) {
        groupLinkButtonUrlInput.dataset.autofetchBound = "1";
        groupLinkButtonUrlInput.addEventListener(
            "input",
            _syncGroupAutofetchUi,
        );
    }
    if (
        groupLinkButtonUrlInput &&
        !groupLinkButtonUrlInput.dataset.autofillBound
    ) {
        groupLinkButtonUrlInput.dataset.autofillBound = "1";
        groupLinkButtonUrlInput.addEventListener("input", () => {
            // Autofill the button text from the URL (Standard / Tile / Large
            // tile). Never overwrites text the user already typed.
            if (getGroupDrawerElementType() !== "link-button") return;
            if (groupInput && !groupInput.value.trim()) {
                const derived = getNameFromUrl(
                    groupLinkButtonUrlInput.value.trim(),
                );
                if (derived) {
                    groupInput.value = derived;
                    groupInput.dispatchEvent(
                        new Event("input", { bubbles: true }),
                    );
                }
            }
        });
    }
};

const updateGroupDrawerLabels = ({
    mode = "new",
    elementType = "group",
} = {}) => {
    const {
        drawerTitle,
        groupNameLabel,
        groupLinkButtonUrlInput,
        groupLinkButtonUrlField,
        groupLinkButtonDisplayField,
        groupNameField,
        groupSectionTextareaInput,
    } = getGroupDrawerElements();

    const isTopLevelButton = TOP_LEVEL_BUTTON_TYPES.has(elementType);
    const isLinkButton = elementType === "link-button";
    const isEdit = mode === "edit";
    const displayVariant = isLinkButton
        ? getGroupDrawerElements().groupLinkButtonDisplaySelect?.value
        : "";
    const elementLabel =
        displayVariant === "tile"
              ? t("wih20_opt_tile_label")
              : displayVariant === "tile2"
                ? t("wih20_opt_tile2_label")
                : getElementTypeLabel(elementType);

    if (drawerTitle) {
        drawerTitle.textContent = isEdit
            ? t("wih20_edit_x", [elementLabel])
            : t("wih20_add_x", [elementLabel]);
    }

    if (addGroupButton) {
        addGroupButton.textContent = isEdit
            ? t("wih20_save_x", [elementLabel])
            : t("wih20_add_x", [elementLabel]);
    }

    const isSection = SECTION_TYPES.has(elementType);
    const sectionNameLabel =
        elementType === "section-header"
            ? t("wih20_field_heading_text")
            : elementType === "section-text"
              ? t("wih20_field_text")
              : elementType === "section-callout"
                ? t("wih20_field_callout_text")
                : elementType === "section-code"
                  ? t("wih20_field_code")
                  : elementType === "section-steps"
                    ? t("wih20_field_first_step")
                    : t("wih20_field_label_optional");

    if (groupNameLabel) {
        groupNameLabel.textContent = isSection
            ? sectionNameLabel
            : isTopLevelButton
              ? t("wih20_field_button_text")
              : t("wih20_field_group_name");
    }

    if (groupInput) {
        groupInput.placeholder = isSection
            ? sectionNameLabel
            : isTopLevelButton
              ? t("wih20_ph_important_shortcut")
              : t("wih20_field_group_name");
    }

    if (groupLinkButtonUrlInput) {
        groupLinkButtonUrlInput.placeholder = "https://example.com";
    }

    if (groupLinkButtonUrlField) {
        groupLinkButtonUrlField.style.display = isLinkButton ? "" : "none";
    }

    if (groupLinkButtonDisplayField) {
        // Style is chosen in the wizard's Style step (or the widget menu), not
        // in the form — the select stays in the DOM as the state holder only.
        groupLinkButtonDisplayField.style.display = "none";
    }
    _bindGroupAutofetchOnce();
    _syncGroupAutofetchUi();

    const groupSectionTextareaLabel = document.getElementById(
        "group-section-textarea-label",
    );
    if (groupSectionTextareaInput) {
        groupSectionTextareaInput.placeholder =
            elementType === "section-code"
                ? t("wih20_ph_write_code")
                : t("wih20_ph_write_text");
    }
    if (groupSectionTextareaLabel) {
        groupSectionTextareaLabel.textContent =
            elementType === "section-code" ? t("wih20_field_code") : t("wih20_field_text");
    }

    if (groupNameField) {
        groupNameField.dataset.elementType = elementType;
    }
};

const syncGroupDrawerSections = () => {
    const {
        groupElementTypeSelect,
        groupTypeField,
        groupTypeHint,
        groupLinkButtonUrlField,
        groupLinkButtonDisplayField,
        groupClipboardContentField,
        groupSectionTextareaField,
        groupSectionProfileAvatarPresetField,
        groupSectionProfileAvatarUrlField,
        groupSectionFileUrlField,
        groupSectionLinkcardUrlField,
        groupLauncherFields,
        groupRoutineFields,
        groupLinkButtonBgRow,
        groupLinkButtonFontSizeRow,
        groupElementTypeHint,
        groupColorSection,
    } = {
        ...getGroupDrawerElements(),
        groupTypeField: document.getElementById("group-type-field"),
        groupTypeHint: document.getElementById("group-type-hint"),
    };

    const elementType = groupElementTypeSelect?.value || "group";
    const isLinkButton = elementType === "link-button";
    const isClipboardButton = elementType === "clipboard-button";
    const isLauncherButton = elementType === "launcher-button";
    const isRoutineButton = elementType === "routine-button";
    const isTopLevelButton = TOP_LEVEL_BUTTON_TYPES.has(elementType);
    const isSection = SECTION_TYPES.has(elementType);
    const isDivider = elementType === "section-divider";
    const isTextSection = elementType === "section-text";
    const isCodeSection = elementType === "section-code";
    const isImageSection = elementType === "section-image";
    const isProfileSection = elementType === "section-profile";
    const isFileSection = elementType === "section-file";
    const isLinkCardSection = elementType === "section-linkcard";
    const isTextareaSection = isTextSection || isCodeSection;
    const isContentless =
        isDivider ||
        elementType === "section-arrow" ||
        isImageSection ||
        isProfileSection ||
        elementType === "section-linkcard" ||
        isFileSection;
    const mode = groupBackdrop?.dataset.mode || "new";

    // Sections only use the (optional) name field as their text seed — hide
    // group-type, icon, and the name field entirely for dividers.
    const groupNameFieldEl = document.getElementById("group-name-field");
    if (groupNameFieldEl)
        groupNameFieldEl.style.display =
            isContentless || isTextareaSection ? "none" : "";
    const groupIconCollapsible = document.getElementById(
        "group-icon-collapsible",
    );
    if (groupIconCollapsible)
        groupIconCollapsible.style.display = isSection ? "none" : "";

    // The group type (standard vs todo-list) is now chosen via the element-type
    // picker (Group vs To-do list), so the in-form type selector is retired.
    if (groupTypeField) groupTypeField.style.display = "none";
    if (groupLinkButtonUrlField) {
        groupLinkButtonUrlField.style.display = isLinkButton ? "" : "none";
    }
    if (groupLinkButtonDisplayField) {
        // Style is chosen in the wizard's Style step (or the widget menu), not
        // in the form — the select stays in the DOM as the state holder only.
        groupLinkButtonDisplayField.style.display = "none";
    }
    _bindGroupAutofetchOnce();
    _syncGroupAutofetchUi();
    if (groupClipboardContentField) {
        groupClipboardContentField.style.display = isClipboardButton
            ? ""
            : "none";
    }
    if (groupSectionTextareaField) {
        groupSectionTextareaField.style.display =
            isTextSection || isCodeSection ? "" : "none";
    }
    if (groupSectionProfileAvatarPresetField) {
        groupSectionProfileAvatarPresetField.style.display = isProfileSection
            ? ""
            : "none";
    }
    if (groupSectionProfileAvatarUrlField) {
        groupSectionProfileAvatarUrlField.style.display = isProfileSection
            ? ""
            : "none";
    }
    if (groupSectionFileUrlField) {
        groupSectionFileUrlField.style.display = isFileSection ? "" : "none";
    }
    if (groupSectionLinkcardUrlField) {
        groupSectionLinkcardUrlField.style.display = isLinkCardSection
            ? ""
            : "none";
    }
    if (groupLauncherFields) {
        groupLauncherFields.style.display = isLauncherButton ? "" : "none";
    }
    if (groupRoutineFields) {
        groupRoutineFields.style.display = isRoutineButton ? "" : "none";
        if (isRoutineButton) getGroupRoutineEditor();
    }
    if (groupLinkButtonBgRow) {
        groupLinkButtonBgRow.style.display = isTopLevelButton ? "" : "none";
    }
    if (groupLinkButtonFontSizeRow) {
        groupLinkButtonFontSizeRow.style.display = isTopLevelButton
            ? ""
            : "none";
    }
    if (groupColorSection) {
        groupColorSection.style.display = isSection ? "none" : "";
    }
    if (groupTypeHint && isTopLevelButton) groupTypeHint.style.display = "none";
    if (groupElementTypeHint) {
        groupElementTypeHint.style.display = mode === "edit" ? "" : "none";
    }

    _syncGroupTypePickerSelection(elementType);
    updateGroupDrawerLabels({ mode, elementType });
};

const _toHexSimple = (val) => {
    if (!val) return null;
    const trimmed = String(val).trim();

    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
        if (trimmed.length === 4) {
            return (
                "#" +
                trimmed[1] +
                trimmed[1] +
                trimmed[2] +
                trimmed[2] +
                trimmed[3] +
                trimmed[3]
            );
        }
        return trimmed.slice(0, 7);
    }

    try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#888888";
        ctx.fillStyle = trimmed;
        const normalized = ctx.fillStyle;
        if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
    } catch {}

    return null;
};

const _parseColorForPicker = (val) => {
    if (!val) return { hex: "#888888", alpha: 100 };

    const trimmed = String(val).trim();
    const rgbaMatch = trimmed.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );

    if (rgbaMatch) {
        const r = Math.max(0, Math.min(255, Math.round(+rgbaMatch[1])));
        const g = Math.max(0, Math.min(255, Math.round(+rgbaMatch[2])));
        const b = Math.max(0, Math.min(255, Math.round(+rgbaMatch[3])));
        const a = rgbaMatch[4] !== undefined ? +rgbaMatch[4] : 1;

        return {
            hex:
                "#" +
                [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join(""),
            alpha: Math.max(0, Math.min(100, Math.round(a * 100))),
        };
    }

    return {
        hex: _toHexSimple(trimmed) || "#888888",
        alpha: 100,
    };
};

const _colorFromPicker = (hex, alpha) => {
    const safeHex = _toHexSimple(hex) || "#888888";
    const safeAlpha = Math.max(0, Math.min(100, parseInt(alpha, 10) || 0));

    if (safeAlpha >= 100) return safeHex;

    const r = parseInt(safeHex.slice(1, 3), 16);
    const g = parseInt(safeHex.slice(3, 5), 16);
    const b = parseInt(safeHex.slice(5, 7), 16);
    const a = +(safeAlpha / 100).toFixed(2);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const _setGroupLauncherKindUi = (kindValue) => {
    const {
        groupLauncherTargetLabel,
        groupLauncherTarget,
        groupLauncherBrowseBtn,
        groupLauncherPsRow,
        groupLauncherExamples,
    } = getGroupDrawerElements();

    const kind = kindValue || "app";
    const isApp = kind === "app";
    const isFolder = kind === "folder";
    const isFile = kind === "file";
    const isPs = kind === "powershell";

    if (groupLauncherTargetLabel) {
        groupLauncherTargetLabel.textContent = isPs
            ? t("wih20_launcher_label_command")
            : isApp
              ? t("wih20_launcher_label_target_uri")
              : t("wih20_launcher_label_path");
    }

    if (groupLauncherTarget) {
        if (isFolder)
            groupLauncherTarget.placeholder = "C:\\Users\\you\\Projects";
        else if (isFile)
            groupLauncherTarget.placeholder = "C:\\Users\\you\\document.pdf";
        else if (isPs)
            groupLauncherTarget.placeholder = "/path/to/script.sh --flag";
        else
            groupLauncherTarget.placeholder = "vscode://file/C:/Projects/myapp";
    }

    if (groupLauncherBrowseBtn) {
        groupLauncherBrowseBtn.style.display = isFolder || isFile ? "" : "none";
    }
    if (groupLauncherPsRow) {
        groupLauncherPsRow.style.display = isPs ? "" : "none";
    }
    if (groupLauncherExamples) {
        groupLauncherExamples.style.display = isApp ? "" : "none";
    }
};

const _getGroupIconSizeValue = () => {
    const { groupIconSizeInput } = getGroupDrawerElements();
    return Math.max(
        12,
        Math.min(32, parseInt(groupIconSizeInput?.value, 10) || 16),
    );
};

const _setGroupSizeControls = (sizeValue) => {
    const { groupIconSizeInput, groupIconSizeSlider, groupIconSizeValueLabel } =
        getGroupDrawerElements();
    const normalizedSize = Math.max(
        12,
        Math.min(32, parseInt(sizeValue, 10) || 16),
    );

    if (groupIconSizeInput) groupIconSizeInput.value = String(normalizedSize);
    if (groupIconSizeSlider) groupIconSizeSlider.value = String(normalizedSize);
    if (groupIconSizeValueLabel) {
        groupIconSizeValueLabel.textContent = `${normalizedSize}px`;
    }

    _syncGroupIconPreview();
};

const _getGroupEditTarget = () => {
    if (groupBackdrop?.dataset.mode !== "edit") return null;
    const originalName = groupBackdrop?.dataset.originalName || "";
    if (!originalName) return null;
    return document.querySelector(
        `.item[data-name="${CSS.escape(originalName)}"]`,
    );
};

const _renderGroupHeaderIcon = (
    container,
    iconValue,
    iconColor = "",
    iconSize = 16,
) => {
    if (!container) return false;

    const normalizedSize = Math.max(
        12,
        Math.min(32, parseInt(iconSize, 10) || 16),
    );
    const sizePx = `${normalizedSize}px`;

    container.replaceChildren();
    container.style.display = "none";

    if (!iconValue) return false;

    const rendered = renderStoredIcon(container, iconValue, {
        imgWidth: normalizedSize,
        imgHeight: normalizedSize,
    });
    if (!rendered) return false;

    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.width = sizePx;
    container.style.height = sizePx;
    container.style.flexShrink = "0";

    const svg = container.querySelector("svg");
    if (svg) {
        svg.style.width = sizePx;
        svg.style.height = sizePx;
        if (iconColor && !isStoredIconUrl(iconValue)) {
            svg.style.fill = iconColor;
            svg.style.color = iconColor;
        } else {
            svg.style.removeProperty("fill");
            svg.style.removeProperty("color");
        }
    }

    const img = container.querySelector("img");
    if (img) {
        img.style.width = sizePx;
        img.style.height = sizePx;
    }

    return true;
};

const _getTopLevelButtonFallbackIconMarkup = (
    elementType,
    launcherKind = "app",
) => {
    if (elementType === "clipboard-button") {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>';
    }
    if (elementType === "routine-button") {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.3-23-41L73 39z"/></svg>';
    }
    if (elementType === "launcher-button") {
        if (launcherKind === "folder") {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 480H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H298.5c-17 0-33.3-6.7-45.3-18.7L226.7 50.7c-12-12-28.3-18.7-45.3-18.7H64C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64z"/></svg>';
        }
        if (launcherKind === "file") {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M0 64C0 28.7 28.7 0 64 0H224V128c0 17.7 14.3 32 32 32H384V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zm384 64H256V0L384 128z"/></svg>';
        }
        if (launcherKind === "powershell") {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416H544c17.7 0 32 14.3 32 32s-14.3 32-32 32H256c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/></svg>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3 448 192c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 128c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16L64 112c0-8.8 7.2-16 16-16l128 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg>';
};

const _renderTopLevelButtonPreviewIcon = (
    iconWrap,
    elementType,
    iconValue,
    iconColorValue,
    iconSizeValue,
    launcherKind,
) => {
    if (!iconWrap) return;

    if (!iconValue) {
        iconWrap.innerHTML = _getTopLevelButtonFallbackIconMarkup(
            elementType,
            launcherKind,
        );
        iconWrap.style.removeProperty("--icon-override");
        return;
    }

    renderStoredIcon(iconWrap, iconValue, {
        imgWidth: Math.max(16, iconSizeValue),
        imgHeight: Math.max(16, iconSizeValue),
    });
    if (iconColorValue && !isStoredIconUrl(iconValue)) {
        iconWrap.style.setProperty("--icon-override", iconColorValue);
    } else {
        iconWrap.style.removeProperty("--icon-override");
    }
};

const _applyGroupDrawerLivePreview = () => {
    const itemEl = _getGroupEditTarget();
    if (!itemEl) return;

    const elementType = getGroupDrawerElementType();
    const titleValue =
        groupInput?.value?.trim() || groupBackdrop?.dataset.originalName || "";
    const iconValue = _getGroupIconValue();
    const iconColorValue =
        getGroupDrawerElements().groupIconColorInput?.value || "";
    const iconSizeValue = _getGroupIconSizeValue();

    itemEl.dataset.groupIcon = iconValue;
    itemEl.dataset.groupIconColor = iconColorValue;
    itemEl.dataset.groupIconSize = String(iconSizeValue);

    if (TOP_LEVEL_BUTTON_TYPES.has(elementType)) {
        const {
            groupLinkButtonUrlInput,
            groupLinkButtonDisplaySelect,
            groupClipboardContentInput,
            groupLauncherKind,
            groupLauncherTarget,
            groupLauncherPsVisible,
        } = getGroupDrawerElements();
        const linkText = itemEl.querySelector(".link-button-text");
        if (linkText) linkText.textContent = titleValue;

        const rawUrl = groupLinkButtonUrlInput?.value?.trim() || "";
        const safeUrl = sanitizeLinkUrl(rawUrl);
        const launcherKind = groupLauncherKind?.value || "app";
        const launcherTarget = groupLauncherTarget?.value?.trim() || "";
        const clipboardContent = groupClipboardContentInput?.value || "";
        const launcherVisible = groupLauncherPsVisible?.checked || false;

        itemEl.dataset.groupType = elementType;
        itemEl.dataset.url = elementType === "link-button" ? safeUrl : "";
        itemEl.dataset.content =
            elementType === "clipboard-button" ? clipboardContent : "";
        itemEl.dataset.launcherKind =
            elementType === "launcher-button" ? launcherKind : "";
        itemEl.dataset.target =
            elementType === "launcher-button" ? launcherTarget : "";
        itemEl.dataset.psVisible =
            elementType === "launcher-button" && launcherVisible
                ? "true"
                : "false";

        if (elementType === "routine-button") {
            const editor = getGroupRoutineEditor();
            const steps = editor ? editor.getSteps() : [];
            const stagger = editor ? editor.getStagger() : 0;
            itemEl.dataset.routineSteps = JSON.stringify(steps);
            itemEl.dataset.routineStagger = stagger ? String(stagger) : "";
            const badge = itemEl.querySelector(".routine-step-badge");
            if (badge) {
                badge.textContent = t("wih20_step_count", [
                    steps.length,
                    steps.length === 1 ? "" : "s",
                ]);
            }
        } else {
            delete itemEl.dataset.routineSteps;
            delete itemEl.dataset.routineStagger;
        }

        const linkEl = itemEl.querySelector(".link-button-anchor");
        if (elementType === "link-button" && linkEl?.tagName === "A") {
            linkEl.href = safeUrl || "#";
        }

        const iconWrap = itemEl.querySelector(".link-button-icon");
        _renderTopLevelButtonPreviewIcon(
            iconWrap,
            elementType,
            iconValue,
            iconColorValue,
            iconSizeValue,
            launcherKind,
        );

        const styleOverrides = _getLinkButtonStyleOverrides();
        const contentContainer = itemEl.parentElement;
        itemEl.dataset.widgetStyle = JSON.stringify(styleOverrides);
        [itemEl, contentContainer].forEach((target) => {
            if (!target) return;
            target.style.removeProperty("--link-button-bg");
            target.style.removeProperty("--link-button-font-size");
            Object.entries(styleOverrides).forEach(([prop, value]) => {
                if (value) target.style.setProperty(prop, value);
            });
        });
        return;
    }

    const titleEl = itemEl.querySelector(".group-title");
    if (titleEl) titleEl.textContent = titleValue;

    let iconEl = itemEl.querySelector(".group-header-icon");
    if (!iconValue) {
        if (iconEl) iconEl.remove();
        return;
    }

    if (!iconEl) {
        const leftTitleContainer = itemEl.querySelector(
            ".left-title-container",
        );
        if (!leftTitleContainer) return;

        iconEl = document.createElement("span");
        iconEl.className = "group-header-icon";
        iconEl.setAttribute("aria-hidden", "true");

        const existingTitle = leftTitleContainer.querySelector(".group-title");
        if (existingTitle)
            leftTitleContainer.insertBefore(iconEl, existingTitle);
        else leftTitleContainer.prepend(iconEl);
    }

    _renderGroupHeaderIcon(iconEl, iconValue, iconColorValue, iconSizeValue);
};

const _syncGroupIconPreview = () => {
    const {
        groupSvgInput,
        groupChosenIcon,
        groupIconColorInput,
        groupIconSizeInput,
    } = getGroupDrawerElements();

    if (!groupChosenIcon || !groupSvgInput) return;

    const iconValue = groupSvgInput.value || "";
    const iconColor = groupIconColorInput?.value || "";
    const iconSize = Math.max(
        12,
        Math.min(32, parseInt(groupIconSizeInput?.value, 10) || 16),
    );
    const sizePx = `${iconSize}px`;

    renderStoredIconPreview(groupChosenIcon, iconValue, {
        emptyText: t("wih20_no_icon_chosen"),
    });

    groupChosenIcon.style.removeProperty("--icon-override");
    const previewSvg = groupChosenIcon.querySelector("svg");
    if (previewSvg) {
        previewSvg.style.width = sizePx;
        previewSvg.style.height = sizePx;
        if (iconColor && !isStoredIconUrl(iconValue)) {
            groupChosenIcon.style.setProperty("--icon-override", iconColor);
        }
    }

    const previewImg = groupChosenIcon.querySelector("img");
    if (previewImg) {
        previewImg.style.width = sizePx;
        previewImg.style.height = sizePx;
    }
};

const _updateGroupColorValueFromControls = () => {
    const {
        groupIconColorInput,
        groupIconColorPicker,
        groupIconColorAlpha,
        groupIconColorAlphaLabel,
    } = getGroupDrawerElements();

    if (!groupIconColorInput || !groupIconColorPicker || !groupIconColorAlpha) {
        return;
    }

    const colorValue = _colorFromPicker(
        groupIconColorPicker.value,
        groupIconColorAlpha.value,
    );

    groupIconColorInput.value = colorValue;
    if (groupIconColorAlphaLabel) {
        groupIconColorAlphaLabel.textContent = `${groupIconColorAlpha.value}%`;
    }

    _syncGroupIconPreview();
    _applyGroupDrawerLivePreview();
};

const _setGroupColorControls = (colorValue) => {
    const {
        groupIconColorInput,
        groupIconColorPicker,
        groupIconColorAlpha,
        groupIconColorAlphaLabel,
    } = getGroupDrawerElements();

    const parsed = _parseColorForPicker(colorValue);

    if (groupIconColorInput) groupIconColorInput.value = colorValue || "";
    if (groupIconColorPicker) groupIconColorPicker.value = parsed.hex;
    if (groupIconColorAlpha) groupIconColorAlpha.value = String(parsed.alpha);
    if (groupIconColorAlphaLabel) {
        groupIconColorAlphaLabel.textContent = `${parsed.alpha}%`;
    }

    _syncGroupIconPreview();
};

const _extractUsableColorToken = (rawValue) => {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) return "";
    const match = trimmed.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
    return match?.[0] || trimmed;
};

const _getEffectiveTopLevelButtonBgColor = () => {
    const itemEl = _getGroupEditTarget();
    const target = itemEl?.parentElement || itemEl;
    if (target) {
        const computed = getComputedStyle(target).backgroundColor || "";
        if (computed && computed !== "rgba(0, 0, 0, 0)") return computed;
    }

    const bodyStyles = getComputedStyle(document.body);
    return (
        _extractUsableColorToken(
            bodyStyles.getPropertyValue("--link-button-bg") ||
                bodyStyles.getPropertyValue("--card-bg") ||
                bodyStyles.getPropertyValue("--input-bg"),
        ) || ""
    );
};

const _setLinkButtonBgControls = (colorValue, options = {}) => {
    const {
        groupLinkButtonBgValue,
        groupLinkButtonBgPicker,
        groupLinkButtonBgAlpha,
        groupLinkButtonBgAlphaLabel,
    } = getGroupDrawerElements();

    const displayValue =
        options.displayValue !== undefined ? options.displayValue : colorValue;
    const parsed = _parseColorForPicker(displayValue);

    if (groupLinkButtonBgValue) {
        groupLinkButtonBgValue.value = colorValue || "";
        groupLinkButtonBgValue.dataset.hasExplicitValue = colorValue
            ? "1"
            : "0";
    }
    if (groupLinkButtonBgPicker) groupLinkButtonBgPicker.value = parsed.hex;
    if (groupLinkButtonBgAlpha) {
        groupLinkButtonBgAlpha.value = String(parsed.alpha);
    }
    if (groupLinkButtonBgAlphaLabel) {
        groupLinkButtonBgAlphaLabel.textContent = `${parsed.alpha}%`;
    }
};

const _updateLinkButtonBgValueFromControls = () => {
    const {
        groupLinkButtonBgValue,
        groupLinkButtonBgPicker,
        groupLinkButtonBgAlpha,
        groupLinkButtonBgAlphaLabel,
    } = getGroupDrawerElements();
    if (
        !groupLinkButtonBgValue ||
        !groupLinkButtonBgPicker ||
        !groupLinkButtonBgAlpha
    ) {
        return;
    }

    const colorValue = _colorFromPicker(
        groupLinkButtonBgPicker.value,
        groupLinkButtonBgAlpha.value,
    );
    groupLinkButtonBgValue.value = colorValue;
    groupLinkButtonBgValue.dataset.hasExplicitValue = "1";
    if (groupLinkButtonBgAlphaLabel) {
        groupLinkButtonBgAlphaLabel.textContent = `${groupLinkButtonBgAlpha.value}%`;
    }
};

const _setLinkButtonFontSizeControls = (fontSizeValue) => {
    const {
        groupLinkButtonFontSizeValue,
        groupLinkButtonFontSizeSlider,
        groupLinkButtonFontSizeLabel,
    } = getGroupDrawerElements();
    const normalized = Math.max(
        14,
        Math.min(24, parseInt(fontSizeValue, 10) || 16),
    );

    if (groupLinkButtonFontSizeValue) {
        groupLinkButtonFontSizeValue.value = fontSizeValue
            ? `${normalized}px`
            : "";
    }
    if (groupLinkButtonFontSizeSlider) {
        groupLinkButtonFontSizeSlider.value = String(normalized);
    }
    if (groupLinkButtonFontSizeLabel) {
        groupLinkButtonFontSizeLabel.textContent = `${normalized}px`;
    }
};

const _getLinkButtonStyleOverrides = () => {
    const { groupLinkButtonBgValue, groupLinkButtonFontSizeValue } =
        getGroupDrawerElements();
    const style = {};

    if (
        groupLinkButtonBgValue?.dataset.hasExplicitValue === "1" &&
        groupLinkButtonBgValue?.value?.trim()
    ) {
        style["--link-button-bg"] = groupLinkButtonBgValue.value.trim();
    }
    if (groupLinkButtonFontSizeValue?.value?.trim()) {
        style["--link-button-font-size"] =
            groupLinkButtonFontSizeValue.value.trim();
    }

    return style;
};

const _getGroupIconValue = () => {
    const { groupSvgInput, groupStripColors } = getGroupDrawerElements();
    let iconValue = groupSvgInput?.value || "";

    if (iconValue && groupStripColors?.checked) {
        iconValue = iconValue.replace(/ (fill|stroke)="[^"]*"/g, "");
    }

    return iconValue;
};

const _setGroupIconCollapsibleOpen = (isOpen) => {
    const item = document.getElementById("group-icon-collapsible");
    const trigger = document.getElementById("group-icon-collapsible-trigger");
    if (!item || !trigger) return;
    item.classList.toggle("is-open", !!isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
};

const _closeGroupDrawer = () => {
    if (groupBackdrop) {
        groupBackdrop.classList.remove("active");
        delete groupBackdrop.dataset.mode;
        delete groupBackdrop.dataset.originalName;
        delete groupBackdrop.dataset.step;
    }
};

export const resetGroupDrawerState = (options = {}) => {
    const { keepPreview = false, close = true } = options;
    const mode = groupBackdrop?.dataset.mode || "new";

    if (groupInput) groupInput.value = "";

    const {
        groupElementTypeSelect,
        groupElementTypeHint,
        groupLinkButtonUrlInput,
        groupClipboardContentInput,
        groupLauncherKind,
        groupLauncherTarget,
        groupLauncherPsVisible,
        groupLauncherExamples,
        groupSectionTextareaInput,
        groupSectionProfileAvatarGrid,
        groupSectionProfileAvatarUrlInput,
        groupSectionFileUrlInput,
        groupSectionLinkcardUrlInput,
        groupLinkButtonBgValue,
        groupSvgInput,
        groupChosenIcon,
        groupIconColorInput,
        groupIconColorPicker,
        groupIconColorAlpha,
        groupIconColorAlphaLabel,
        groupStripColors,
        groupIconSizeInput,
        groupIconSizeSlider,
        groupIconSizeValueLabel,
    } = getGroupDrawerElements();

    const groupTypeSelect = document.getElementById("group-type-select");
    const groupTypeHint = document.getElementById("group-type-hint");

    if (groupElementTypeSelect) {
        groupElementTypeSelect.value = "group";
        groupElementTypeSelect.disabled = false;
    }
    if (groupElementTypeHint) groupElementTypeHint.style.display = "none";
    if (groupLinkButtonUrlInput) groupLinkButtonUrlInput.value = "";
    {
        const { groupLinkButtonDisplaySelect } = getGroupDrawerElements();
        if (groupLinkButtonDisplaySelect) groupLinkButtonDisplaySelect.value = "";
        {
            const { toggle } = _getGroupAutofetchElements();
            if (toggle) toggle.checked = true;
        }
    }
    if (groupClipboardContentInput) groupClipboardContentInput.value = "";
    if (groupSectionTextareaInput) groupSectionTextareaInput.value = "";
    _ensureProfileAvatarPresetOptions();
    if (groupSectionProfileAvatarGrid) {
        _renderProfileAvatarPresetSelection("preset:a1");
    }
    if (groupSectionProfileAvatarUrlInput) {
        groupSectionProfileAvatarUrlInput.value = "";
    }
    if (groupSectionFileUrlInput) groupSectionFileUrlInput.value = "";
    if (groupSectionLinkcardUrlInput) groupSectionLinkcardUrlInput.value = "";
    if (groupLauncherKind) groupLauncherKind.value = "app";
    if (groupLauncherTarget) groupLauncherTarget.value = "";
    if (groupLauncherPsVisible) groupLauncherPsVisible.checked = false;
    if (groupLauncherExamples) groupLauncherExamples.removeAttribute("open");
    const groupRoutineEditorReset = getGroupRoutineEditor();
    if (groupRoutineEditorReset) {
        groupRoutineEditorReset.setSteps([]);
        groupRoutineEditorReset.setStagger(0);
    }
    _setGroupLauncherKindUi("app");
    _setLinkButtonBgControls("", {
        displayValue: _getEffectiveTopLevelButtonBgColor(),
    });
    _setLinkButtonFontSizeControls("");
    if (groupLinkButtonBgValue) groupLinkButtonBgValue.value = "";
    if (groupSvgInput) groupSvgInput.value = "";
    if (groupChosenIcon) {
        groupChosenIcon.style.removeProperty("--icon-override");
        groupChosenIcon.textContent = t("wih20_no_icon_chosen");
    }

    if (groupIconColorInput) groupIconColorInput.value = "";
    if (groupIconColorPicker) groupIconColorPicker.value = "#888888";
    if (groupIconColorAlpha) groupIconColorAlpha.value = "100";
    if (groupIconColorAlphaLabel) groupIconColorAlphaLabel.textContent = "100%";
    if (groupStripColors) groupStripColors.checked = true;
    if (groupIconSizeInput) groupIconSizeInput.value = "16";
    if (groupIconSizeSlider) groupIconSizeSlider.value = "16";
    if (groupIconSizeValueLabel) groupIconSizeValueLabel.textContent = "16px";
    if (groupTypeSelect) {
        groupTypeSelect.value = "standard";
        groupTypeSelect.disabled = false;
    }
    if (groupTypeHint) groupTypeHint.style.display = "none";

    updateGroupDrawerLabels({ mode: "new", elementType: "group" });
    _renderGroupTypePicker();
    syncGroupDrawerSections();
    _setGroupDrawerStep(GROUP_DRAWER_STEP_PICKER);
    _setGroupIconCollapsibleOpen(false);

    resetIconPicker(GROUP_PICKER_OPTIONS);
    if (close) _closeGroupDrawer();

    if (mode === "edit" && !keepPreview) {
        createItems(getElements(), true);
    }
};

export const openGroupDrawer = async (group = null, options = {}) => {
    if (!groupBackdrop) return;

    const isEdit = !!group;
    const {
        groupElementTypeSelect,
        groupElementTypeHint,
        groupLinkButtonUrlInput,
        groupClipboardContentInput,
        groupLauncherKind,
        groupLauncherTarget,
        groupLauncherPsVisible,
        groupLauncherExamples,
        groupSectionTextareaInput,
        groupSectionProfileAvatarGrid,
        groupSectionProfileAvatarUrlInput,
        groupSectionFileUrlInput,
        groupSvgInput,
        groupChosenIcon,
    } = getGroupDrawerElements();
    const groupTypeSelect = document.getElementById("group-type-select");
    const groupTypeHint = document.getElementById("group-type-hint");
    const requestedElementType = options.elementType;
    const requestedIsDirectForm =
        !isEdit &&
        (requestedElementType === "group" ||
            requestedElementType === "todo-list" ||
            TOP_LEVEL_BUTTON_TYPES.has(requestedElementType) ||
            SECTION_TYPES.has(requestedElementType));
    const elementType = isEdit
        ? getWidgetElementType(group)
        : requestedIsDirectForm
          ? requestedElementType
          : "group";
    const groupItems = group?.items || [];
    const isGroupSubtypeLocked =
        isEdit && elementType === "group" && groupItems.length > 0;

    groupBackdrop.dataset.mode = isEdit ? "edit" : "new";
    groupBackdrop.dataset.originalName = group?.name || "";

    if (groupInput) groupInput.value = group?.name || "";
    if (groupLinkButtonUrlInput)
        groupLinkButtonUrlInput.value = group?.url || "";
    {
        const { groupLinkButtonDisplaySelect } = getGroupDrawerElements();
        if (groupLinkButtonDisplaySelect) {
            groupLinkButtonDisplaySelect.value = ["tile", "tile2"].includes(
                group?.display,
            )
                ? group.display
                : "";
        }
        {
            // Autofetch starts on unless the widget carries a custom
            // (non-URL) icon — same rule as the link editor.
            const { toggle } = _getGroupAutofetchElements();
            if (toggle) {
                toggle.checked =
                    !group?.icon || /^https?:\/\//i.test(group.icon);
            }
        }
    }
    if (groupClipboardContentInput) {
        groupClipboardContentInput.value = group?.content || "";
    }
    if (groupSectionTextareaInput) {
        groupSectionTextareaInput.value =
            elementType === "section-text" || elementType === "section-code"
                ? group?.content || ""
                : "";
    }
    _ensureProfileAvatarPresetOptions();
    if (groupSectionProfileAvatarGrid) {
        _renderProfileAvatarPresetSelection(
            typeof group?.avatar === "string" &&
                group.avatar.startsWith("preset:")
                ? group.avatar
                : "preset:a1",
        );
    }
    if (groupSectionProfileAvatarUrlInput) {
        groupSectionProfileAvatarUrlInput.value =
            typeof group?.avatar === "string" &&
            !group.avatar.startsWith("preset:")
                ? group.avatar
                : "";
    }
    if (groupSectionFileUrlInput) {
        groupSectionFileUrlInput.value = group?.url || "";
    }
    if (groupLauncherKind) {
        groupLauncherKind.value = group?.launcherKind || "app";
    }
    if (groupLauncherTarget) {
        groupLauncherTarget.value = group?.target || "";
    }
    if (groupLauncherPsVisible) {
        groupLauncherPsVisible.checked = !!group?.visible;
    }
    if (groupLauncherExamples) groupLauncherExamples.removeAttribute("open");
    _setGroupLauncherKindUi(group?.launcherKind || "app");
    if (elementType === "routine-button") {
        const editor = getGroupRoutineEditor();
        if (editor) {
            editor.setSteps(Array.isArray(group?.steps) ? group.steps : []);
            editor.setStagger(group?.stagger || 0);
        }
    }
    _setLinkButtonBgControls(group?.style?.["--link-button-bg"] || "", {
        displayValue:
            group?.style?.["--link-button-bg"] ||
            (isEdit && TOP_LEVEL_BUTTON_TYPES.has(elementType)
                ? _getEffectiveTopLevelButtonBgColor()
                : ""),
    });
    _setLinkButtonFontSizeControls(
        group?.style?.["--link-button-font-size"] || "",
    );
    if (groupSvgInput) groupSvgInput.value = group?.icon || "";
    if (groupElementTypeSelect) {
        groupElementTypeSelect.value = elementType;
        groupElementTypeSelect.disabled = isEdit;
    }
    if (groupElementTypeHint) {
        groupElementTypeHint.style.display = isEdit ? "" : "none";
    }
    if (groupTypeSelect) {
        groupTypeSelect.value =
            group?.type === "todo-list" ? group.type : "standard";
        groupTypeSelect.disabled = isGroupSubtypeLocked;
    }
    if (groupTypeHint) {
        groupTypeHint.style.display = isGroupSubtypeLocked ? "" : "none";
    }
    _setGroupColorControls(group?.iconColor || "");
    _setGroupSizeControls(group?.iconSize || 16);

    if (groupChosenIcon) {
        renderStoredIconPreview(groupChosenIcon, group?.icon || "", {
            emptyText: t("wih20_no_icon_chosen"),
        });
    }
    _syncGroupIconPreview();
    _renderGroupTypePicker();
    syncGroupDrawerSections();
    _setGroupIconCollapsibleOpen(false);

    await initIconPicker(GROUP_PICKER_OPTIONS);
    const allWorkspaceItems = (getElements() || []).flatMap(
        (w) => w.items || w.content?.items || [],
    );
    setGroupIcons(allWorkspaceItems, GROUP_PICKER_OPTIONS);

    closeAllDrawers();
    groupBackdrop.classList.add("active");
    _setGroupDrawerStep(
        isEdit || requestedIsDirectForm
            ? GROUP_DRAWER_STEP_FORM
            : GROUP_DRAWER_STEP_PICKER,
        { focus: true },
    );
};

export const convertGroupItemToTopLevelButton = async ({
    groupName,
    itemY,
    display,
}) => {
    flushGridState();

    const elements = getElements() || [];
    const targetGroup = findWidgetByGroupName(elements, groupName);
    const groupItems = getWidgetItems(targetGroup);
    if (!Array.isArray(groupItems)) return false;

    const itemIndex = findItemIndexByY(groupItems, itemY);
    if (itemIndex === -1) return false;

    const sourceItem = groupItems[itemIndex];
    const sourceItemType = sourceItem?.type || "link";
    if (!GROUP_ITEM_TO_BUTTON_TYPE[sourceItemType]) return false;

    const nextItems = normalizeGroupItems(
        groupItems.filter((_, index) => index !== itemIndex),
    );
    if (targetGroup?.items) targetGroup.items = nextItems;
    else if (targetGroup?.content) targetGroup.content.items = nextItems;

    elements.push(
        buildTopLevelWidgetFromGroupItem(elements, sourceItem, display),
    );
    await persistCurrentWorkspaceElements(elements);
    return true;
};

export const openConvertButtonToGroupModal = (widgetName) => {
    flushGridState();

    const sourceWidget = findWidgetByGroupName(getElements() || [], widgetName);
    const sourceWidgetType = getWidgetElementType(sourceWidget);
    const sourceItemType = BUTTON_TO_GROUP_ITEM_TYPE[sourceWidgetType];
    if (!sourceWidget || !sourceItemType) return;

    const availableGroups = (getElements() || []).filter(isStandardGroupWidget);
    if (!availableGroups.length) {
        alert(t("wih20_no_standard_groups"));
        return;
    }

    const modal = document.getElementById("convert-button-modal");
    const nameEl = document.getElementById("convert-button-modal-name");
    const searchInput = document.getElementById("convert-button-modal-search");
    const listEl = document.getElementById("convert-button-modal-list");
    const errorEl = document.getElementById("convert-button-modal-error");
    const okBtn = document.getElementById("convert-button-modal-ok");
    const cancelBtn = document.getElementById("convert-button-modal-cancel");
    if (
        !modal ||
        !nameEl ||
        !searchInput ||
        !listEl ||
        !errorEl ||
        !okBtn ||
        !cancelBtn
    ) {
        return;
    }

    closeConvertButtonToGroupModal?.();

    nameEl.textContent = widgetName;
    searchInput.value = "";
    errorEl.textContent = "";

    let selectedGroupName = availableGroups[0]?.name || "";

    const renderGroupOptions = () => {
        const query = searchInput.value.trim().toLowerCase();
        const filteredGroups = availableGroups.filter((group) =>
            (group?.name || "").toLowerCase().includes(query),
        );

        if (!filteredGroups.some((group) => group.name === selectedGroupName)) {
            selectedGroupName = filteredGroups[0]?.name || "";
        }

        listEl.replaceChildren();

        if (!filteredGroups.length) {
            const emptyState = document.createElement("div");
            emptyState.className = "convert-button-modal-empty";
            emptyState.textContent = t("wih20_no_matching_groups");
            listEl.appendChild(emptyState);
            okBtn.disabled = true;
            return;
        }

        filteredGroups.forEach((group) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "convert-button-modal-option";
            option.textContent = group.name || t("wih20_untitled_group");
            option.setAttribute("role", "option");
            const isSelected = group.name === selectedGroupName;
            option.setAttribute("aria-selected", isSelected ? "true" : "false");
            option.classList.toggle("selected", isSelected);
            option.addEventListener("click", () => {
                selectedGroupName = group.name;
                renderGroupOptions();
            });
            listEl.appendChild(option);
        });

        okBtn.disabled = !selectedGroupName;
    };

    const close = () => {
        modal.style.display = "none";
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modal.onclick = null;
        searchInput.oninput = null;
        searchInput.onkeydown = null;
        closeConvertButtonToGroupModal = null;
    };

    closeConvertButtonToGroupModal = close;
    cancelBtn.onclick = close;
    modal.onclick = (event) => {
        if (event.target === modal) close();
    };
    searchInput.oninput = () => {
        errorEl.textContent = "";
        renderGroupOptions();
    };
    searchInput.onkeydown = async (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key === "Enter" && !okBtn.disabled) {
            event.preventDefault();
            await okBtn.onclick?.(event);
        }
    };

    okBtn.onclick = async () => {
        if (!selectedGroupName) {
            errorEl.textContent = t("wih20_choose_target_group");
            return;
        }

        flushGridState();
        const currentElements = getElements() || [];
        const currentSourceWidget = findWidgetByGroupName(
            currentElements,
            widgetName,
        );
        const targetGroup = findWidgetByGroupName(
            currentElements,
            selectedGroupName,
        );
        const targetItems = getWidgetItems(targetGroup);
        if (!currentSourceWidget || !Array.isArray(targetItems)) {
            close();
            return;
        }

        const convertedItem =
            buildGroupItemFromTopLevelWidget(currentSourceWidget);
        const nextItems = normalizeGroupItems(targetItems);
        nextItems.push({
            ...convertedItem,
            y: nextItems.length,
        });

        if (targetGroup?.items) targetGroup.items = nextItems;
        else if (targetGroup?.content) targetGroup.content.items = nextItems;

        const sourceIndex = currentElements.findIndex(
            (entry) =>
                (entry?.name || entry?.content?.name || "") === widgetName,
        );
        if (sourceIndex === -1) {
            close();
            return;
        }
        currentElements.splice(sourceIndex, 1);

        await persistCurrentWorkspaceElements(currentElements);
        close();
    };

    renderGroupOptions();
    modal.style.display = "flex";
    requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
};

const _findGroupWidgetByName = (elements, groupName) =>
    (elements || []).find(
        (widget) =>
            widget.name === groupName ||
            (widget.content && widget.content.name === groupName),
    );

// Fetch Open Graph metadata for a URL (best-effort, page-side). Always
// resolves (never rejects) — on any failure it yields empty fields so the
// caller can fall back to a bare card the user fills in by hand.
// Note: many sites block cross-origin reads (CORS), so metadata is only
// available when the target permits it.
const _fetchLinkCardMetadata = async (url) => {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return { title: "", description: "", image: "" };
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const meta = (prop) =>
            doc.querySelector(`meta[property="${prop}"]`)?.content ||
            doc.querySelector(`meta[name="${prop}"]`)?.content ||
            "";
        return {
            title:
                meta("og:title") || doc.querySelector("title")?.textContent?.trim() || "",
            description: meta("og:description") || meta("description"),
            image: meta("og:image"),
        };
    } catch {
        return { title: "", description: "", image: "" };
    }
};

const _applyGroupDrawerChanges = async () => {
    const elementType = getGroupDrawerElementType();

    // Link card: ask for the URL first, then best-effort enrich the card with the
    // page's Open Graph title / description / preview image before adding it.
    if (elementType === "section-linkcard") {
        const { groupSectionLinkcardUrlInput } = getGroupDrawerElements();
        const rawUrl = groupSectionLinkcardUrlInput?.value?.trim() || "";
        const url = sanitizeSectionHttpUrl(rawUrl);
        if (!url) {
            alert(t("wih20_alert_valid_link_url_scheme"));
            return;
        }

        // Brief loading state on the add button while the fetch is in flight.
        const prevLabel = addGroupButton?.textContent;
        if (addGroupButton) {
            addGroupButton.disabled = true;
            addGroupButton.textContent = t("wih20_fetching_preview");
        }
        const meta = await _fetchLinkCardMetadata(url);
        if (addGroupButton) {
            addGroupButton.disabled = false;
            if (typeof prevLabel === "string")
                addGroupButton.textContent = prevLabel;
        }

        const added = await addSectionToWorkspace(
            "section-linkcard",
            meta.title || getNameFromUrl(url),
            {
                url,
                src: sanitizeSectionHttpUrl(meta.image || ""),
                text: meta.title || getNameFromUrl(url),
                content: meta.description || "",
            },
        );
        if (!added) return;
        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast("section-linkcard");
        return;
    }

    // Sections (heading / text / divider) are created directly from the drawer's
    // lightweight seed fields. Richer editing still happens on the board itself.
    if (SECTION_TYPES.has(elementType)) {
        const {
                groupSectionTextareaInput,
            groupSectionProfileAvatarGrid,
            groupSectionProfileAvatarUrlInput,
            groupSectionFileUrlInput,
        } = getGroupDrawerElements();
        const text =
            elementType === "section-text" || elementType === "section-code"
                ? groupSectionTextareaInput?.value?.trim() || ""
                : groupInput?.value?.trim() || "";
        const rawProfileAvatarUrl =
            groupSectionProfileAvatarUrlInput?.value?.trim() || "";
        const profileAvatarUrl = sanitizeSectionHttpUrl(rawProfileAvatarUrl);
        const rawFileUrl = groupSectionFileUrlInput?.value?.trim() || "";
        const fileUrl = sanitizeSectionHttpUrl(rawFileUrl);
        const sectionOptions = {};

        if (
            elementType === "section-profile" &&
            rawProfileAvatarUrl &&
            !profileAvatarUrl
        ) {
            alert(t("wih20_alert_valid_avatar_url"));
            return;
        }
        if (elementType === "section-file" && rawFileUrl && !fileUrl) {
            alert(t("wih20_alert_valid_file_url"));
            return;
        }

        if (elementType === "section-profile") {
            sectionOptions.avatar =
                profileAvatarUrl ||
                groupSectionProfileAvatarGrid?.dataset.selectedAvatar ||
                "preset:a1";
            sectionOptions.text = "";
            sectionOptions.content = "";
        }
        if (elementType === "section-file" && fileUrl) {
            sectionOptions.url = fileUrl;
        }

        const added = await addSectionToWorkspace(
            elementType,
            text,
            sectionOptions,
        );
        if (!added) return;
        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast(elementType);
        return;
    }

    const isTopLevelButton = TOP_LEVEL_BUTTON_TYPES.has(elementType);
    const groupName = groupInput?.value?.trim() || "";
    const nameLabel = isTopLevelButton
        ? t("wih20_name_button_text")
        : t("wih20_name_group_name");
    if (!groupName) {
        alert(t("wih20_alert_please_enter_x", [nameLabel]));
        return;
    }

    const elements = getElements() || [];
    const mode = groupBackdrop?.dataset.mode || "new";
    const originalName = groupBackdrop?.dataset.originalName || "";
    // The group's subtype is now derived from the element picker: choosing
    // "To-do list" creates a todo-list group, "Group" a standard one.
    const groupType = elementType === "todo-list" ? elementType : "standard";
    const {
        groupIconColorInput,
        groupLinkButtonUrlInput,
        groupLinkButtonDisplaySelect,
        groupClipboardContentInput,
        groupLauncherKind,
        groupLauncherTarget,
        groupLauncherPsVisible,
    } = getGroupDrawerElements();
    const iconValue = _getGroupIconValue();
    const iconColorValue = groupIconColorInput?.value || "";
    const iconSizeValue = _getGroupIconSizeValue();
    const rawLinkButtonUrl = groupLinkButtonUrlInput?.value?.trim() || "";
    const safeLinkButtonUrl =
        elementType === "link-button" ? sanitizeLinkUrl(rawLinkButtonUrl) : "";
    const linkButtonDisplay = ["tile", "tile2"].includes(
        groupLinkButtonDisplaySelect?.value,
    )
        ? groupLinkButtonDisplaySelect.value
        : "";
    // Options every action-widget create call needs so shape + geometry are
    // applied uniformly (link / clipboard / launcher / routine).
    const displayCreateOptions = {
        display: linkButtonDisplay || undefined,
        ...(DISPLAY_GEOMETRY[linkButtonDisplay] || {}),
    };
    const clipboardContent = groupClipboardContentInput?.value || "";
    const launcherKind = groupLauncherKind?.value || "app";
    const launcherTarget = groupLauncherTarget?.value?.trim() || "";
    const launcherVisible = groupLauncherPsVisible?.checked || false;
    const linkButtonStyle = _getLinkButtonStyleOverrides();

    if (elementType === "link-button" && !safeLinkButtonUrl) {
        alert(t("wih20_alert_valid_link_url"));
        return;
    }
    if (elementType === "launcher-button" && !launcherTarget) {
        alert(t("wih20_alert_launcher_target"));
        return;
    }
    if (elementType === "clipboard-button" && !clipboardContent.trim()) {
        alert(t("wih20_alert_fill_required"));
        return;
    }

    const exists = elements.some((widget) => {
        const candidateName = widget.name || widget.content?.name || "";
        if (mode === "edit" && candidateName === originalName) return false;
        return candidateName === groupName;
    });

    if (exists) {
        alert(
            isTopLevelButton
                ? t("wih20_alert_x_already_exists", [
                      getElementTypeLabel(elementType),
                  ])
                : t("wih20_alert_group_already_exists"),
        );
        return;
    }

    if (mode === "edit") {
        const widget = _findGroupWidgetByName(elements, originalName);
        if (!widget) {
            alert(
                isTopLevelButton
                    ? t("wih20_alert_could_not_find_x_to_update", [
                          getElementTypeLabel(elementType).toLowerCase(),
                      ])
                    : t("wih20_alert_could_not_find_group_to_update"),
            );
            return;
        }

        widget.name = groupName;
        widget.id = groupName;
        if (widget.content && typeof widget.content === "object") {
            widget.content.name = groupName;
        }

        if (iconValue) {
            widget.icon = iconValue;
            if (widget.content && typeof widget.content === "object") {
                widget.content.icon = iconValue;
            }
        } else {
            delete widget.icon;
            if (widget.content && typeof widget.content === "object") {
                delete widget.content.icon;
            }
        }

        if (iconColorValue) {
            widget.iconColor = iconColorValue;
            if (widget.content && typeof widget.content === "object") {
                widget.content.iconColor = iconColorValue;
            }
        } else {
            delete widget.iconColor;
            if (widget.content && typeof widget.content === "object") {
                delete widget.content.iconColor;
            }
        }

        widget.iconSize = iconSizeValue;
        if (widget.content && typeof widget.content === "object") {
            widget.content.iconSize = iconSizeValue;
        }

        if (isTopLevelButton) {
            widget.type = elementType;
            // Shape + geometry apply to every action type now (link /
            // clipboard / launcher / routine can all be a tile).
            _applyDisplayToWidget(widget, linkButtonDisplay);
            if (elementType === "link-button") {
                widget.url = safeLinkButtonUrl;
                if (typeof widget.content !== "object") delete widget.content;
                delete widget.launcherKind;
                delete widget.target;
                delete widget.visible;
            } else if (elementType === "clipboard-button") {
                widget.content = clipboardContent;
                delete widget.url;
                delete widget.launcherKind;
                delete widget.target;
                delete widget.visible;
            } else if (elementType === "launcher-button") {
                widget.launcherKind = launcherKind;
                widget.target = launcherTarget;
                if (launcherKind === "powershell") {
                    widget.visible = launcherVisible;
                } else {
                    delete widget.visible;
                }
                delete widget.url;
                if (typeof widget.content !== "object") delete widget.content;
            } else if (elementType === "routine-button") {
                const editor = getGroupRoutineEditor();
                widget.steps = editor ? editor.getSteps() : [];
                widget.stagger = editor ? editor.getStagger() : 0;
                delete widget.url;
                delete widget.launcherKind;
                delete widget.target;
                delete widget.visible;
                if (typeof widget.content !== "object") delete widget.content;
            }
            if (Object.keys(linkButtonStyle).length) {
                widget.style = { ...linkButtonStyle };
            } else {
                delete widget.style;
            }
            if (widget.content && typeof widget.content === "object") {
                widget.content.type = elementType;
                if (elementType === "link-button") {
                    widget.content.url = safeLinkButtonUrl;
                    delete widget.content.content;
                    delete widget.content.launcherKind;
                    delete widget.content.target;
                    delete widget.content.visible;
                } else if (elementType === "clipboard-button") {
                    widget.content.content = clipboardContent;
                    delete widget.content.url;
                    delete widget.content.launcherKind;
                    delete widget.content.target;
                    delete widget.content.visible;
                } else if (elementType === "launcher-button") {
                    widget.content.launcherKind = launcherKind;
                    widget.content.target = launcherTarget;
                    if (launcherKind === "powershell") {
                        widget.content.visible = launcherVisible;
                    } else {
                        delete widget.content.visible;
                    }
                    delete widget.content.url;
                    delete widget.content.content;
                } else if (elementType === "routine-button") {
                    const editor = getGroupRoutineEditor();
                    widget.content.steps = editor ? editor.getSteps() : [];
                    widget.content.stagger = editor ? editor.getStagger() : 0;
                    delete widget.content.url;
                    delete widget.content.content;
                    delete widget.content.launcherKind;
                    delete widget.content.target;
                    delete widget.content.visible;
                }
                if (Object.keys(linkButtonStyle).length) {
                    widget.content.style = { ...linkButtonStyle };
                } else {
                    delete widget.content.style;
                }
            }
        } else if (groupType === "todo-list") {
            widget.type = groupType;
            if (widget.content && typeof widget.content === "object") {
                widget.content.type = groupType;
            }
            delete widget.url;
            if (typeof widget.content !== "object") delete widget.content;
            delete widget.launcherKind;
            delete widget.target;
            delete widget.visible;
            if (widget.content && typeof widget.content === "object") {
                delete widget.content.url;
            }
        } else {
            delete widget.type;
            if (widget.content && typeof widget.content === "object") {
                delete widget.content.type;
            }
            delete widget.url;
            if (typeof widget.content !== "object") delete widget.content;
            delete widget.launcherKind;
            delete widget.target;
            delete widget.visible;
            if (widget.content && typeof widget.content === "object") {
                delete widget.content.url;
            }
        }

        setWorkspaceGroups(getCurrentWorkspace(), elements);
        await saveWorkspacesToStorage();
        createItems(elements, true);
        resetGroupDrawerState({ keepPreview: true });
        return;
    }

    if (elementType === "link-button") {
        const added = await addLinkButtonToWorkspace(
            groupName,
            safeLinkButtonUrl,
            {
                icon: iconValue,
                iconColor: iconColorValue,
                iconSize: iconSizeValue,
                ...displayCreateOptions,
                style: Object.keys(linkButtonStyle).length
                    ? { ...linkButtonStyle }
                    : undefined,
            },
        );
        if (!added) return;

        if (window.autoFaviconEnabled && !iconValue) {
            try {
                const faviconUrl = buildFaviconUrl(safeLinkButtonUrl);
                const faviconWorkspaceId = getCurrentWorkspace();
                const faviconWidgetName = groupName;
                const img = new Image();
                img.onload = async () => {
                    await updateAutoFaviconWidgetTarget({
                        workspaceId: faviconWorkspaceId,
                        widgetName: faviconWidgetName,
                        expectedUrl: safeLinkButtonUrl,
                        faviconUrl,
                    });
                };
                img.src = faviconUrl;
            } catch (error) {
                console.warn(
                    "[event-handlers] Could not build favicon URL:",
                    error.message,
                );
            }
        }

        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast(elementType);
        return;
    }

    if (elementType === "clipboard-button") {
        const added = await addClipboardButtonToWorkspace(
            groupName,
            clipboardContent,
            {
                icon: iconValue,
                iconColor: iconColorValue,
                iconSize: iconSizeValue,
                ...displayCreateOptions,
                style: Object.keys(linkButtonStyle).length
                    ? { ...linkButtonStyle }
                    : undefined,
            },
        );
        if (!added) return;
        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast(elementType);
        return;
    }

    if (elementType === "launcher-button") {
        const added = await addLauncherButtonToWorkspace(groupName, {
            launcherKind,
            target: launcherTarget,
            visible:
                launcherKind === "powershell" ? launcherVisible : undefined,
            icon: iconValue,
            iconColor: iconColorValue,
            iconSize: iconSizeValue,
            ...displayCreateOptions,
            style: Object.keys(linkButtonStyle).length
                ? { ...linkButtonStyle }
                : undefined,
        });
        if (!added) return;
        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast(elementType);
        return;
    }

    if (elementType === "routine-button") {
        const editor = getGroupRoutineEditor();
        const added = await addRoutineButtonToWorkspace(groupName, {
            steps: editor ? editor.getSteps() : [],
            stagger: editor ? editor.getStagger() : 0,
            icon: iconValue,
            iconColor: iconColorValue,
            iconSize: iconSizeValue,
            ...displayCreateOptions,
            style: Object.keys(linkButtonStyle).length
                ? { ...linkButtonStyle }
                : undefined,
        });
        if (!added) return;
        resetGroupDrawerState({ keepPreview: true });
        _showElementAddedToast(elementType);
        return;
    }

    const added = await addGroupToWorkspace(groupName, [], {
        type: groupType,
        icon: iconValue,
        iconColor: iconColorValue,
        iconSize: iconSizeValue,
    });
    if (!added) return;

    resetGroupDrawerState({ keepPreview: true });
    _showElementAddedToast(elementType);
};

const _bindGroupDrawerUi = () => {
    const {
        groupTypePickerGroups,
        groupBackButton,
        groupElementTypeSelect,
        groupLinkButtonUrlInput,
        groupClipboardContentInput,
        groupSectionProfileAvatarGrid,
        groupSectionProfileAvatarUrlInput,
        groupSectionFileUrlInput,
        groupSectionLinkcardUrlInput,
        groupLauncherKind,
        groupLauncherTarget,
        groupLauncherBrowseBtn,
        groupLauncherPsVisible,
        groupLinkButtonBgPicker,
        groupLinkButtonBgAlpha,
        groupLinkButtonBgReset,
        groupLinkButtonFontSizeSlider,
        groupLinkButtonFontSizeReset,
        groupSvgInput,
        groupIconColorPicker,
        groupIconColorAlpha,
        groupIconColorReset,
        groupIconSizeSlider,
        groupIconSizeReset,
        groupClearIconBtn,
    } = getGroupDrawerElements();

    if (groupCloseButton && !groupCloseButton.dataset.groupDrawerBound) {
        groupCloseButton.dataset.groupDrawerBound = "1";
        groupCloseButton.addEventListener("click", () => {
            resetGroupDrawerState();
        });
    }

    const groupIconCollapsibleTrigger = document.getElementById(
        "group-icon-collapsible-trigger",
    );
    if (
        groupIconCollapsibleTrigger &&
        !groupIconCollapsibleTrigger.dataset.groupDrawerBound
    ) {
        groupIconCollapsibleTrigger.dataset.groupDrawerBound = "1";
        groupIconCollapsibleTrigger.addEventListener("click", () => {
            const item = document.getElementById("group-icon-collapsible");
            const willOpen = !item?.classList.contains("is-open");
            _setGroupIconCollapsibleOpen(willOpen);
        });
    }

    if (groupInput && !groupInput.dataset.groupDrawerLiveBound) {
        groupInput.dataset.groupDrawerLiveBound = "1";
        groupInput.addEventListener("input", () => {
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupTypePickerGroups &&
        !groupTypePickerGroups.dataset.groupDrawerBound
    ) {
        groupTypePickerGroups.dataset.groupDrawerBound = "1";
        groupTypePickerGroups.addEventListener("click", async (event) => {
            const card = event.target?.closest?.(".group-type-card");
            if (!card?.dataset?.elementType) return;
            const elementType = card.dataset.elementType;
            if (DIRECT_ADD_SECTION_TYPES.has(elementType)) {
                const { groupElementTypeSelect } = getGroupDrawerElements();
                if (!groupElementTypeSelect) return;
                groupElementTypeSelect.value = elementType;
                groupElementTypeSelect.dispatchEvent(new Event("change"));
                await _applyGroupDrawerChanges();
                return;
            }
            // Action widgets pick their style next; everything else (groups,
            // to-do, sections with a form) goes straight to the form.
            if (ACTION_FAMILY_TYPES.has(elementType)) {
                pendingActionType = elementType;
                _setGroupDrawerStep(GROUP_DRAWER_STEP_STYLE, { focus: true });
                return;
            }
            _selectGroupDrawerType(elementType);
        });
    }

    const { groupStylePickerGroups, groupStyleBackButton } =
        getGroupDrawerElements();
    if (
        groupStylePickerGroups &&
        !groupStylePickerGroups.dataset.groupDrawerBound
    ) {
        groupStylePickerGroups.dataset.groupDrawerBound = "1";
        groupStylePickerGroups.addEventListener("click", (event) => {
            const card = event.target?.closest?.(".group-type-card");
            if (!card || typeof card.dataset.display !== "string") return;
            if (!pendingActionType) return;
            const { groupLinkButtonDisplaySelect } = getGroupDrawerElements();
            // The display select is the hidden state holder the form + save
            // read; set it, then open the form for the chosen action.
            if (groupLinkButtonDisplaySelect) {
                groupLinkButtonDisplaySelect.value = card.dataset.display;
            }
            _selectGroupDrawerType(pendingActionType);
        });
    }

    if (
        groupStyleBackButton &&
        !groupStyleBackButton.dataset.groupDrawerBound
    ) {
        groupStyleBackButton.dataset.groupDrawerBound = "1";
        groupStyleBackButton.addEventListener("click", () => {
            // Leaving the action family entirely — abandon the entry so
            // values typed for one element type can't leak into another
            // (form→style deliberately preserves them; see groupBackButton).
            pendingActionType = null;
            resetGroupDrawerState({ close: false });
            _setGroupDrawerStep(GROUP_DRAWER_STEP_PICKER, { focus: true });
        });
    }

    if (groupBackButton && !groupBackButton.dataset.groupDrawerBound) {
        groupBackButton.dataset.groupDrawerBound = "1";
        groupBackButton.addEventListener("click", () => {
            // Back is create-mode only. For an action widget, stepping back
            // to the style step KEEPS the typed field values — the common
            // case is "same shortcut, different style", and wiping name/URL/
            // icon just to switch icon→tile forced retyping everything. The
            // full reset still runs when the drawer closes or a different
            // element type is picked. Backing out of a section form returns
            // to the picker and abandons the entry as before.
            const action = getGroupDrawerElementType();
            if (ACTION_FAMILY_TYPES.has(action)) {
                pendingActionType = action;
                _setGroupDrawerStep(GROUP_DRAWER_STEP_STYLE, { focus: true });
            } else {
                resetGroupDrawerState({ close: false });
                _setGroupDrawerStep(GROUP_DRAWER_STEP_PICKER, { focus: true });
            }
        });
    }

    if (addGroupButton && !addGroupButton.dataset.groupDrawerBound) {
        addGroupButton.dataset.groupDrawerBound = "1";
        addGroupButton.addEventListener("click", _applyGroupDrawerChanges);
    }

    if (groupInput && !groupInput.dataset.groupDrawerBound) {
        groupInput.dataset.groupDrawerBound = "1";
        groupInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                _applyGroupDrawerChanges();
            }
        });
    }

    _ensureProfileAvatarPresetOptions();

    [
        groupSectionProfileAvatarUrlInput,
        groupSectionFileUrlInput,
        groupSectionLinkcardUrlInput,
    ]
        .filter(Boolean)
        .forEach((input) => {
            if (input.dataset.groupDrawerBound) return;
            input.dataset.groupDrawerBound = "1";
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    _applyGroupDrawerChanges();
                }
            });
        });

    if (
        groupSectionProfileAvatarGrid &&
        !groupSectionProfileAvatarGrid.dataset.groupDrawerBound
    ) {
        groupSectionProfileAvatarGrid.dataset.groupDrawerBound = "1";
        groupSectionProfileAvatarGrid.addEventListener("click", (event) => {
            const button = event.target?.closest?.(".avatar-opt");
            if (!button?.dataset?.avatar) return;
            _renderProfileAvatarPresetSelection(button.dataset.avatar);
        });
    }

    if (
        groupLinkButtonUrlInput &&
        !groupLinkButtonUrlInput.dataset.groupDrawerBound
    ) {
        groupLinkButtonUrlInput.dataset.groupDrawerBound = "1";
        groupLinkButtonUrlInput.addEventListener("input", () => {
            _applyGroupDrawerLivePreview();
        });
        groupLinkButtonUrlInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                _applyGroupDrawerChanges();
            }
        });
    }

    if (
        groupClipboardContentInput &&
        !groupClipboardContentInput.dataset.groupDrawerBound
    ) {
        groupClipboardContentInput.dataset.groupDrawerBound = "1";
        groupClipboardContentInput.addEventListener("input", () => {
            _applyGroupDrawerLivePreview();
        });
    }

    if (groupLauncherTarget && !groupLauncherTarget.dataset.groupDrawerBound) {
        groupLauncherTarget.dataset.groupDrawerBound = "1";
        groupLauncherTarget.addEventListener("input", () => {
            _applyGroupDrawerLivePreview();
        });
        groupLauncherTarget.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                _applyGroupDrawerChanges();
            }
        });
    }

    if (groupLauncherKind && !groupLauncherKind.dataset.groupDrawerBound) {
        groupLauncherKind.dataset.groupDrawerBound = "1";
        groupLauncherKind.addEventListener("change", () => {
            _setGroupLauncherKindUi(groupLauncherKind.value);
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupLauncherPsVisible &&
        !groupLauncherPsVisible.dataset.groupDrawerBound
    ) {
        groupLauncherPsVisible.dataset.groupDrawerBound = "1";
        groupLauncherPsVisible.addEventListener("change", () => {
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupLauncherBrowseBtn &&
        !groupLauncherBrowseBtn.dataset.groupDrawerBound
    ) {
        groupLauncherBrowseBtn.dataset.groupDrawerBound = "1";
        groupLauncherBrowseBtn.addEventListener("click", () => {
            // Web build: no native file picker (needed the companion app).
            alert(t("wih20_alert_picker_no_companion"));
        });
    }

    document.querySelectorAll(".group-launcher-example-item").forEach((btn) => {
        if (btn.dataset.groupDrawerBound) return;
        btn.dataset.groupDrawerBound = "1";
        btn.addEventListener("click", () => {
            if (!groupLauncherTarget) return;
            groupLauncherTarget.value = btn.dataset.uri || "";
            groupLauncherTarget.focus();
            _applyGroupDrawerLivePreview();
        });
    });

    if (
        groupElementTypeSelect &&
        !groupElementTypeSelect.dataset.groupDrawerBound
    ) {
        groupElementTypeSelect.dataset.groupDrawerBound = "1";
        groupElementTypeSelect.addEventListener("change", () => {
            syncGroupDrawerSections();
        });
    }

    const { groupLinkButtonDisplaySelect: lbDisplaySelect } =
        getGroupDrawerElements();
    if (lbDisplaySelect && !lbDisplaySelect.dataset.groupDrawerBound) {
        lbDisplaySelect.dataset.groupDrawerBound = "1";
        lbDisplaySelect.addEventListener("change", () => {
            // Full section sync: the variant changes the drawer title/labels
            // (Shortcut vs Tile).
            syncGroupDrawerSections();
            _applyGroupDrawerLivePreview();
        });
    }

    if (groupSvgInput && !groupSvgInput.dataset.groupDrawerBound) {
        groupSvgInput.dataset.groupDrawerBound = "1";
        groupSvgInput.addEventListener("input", () => {
            _syncGroupIconPreview();
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupIconColorPicker &&
        groupIconColorAlpha &&
        !groupIconColorPicker.dataset.groupDrawerBound
    ) {
        groupIconColorPicker.dataset.groupDrawerBound = "1";
        groupIconColorAlpha.dataset.groupDrawerBound = "1";

        groupIconColorPicker.addEventListener("input", () => {
            _updateGroupColorValueFromControls();
        });
        groupIconColorAlpha.addEventListener("input", () => {
            _updateGroupColorValueFromControls();
        });
    }

    if (groupIconColorReset && !groupIconColorReset.dataset.groupDrawerBound) {
        groupIconColorReset.dataset.groupDrawerBound = "1";
        groupIconColorReset.addEventListener("click", () => {
            _setGroupColorControls("");
            _applyGroupDrawerLivePreview();
        });
    }

    if (groupIconSizeSlider && !groupIconSizeSlider.dataset.groupDrawerBound) {
        groupIconSizeSlider.dataset.groupDrawerBound = "1";
        groupIconSizeSlider.addEventListener("input", () => {
            const { groupIconSizeInput, groupIconSizeValueLabel } =
                getGroupDrawerElements();
            if (groupIconSizeInput) {
                groupIconSizeInput.value = groupIconSizeSlider.value;
            }
            if (groupIconSizeValueLabel) {
                groupIconSizeValueLabel.textContent = `${groupIconSizeSlider.value}px`;
            }
            _syncGroupIconPreview();
            _applyGroupDrawerLivePreview();
        });
    }

    if (groupIconSizeReset && !groupIconSizeReset.dataset.groupDrawerBound) {
        groupIconSizeReset.dataset.groupDrawerBound = "1";
        groupIconSizeReset.addEventListener("click", () => {
            _setGroupSizeControls(16);
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupLinkButtonBgPicker &&
        groupLinkButtonBgAlpha &&
        !groupLinkButtonBgPicker.dataset.groupDrawerBound
    ) {
        groupLinkButtonBgPicker.dataset.groupDrawerBound = "1";
        groupLinkButtonBgAlpha.dataset.groupDrawerBound = "1";
        groupLinkButtonBgPicker.addEventListener("input", () => {
            _updateLinkButtonBgValueFromControls();
            _applyGroupDrawerLivePreview();
        });
        groupLinkButtonBgAlpha.addEventListener("input", () => {
            _updateLinkButtonBgValueFromControls();
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupLinkButtonBgReset &&
        !groupLinkButtonBgReset.dataset.groupDrawerBound
    ) {
        groupLinkButtonBgReset.dataset.groupDrawerBound = "1";
        groupLinkButtonBgReset.addEventListener("click", () => {
            _setLinkButtonBgControls("");
            _applyGroupDrawerLivePreview();
            _setLinkButtonBgControls("", {
                displayValue: _getEffectiveTopLevelButtonBgColor(),
            });
        });
    }

    if (
        groupLinkButtonFontSizeSlider &&
        !groupLinkButtonFontSizeSlider.dataset.groupDrawerBound
    ) {
        groupLinkButtonFontSizeSlider.dataset.groupDrawerBound = "1";
        groupLinkButtonFontSizeSlider.addEventListener("input", () => {
            _setLinkButtonFontSizeControls(groupLinkButtonFontSizeSlider.value);
            _applyGroupDrawerLivePreview();
        });
    }

    if (
        groupLinkButtonFontSizeReset &&
        !groupLinkButtonFontSizeReset.dataset.groupDrawerBound
    ) {
        groupLinkButtonFontSizeReset.dataset.groupDrawerBound = "1";
        groupLinkButtonFontSizeReset.addEventListener("click", () => {
            _setLinkButtonFontSizeControls("");
            _applyGroupDrawerLivePreview();
        });
    }

    if (groupClearIconBtn && !groupClearIconBtn.dataset.groupDrawerBound) {
        groupClearIconBtn.dataset.groupDrawerBound = "1";
        groupClearIconBtn.addEventListener("click", () => {
            const { groupSvgInput } = getGroupDrawerElements();
            if (groupSvgInput) {
                groupSvgInput.value = "";
                groupSvgInput.dispatchEvent(new Event("input"));
            }
        });
    }
};

export const resetLinkModalState = () => {
    const linkBackdrop = document.getElementById("link");
    if (linkBackdrop) linkBackdrop.classList.remove("active");

    const drawerTitle = document.getElementById("link-drawer-title");
    const nameLabel = document.getElementById("label-link-name");
    if (drawerTitle) drawerTitle.textContent = t("wih20_add_item");
    if (nameLabel) nameLabel.textContent = t("wih20_name");

    linkInput.value = "";
    urlInput.value = "";
    svgInput.value = "";
    addLinkButton.innerHTML = t("wih20_add_link");
    setLinkMode("new");

    if (choosenIconAddLink)
        choosenIconAddLink.innerHTML = t("wih20_no_icon_chosen");
    if (itemTypeSelect) {
        itemTypeSelect.value = "link";
        itemTypeSelect.dispatchEvent(new Event("change"));
    }

    const itemRoutineEditorReset = getItemRoutineEditor();
    if (itemRoutineEditorReset) {
        itemRoutineEditorReset.setSteps([]);
        itemRoutineEditorReset.setStagger(0);
    }

    const alignInput = document.getElementById("header-align");
    if (alignInput) alignInput.value = "center";
    document.querySelectorAll(".header-align-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.align === "center");
    });

    const sepToggle = document.getElementById("header-separator-toggle");
    if (sepToggle) sepToggle.checked = true;

    const iconColorInput = document.getElementById("icon-color-value");
    if (iconColorInput) iconColorInput.value = "";
    const iconColorPicker = document.getElementById("icon-color-picker");
    if (iconColorPicker) iconColorPicker.value = "#888888";
    const iconColorAlpha = document.getElementById("icon-color-alpha");
    if (iconColorAlpha) iconColorAlpha.value = "100";
    const iconColorAlphaLabel = document.getElementById(
        "icon-color-alpha-label",
    );
    if (iconColorAlphaLabel) iconColorAlphaLabel.textContent = "100%";

    const linkStyleTextValue = document.getElementById("link-style-text-value");
    if (linkStyleTextValue) linkStyleTextValue.value = "";
    const linkStyleTextColor = document.getElementById("link-style-text-color");
    if (linkStyleTextColor) linkStyleTextColor.value = "#888888";
    const linkStyleTextAlpha = document.getElementById("link-style-text-alpha");
    if (linkStyleTextAlpha) linkStyleTextAlpha.value = "100";
    const linkStyleTextAlphaLabel = document.getElementById(
        "link-style-text-alpha-label",
    );
    if (linkStyleTextAlphaLabel) linkStyleTextAlphaLabel.textContent = "100%";

    const descInput = document.getElementById("linkDescription");
    if (descInput) descInput.value = "";

    document.querySelectorAll(".text-style-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.style === "normal");
    });

    const clipboardContent = document.getElementById("clipboard-content");
    if (clipboardContent) clipboardContent.value = "";

    const todoCompletedToggle = document.getElementById(
        "todo-completed-toggle",
    );
    if (todoCompletedToggle) todoCompletedToggle.checked = false;

    const launcherKindSelect = document.getElementById("launcher-kind");
    if (launcherKindSelect) {
        launcherKindSelect.value = "app";
        launcherKindSelect.dispatchEvent(new Event("change"));
    }

    const launcherTarget = document.getElementById("launcher-target");
    if (launcherTarget) launcherTarget.value = "";

    const launcherExamples = document.querySelector(".launcher-examples");
    if (launcherExamples) launcherExamples.removeAttribute("open");

    const launcherPsVisible = document.getElementById("launcher-ps-visible");
    if (launcherPsVisible) launcherPsVisible.checked = false;

    const linkTargetOverride = document.getElementById("link-target-override");
    if (linkTargetOverride) linkTargetOverride.value = "";

    const linkAutofetchIconToggle = document.getElementById(
        "link-autofetch-icon-toggle",
    );
    if (linkAutofetchIconToggle)
        linkAutofetchIconToggle.checked = !!window.autoFaviconEnabled;

    resetIconPicker(LINK_PICKER_OPTIONS);
};

export const initWorkspaceItemHandlers = () => {
    _bindGroupDrawerUi();

    if (linkCloseButton && !linkCloseButton.dataset.linkDrawerBound) {
        linkCloseButton.dataset.linkDrawerBound = "1";
        linkCloseButton.addEventListener("click", () => {
            revertLinkEditState();
            resetLinkModalState();
        });
    }

    if (addLinkButton && !addLinkButton.dataset.linkDrawerBound) {
        addLinkButton.dataset.linkDrawerBound = "1";
        addLinkButton.addEventListener("click", () => {
            const currentGroup = getCurrentGroup();
            const linkMode = getLinkMode();
            const linkIndex = getLinkIndex();
            const elements = getElements();

            const itemType = itemTypeSelect ? itemTypeSelect.value : "link";
            const isDivider = itemType === "divider";
            const needsName = itemType !== "divider";
            const needsUrl = itemType === "link";
            const needsTarget = itemType === "launcher";
            const launcherTargetEl = document.getElementById("launcher-target");

            const hasRequiredFields =
                currentGroup &&
                (!needsName || linkInput.value) &&
                (!needsUrl || urlInput.value) &&
                (!needsTarget || launcherTargetEl?.value);

            if (hasRequiredFields) {
                const widget = findWidgetByGroupName(elements, currentGroup);

                if (widget) {
                    const items =
                        widget.items ||
                        (widget.content ? widget.content.items : null);

                    if (!items) {
                        console.error("Widget structure invalid", widget);
                        return;
                    }

                    let iconValue =
                        needsUrl ||
                        needsTarget ||
                        itemType === "routine" ||
                        itemType === "clipboard"
                            ? svgInput.value
                            : "";
                    const stripCheckbox =
                        document.getElementById("strip-icon-colors");
                    if (iconValue && stripCheckbox?.checked) {
                        iconValue = iconValue.replace(
                            / (fill|stroke)="[^"]*"/g,
                            "",
                        );
                    }

                    const iconColorValue =
                        document.getElementById("icon-color-value")?.value ||
                        "";

                    const linkStyleTextVal =
                        document.getElementById("link-style-text-value")
                            ?.value || "";

                    const descriptionVal =
                        document
                            .getElementById("linkDescription")
                            ?.value?.trim() || "";

                    const existingItemIndex =
                        linkMode === "edit"
                            ? findItemIndexByY(items, linkIndex)
                            : -1;
                    const existingItem =
                        existingItemIndex >= 0
                            ? items[existingItemIndex]
                            : null;

                    const newItem = {
                        ...(existingItem || {}),
                        name: isDivider ? "" : linkInput.value,
                        url: needsUrl ? urlInput.value : "",
                        icon: iconValue,
                        type: itemType,
                    };

                    delete newItem.iconColor;
                    delete newItem.style;
                    delete newItem.description;
                    delete newItem.targetOverride;
                    delete newItem.textStyle;
                    delete newItem.done;
                    delete newItem.content;
                    delete newItem.launcherKind;
                    delete newItem.target;
                    delete newItem.visible;
                    delete newItem.align;
                    delete newItem.separator;
                    delete newItem.steps;
                    delete newItem.stagger;

                    if (iconColorValue) {
                        newItem.iconColor = iconColorValue;
                    }

                    if (linkStyleTextVal) {
                        newItem.style = { "--link-color": linkStyleTextVal };
                    }

                    if (descriptionVal && itemType === "link") {
                        newItem.description = descriptionVal;
                    }

                    const targetOverrideVal =
                        document.getElementById("link-target-override")
                            ?.value || "";
                    if (targetOverrideVal && itemType === "link") {
                        newItem.targetOverride = targetOverrideVal;
                    }

                    if (itemType === "text") {
                        const activeStyleBtn = document.querySelector(
                            ".text-style-btn.active",
                        );
                        newItem.textStyle =
                            activeStyleBtn?.dataset.style || "normal";
                    }

                    if (itemType === "todo") {
                        newItem.done =
                            document.getElementById("todo-completed-toggle")
                                ?.checked || false;
                    }

                    if (itemType === "clipboard") {
                        newItem.content =
                            document
                                .getElementById("clipboard-content")
                                ?.value?.trim() || "";
                    }

                    if (itemType === "launcher") {
                        const launcherKind =
                            document.getElementById("launcher-kind")?.value ||
                            "app";
                        newItem.launcherKind = launcherKind;
                        newItem.target = launcherTargetEl?.value?.trim() || "";
                        if (launcherKind === "powershell") {
                            newItem.visible =
                                document.getElementById("launcher-ps-visible")
                                    ?.checked || false;
                        }
                    }

                    if (itemType === "routine") {
                        const editor = getItemRoutineEditor();
                        newItem.steps = editor ? editor.getSteps() : [];
                        newItem.stagger = editor ? editor.getStagger() : 0;
                    }

                    if (itemType === "header") {
                        newItem.align =
                            document.getElementById("header-align")?.value ||
                            "center";
                        const separatorToggle = document.getElementById(
                            "header-separator-toggle",
                        );
                        newItem.separator = separatorToggle
                            ? separatorToggle.checked
                            : true;
                    }

                    if (linkMode === "new") {
                        // Append new items at the end for every group type.
                        // Use (max existing y) + 1 rather than items.length so a
                        // non-contiguous y sequence still sorts the new item last.
                        const maxY = items.reduce(
                            (max, item) =>
                                typeof item.y === "number" && item.y > max
                                    ? item.y
                                    : max,
                            -1,
                        );
                        // Use items.length as a floor so the new item's y never
                        // collides with an existing item's implicit index-based y
                        // (items that lack an explicit y resolve to their array
                        // index in findItemIndexByY). Without this, a group whose
                        // items have no y assigns y=0 to the new item, which then
                        // matches index 0 on the next edit — replacing the wrong
                        // item and orphaning this one.
                        newItem.y = Math.max(maxY + 1, items.length);
                        items.push(newItem);
                    } else {
                        const targetIndex =
                            existingItemIndex >= 0
                                ? existingItemIndex
                                : linkIndex;
                        newItem.y = items[targetIndex]?.y ?? linkIndex ?? 0;
                        items[targetIndex] = newItem;
                    }

                    const shouldAutoGrowGroup =
                        linkMode === "new" &&
                        window.autoGrowGroupsOnItemAdd !== false;

                    const scheduleAutoGrowGroup = () => {
                        if (!shouldAutoGrowGroup) return;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                autoGrowGroupToFitItems(currentGroup);
                            });
                        });
                    };

                    if (
                        window.autoFaviconEnabled &&
                        itemType === "link" &&
                        !newItem.icon &&
                        newItem.url
                    ) {
                        try {
                            const faviconUrl = buildFaviconUrl(newItem.url);
                            const faviconWorkspaceId = getCurrentWorkspace();
                            const faviconGroupName = currentGroup;
                            const faviconItemY = newItem.y;
                            const faviconExpectedUrl = newItem.url;
                            const img = new Image();
                            img.onload = async () => {
                                await updateAutoFaviconTarget({
                                    workspaceId: faviconWorkspaceId,
                                    groupName: faviconGroupName,
                                    itemY: faviconItemY,
                                    expectedUrl: faviconExpectedUrl,
                                    faviconUrl,
                                });
                            };
                            img.src = faviconUrl;
                        } catch (error) {
                            console.warn(
                                "[event-handlers] Could not build favicon URL:",
                                error.message,
                            );
                        }
                    }

                    setWorkspaceGroups(getCurrentWorkspace(), elements);
                    saveWorkspacesToStorage();
                    createItems(getElements(), true);
                    scheduleAutoGrowGroup();

                    clearCapturedState();
                    resetLinkModalState();
                    return;
                }
            } else {
                alert(t("wih20_alert_fill_required"));
            }
        });
    }
};
