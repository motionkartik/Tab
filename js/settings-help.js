import { t } from "./i18n.js";

const DOCS_BASE_URL = "https://docs.readytab.cloud";
const COMPANION_BASE_URL = `${DOCS_BASE_URL}/companion/setup.html`;

const HELP_CONTENT = {
    "link-behavior": {
        title: "Link Behavior",
        body: "Choose the default target for your saved links. Current tab keeps navigation in the active tab, while New tab opens links separately. This setting controls the default behavior used across your dashboard.",
        href: `${DOCS_BASE_URL}/guide/settings.html#general`,
        linkText: "Open settings documentation",
    },
    clock: {
        title: "Clock",
        body: "The clock appears in the header area of your new tab page. You can show or hide it, switch between 24-hour and 12-hour time, and choose whether seconds and the date are displayed.",
        href: `${DOCS_BASE_URL}/guide/settings.html#general`,
        linkText: "Open settings documentation",
    },
    logo: {
        title: "Logo",
        body: "Upload a custom logo to show in the header. ReadyTab keeps the image aspect ratio intact and aligns the logo so its bottom edge lines up cleanly with the workspace tabs. You can also remove it or change its display size later.",
        href: `${DOCS_BASE_URL}/guide/settings.html#general`,
        linkText: "Open settings documentation",
    },
    "web-search": {
        title: "Searchbar",
        body: "Show the searchbar directly in the header. It searches your saved items first; web searches use your browser's default search engine unless you explicitly pick one here. You can also decide whether submitted searches replace the current page or open their results in a new tab.",
        href: `${DOCS_BASE_URL}/guide/settings.html#general`,
        linkText: "Open settings documentation",
    },
    "spotlight-search": {
        title: "Spotlight Search",
        body: "Spotlight Search helps you quickly find saved links from the keyboard. You can enable it outside the new-tab page and optionally include group names in search results to make larger dashboards easier to navigate.",
        href: `${DOCS_BASE_URL}/guide/search-and-add.html#spotlight-on-all-pages`,
        linkText: "Open Spotlight documentation",
    },
    "link-health": {
        title: "Link Health",
        body: "When enabled, ReadyTab periodically checks your saved HTTP and HTTPS links and marks unreachable ones with a red indicator. This feature stays off until you explicitly turn it on.",
        href: `${DOCS_BASE_URL}/guide/settings.html#general`,
        linkText: "Open settings documentation",
    },
    "background-custom-css": {
        title: "Custom CSS",
        body: "This field is only for the workspace background value. Use any valid CSS background value such as a gradient, image URL, or background shorthand. It does not inject page-wide CSS and only affects the current workspace background.",
        href: `${DOCS_BASE_URL}/guide/settings.html#background`,
        linkText: "Open settings documentation",
    },
    "apply-from-workspace": {
        title: "Copy from Workspace",
        body: "Copy visual settings from another workspace into the current one. This is useful when you want multiple workspaces to share the same theme, background, and design setup without recreating everything manually.",
        href: `${DOCS_BASE_URL}/guide/settings.html#background`,
        linkText: "Open settings documentation",
    },
    "saved-themes": {
        title: "Saved Themes",
        body: "Saved themes are reusable design presets. They store a base theme plus your editor customizations so you can quickly apply the same look to the current workspace again later without rebuilding it from scratch.",
        href: `${DOCS_BASE_URL}/guide/settings.html#theme-editor`,
        linkText: "Read theme editor documentation",
    },
    "design-custom-css": {
        title: "Custom CSS",
        body: "This Custom CSS field injects CSS for the whole current workspace page. Use it for advanced styling beyond the built-in theme controls. Unlike Background > Custom CSS, it is not limited to the background value.",
        href: `${DOCS_BASE_URL}/guide/settings.html#theme-editor`,
        linkText: "Read theme editor documentation",
    },
    "design-reset-default": {
        title: "Reset to Default",
        body: "Reset to Default returns the current workspace all the way to the built-in look: it clears your editor customizations and custom CSS, switches the base theme back to Simple, and resets the extra appearance toggles (tab underline, descriptions, hover motion). For a lighter reset that keeps the base theme you picked, use Reset Theme in the Theme actions card. Neither one deletes your saved theme presets.",
        href: `${DOCS_BASE_URL}/guide/settings.html#design`,
        linkText: "Open settings documentation",
    },
    "theme-actions": {
        title: "Theme Actions",
        body: "Save Theme stores the current look as a reusable saved theme. Reset Theme discards your editor customizations and custom CSS for this workspace but keeps the base theme you selected. Export and Import move your saved themes in and out as a JSON file. For a full reset that also reverts the base theme to Simple, use Reset to Default below.",
        href: `${DOCS_BASE_URL}/guide/settings.html#theme-editor`,
        linkText: "Read theme editor documentation",
    },
    spaces: {
        title: "Spaces",
        body: "Reorder your spaces with drag and drop to control the tab order shown at the top of the page. The default space always stays first, while the rest can be arranged to match how you work. You can also use the actions on each row to rename a space, protect it, share it, or delete it when needed.",
        href: `${DOCS_BASE_URL}/guide/spaces.html`,
        linkText: "Open spaces documentation",
    },
    "import-from-code": {
        title: "Import from Code",
        body: "Import a local copy of a shared workspace by pasting its share code here. The imported workspace becomes your own editable copy, so later changes from the original source will not automatically overwrite it.",
        href: `${DOCS_BASE_URL}/guide/spaces.html#shared-boards`,
        linkText: "Open spaces documentation",
    },
    bookmarks: {
        title: "Import from Bookmarks",
        body: "Import a bookmark folder from your browser as a new group in ReadyTab. This is useful for turning existing bookmark collections into dashboard groups without recreating links one by one.",
        href: `${DOCS_BASE_URL}/guide/settings.html#data`,
        linkText: "Open settings documentation",
    },
    "save-current-window": {
        title: "Save Current Window as Group",
        body: "Capture the supported tabs from your current browser window and save them into a new link group. This is handy when you want to turn a working set of tabs into something permanent on your dashboard.",
        href: `${DOCS_BASE_URL}/guide/settings.html#data`,
        linkText: "Open settings documentation",
    },
    "session-recovery": {
        title: "Session Recovery",
        body: "ReadyTab keeps a lightweight local snapshot of supported tabs from your recent browser session so you can inspect or restore them later. Use this when you want a safety net for accidental window closes or to reopen a recent working session.",
        href: `${DOCS_BASE_URL}/guide/settings.html#data`,
        linkText: "Open settings documentation",
    },
    companion: {
        title: "Companion App",
        body: "The Companion App helps ReadyTab connect with local files, apps, and desktop workflows that a browser extension cannot handle on its own. Use it when you want tighter integration with your operating system and local tools.",
        href: COMPANION_BASE_URL,
        linkText: "Open companion setup guide",
    },
    "cloud-sync": {
        title: "Cloud Sync",
        body: "Cloud Sync stores encrypted workspace snapshots in your ReadyTab account. Use Push to upload your current local state, Pull to replace local state with a cloud snapshot, and keep separate dashboards for different setups.",
        href: `${DOCS_BASE_URL}/guide/settings.html#account`,
        linkText: "Open settings documentation",
    },
    "cloud-sync-automation": {
        title: "Cloud Sync Automation",
        body: "Auto-sync updates your active cloud dashboard after local changes once ReadyTab has been idle for the selected delay. Auto-pull can also apply newer cloud snapshots automatically, but only when your local dashboard has no unsynced changes. If both local and cloud changed, ReadyTab will ask before overwriting anything.",
        href: `${DOCS_BASE_URL}/guide/settings.html#account`,
        linkText: "Open settings documentation",
    },
    "managed-boards": {
        title: "Managed Boards",
        body: "Managed boards are read-only workspaces published by a team or agency. Subscribe with a board token to keep that workspace updated without mixing it with your editable local spaces.",
        href: `${DOCS_BASE_URL}/guide/managed-boards.html`,
        linkText: "Read managed boards documentation",
    },
    theme: {
        title: "Theme",
        body: "Changing the theme updates the current workspace to that theme’s default look, including its default background. ReadyTab keeps a temporary Revert action so you can restore the previous theme, background, and design customizations if needed.",
        href: `${DOCS_BASE_URL}/guide/settings.html#design`,
        linkText: "Read settings documentation",
    },
    "theme-editor": {
        title: "Theme Editor",
        body: "The theme editor lets you fine-tune theme tokens, save reusable named themes, and keep workspace-specific customizations. The Custom CSS section in Design injects CSS for the whole current workspace page, unlike Background > Custom CSS which only sets the background value.",
        href: `${DOCS_BASE_URL}/guide/settings.html#theme-editor`,
        linkText: "Read theme editor documentation",
    },
};

