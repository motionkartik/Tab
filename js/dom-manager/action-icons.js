// Shared, extension-independent action glyphs for the app and public reader.
import { isStoredIconUrl, renderStoredIcon } from "../safe-svg.js";

const DEFAULT_WIDGET_ICONS = {
    "link-button":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3 448 192c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 128c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16L64 112c0-8.8 7.2-16 16-16l128 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg>',
    "clipboard-button":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M280 64l40 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l40 0 9.6 0C121 27.5 153.3 0 192 0s71 27.5 78.4 64l9.6 0zM192 48a32 32 0 1 0 0 64 32 32 0 1 0 0-64zM128 128l0-32-64 0c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16l-64 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32z"/></svg>',
    "routine-button":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.3-23-41L73 39z"/></svg>',
};

const LAUNCHER_KIND_ICONS = {
    app: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-29.9-20.7l-111.5 0L349.4 44.6z"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 480H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H298.5c-17 0-33.3-6.7-45.3-18.7L226.7 50.7c-12-12-28.3-18.7-45.3-18.7H64C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64z"/></svg>',
    file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M0 64C0 28.7 28.7 0 64 0H224V128c0 17.7 14.3 32 32 32H384V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zm384 64H256V0L384 128z"/></svg>',
    powershell:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416H544c17.7 0 32 14.3 32 32s-14.3 32-32 32H256c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/></svg>',
};

const renderWidgetIcon = (
    container,
    iconMarkup,
    iconColor = "",
    iconSize = 24,
) => {
    if (!container) return false;
    container.style.removeProperty("--icon-override");

    const size = Math.max(16, parseInt(iconSize, 10) || 24);
    const rendered = renderStoredIcon(container, iconMarkup, {
        imgWidth: size,
        imgHeight: size,
    });
    if (!rendered) return false;

    if (iconColor && !isStoredIconUrl(iconMarkup)) {
        container.style.setProperty("--icon-override", iconColor);
    }

    return true;
};

const getDefaultIconMarkup = (widgetType, launcherKind = "app") => {
    if (widgetType === "launcher-button") {
        return LAUNCHER_KIND_ICONS[launcherKind] || LAUNCHER_KIND_ICONS.app;
    }
    return (
        DEFAULT_WIDGET_ICONS[widgetType] || DEFAULT_WIDGET_ICONS["link-button"]
    );
};

export const renderTopLevelWidgetIcon = (container, widget) => {
    if (!container) return;

    // Icon links render at a fixed 36px (CSS-owned) — iconSize is ignored.
    // Tiles default larger than the standard shortcut's 24px (the large
    // 2-column tile larger still).
    const customIconRendered = widget.icon
        ? renderWidgetIcon(
              container,
              widget.icon,
              widget.iconColor,
              widget.display === "tile2"
                  ? widget.iconSize || 44
                  : widget.display === "tile"
                    ? widget.iconSize || 28
                    : widget.iconSize || 24,
          )
        : false;

    if (!customIconRendered) {
        container.innerHTML = getDefaultIconMarkup(
            widget.type,
            widget.launcherKind || "app",
        );
        // Default icons must honor the color override too, or a colored
        // clipboard/launcher tile turns gray when it has no custom icon.
        if (widget.iconColor) {
            container.style.setProperty("--icon-override", widget.iconColor);
        } else {
            container.style.removeProperty("--icon-override");
        }
        // Mirror the in-group item glyphs exactly: clipboard = accent-tinted
        // (.clipboard-type-icon), launcher + routine = neutral link color
        // (.launcher-type-icon, same class the group rows use). Without a
        // type class the fill-less default SVG doesn't track the group items.
        container.classList.toggle(
            "clipboard-type-icon",
            widget.type === "clipboard-button" && !widget.iconColor,
        );
        container.classList.toggle(
            "launcher-type-icon",
            (widget.type === "launcher-button" ||
                widget.type === "routine-button") &&
                !widget.iconColor,
        );
    } else {
        container.classList.remove("clipboard-type-icon", "launcher-type-icon");
    }
};