const HELP_ICON_MARKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.75 9a2.25 2.25 0 0 1 4.42.67c0 1.56-1.67 2.13-2.17 3.08"></path><circle cx="12" cy="16.6" r="0.8" fill="currentColor" stroke="none"></circle></svg>`;

let activeTrigger = null;
let popover = null;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function getSettingsHelpButtonMarkup(helpId, label) {
    const safeHelpId = escapeHtml(helpId);
    const labelText = label || t("settings_help_this_setting");
    const safeHelpText = escapeHtml(t("settings_help_about", [labelText]));
    return `<button type="button" class="settings-help-trigger" data-settings-help="${safeHelpId}" aria-label="${safeHelpText}" aria-haspopup="dialog" title="${safeHelpText}">${HELP_ICON_MARKUP}</button>`;
}

function ensurePopover() {
    if (popover) return popover;

    popover = document.createElement("div");
    popover.id = "settings-help-popover";
    popover.className = "settings-help-popover";
    popover.hidden = true;
    popover.innerHTML = `
        <div class="settings-help-popover-arrow" aria-hidden="true"></div>
        <div class="settings-help-popover-inner">
            <div class="settings-help-popover-title"></div>
            <p class="settings-help-popover-body"></p>
            <a class="settings-help-popover-link" target="_blank" rel="noopener noreferrer" style="display: none"></a>
        </div>
    `;
    document.body.appendChild(popover);
    return popover;
}

function setExpanded(trigger, expanded) {
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function closeSettingsHelp() {
    if (popover) popover.hidden = true;
    setExpanded(activeTrigger, false);
    activeTrigger = null;
}

function positionPopover(trigger) {
    if (!popover || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const arrow = popover.querySelector(".settings-help-popover-arrow");
    const gap = 10;
    const margin = 12;

    popover.hidden = false;
    popover.style.top = "0px";
    popover.style.left = "0px";

    const popoverRect = popover.getBoundingClientRect();
    const maxLeft = window.innerWidth - popoverRect.width - margin;
    const centeredLeft = rect.left + rect.width / 2 - popoverRect.width / 2;
    const left = Math.min(
        Math.max(margin, centeredLeft),
        Math.max(margin, maxLeft),
    );

    const placeAbove =
        rect.bottom + gap + popoverRect.height > window.innerHeight - margin &&
        rect.top - gap - popoverRect.height >= margin;
    const top = placeAbove
        ? rect.top - popoverRect.height - gap
        : rect.bottom + gap;

    popover.dataset.placement = placeAbove ? "top" : "bottom";
    popover.style.top = `${Math.max(margin, top)}px`;
    popover.style.left = `${left}px`;

    if (arrow) {
        const arrowLeft = rect.left + rect.width / 2 - left;
        arrow.style.left = `${Math.min(Math.max(16, arrowLeft), popoverRect.width - 16)}px`;
    }
}

function openSettingsHelp(trigger) {
    const helpId = trigger?.dataset.settingsHelp;
    const content = HELP_CONTENT[helpId];
    if (!trigger || !content) return;

    // Chrome message keys can't contain hyphens, so ids like "link-behavior"
    // map to help_link_behavior_title / _body / _link in the catalogs.
    const k = helpId.replace(/-/g, "_");

    const panel = ensurePopover();
    panel.querySelector(".settings-help-popover-title").textContent =
        t(`help_${k}_title`);
    panel.querySelector(".settings-help-popover-body").textContent =
        t(`help_${k}_body`);

    const link = panel.querySelector(".settings-help-popover-link");
    if (content.href && content.linkText) {
        link.href = content.href;
        link.textContent = t(`help_${k}_link`);
        link.style.display = "inline-flex";
    } else {
        link.removeAttribute("href");
        link.textContent = "";
        link.style.display = "none";
    }

    if (activeTrigger && activeTrigger !== trigger) {
        setExpanded(activeTrigger, false);
    }

    activeTrigger = trigger;
    setExpanded(trigger, true);
    positionPopover(trigger);
}

export function initSettingsHelp() {
    ensurePopover();

    document.addEventListener("click", (event) => {
        const trigger = event.target.closest(".settings-help-trigger");
        if (trigger) {
            if (activeTrigger === trigger && !popover.hidden) {
                closeSettingsHelp();
            } else {
                openSettingsHelp(trigger);
            }
            return;
        }

        if (popover && !popover.hidden && !popover.contains(event.target)) {
            closeSettingsHelp();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSettingsHelp();
        }
    });

    window.addEventListener("resize", () => {
        if (activeTrigger && popover && !popover.hidden) {
            positionPopover(activeTrigger);
        }
    });

    window.addEventListener(
        "scroll",
        () => {
            if (activeTrigger && popover && !popover.hidden) {
                closeSettingsHelp();
            }
        },
        true,
    );
}

export { closeSettingsHelp };
