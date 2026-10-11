import { getElements } from "../variables.js";
import { closeAllDrawers } from "../drawer-manager.js";
import {
    addGroupToWorkspace,
    addTopLevelActionWidgetsToWorkspace,
} from "../workspaces/workspace-grid-sync.js";
import { renderStoredIcon } from "../safe-svg.js";
import { t } from "../i18n.js";
import { remoteFaviconsAllowed } from "../favicon.js";

const buildFaviconUrl = (url) => {
    if (!remoteFaviconsAllowed()) return "";
    const domain = new URL(url).hostname;
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
};

const GROUP_ICONS = {
    work: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M184 48H328c13.3 0 24 10.7 24 24V96H160V72c0-13.3 10.7-24 24-24zM128 96V72c0-30.9 25.1-56 56-56H328c30.9 0 56 25.1 56 56V96H432c44.2 0 80 35.8 80 80V288c0 17.7-14.3 32-32 32H32C14.3 320 0 305.7 0 288V176C0 131.8 35.8 96 80 96H128zm384 240V432c0 44.2-35.8 80-80 80H80c-44.2 0-80-35.8-80-80V336c0-8.8 7.2-16 16-16H192v32c0 17.7 14.3 32 32 32h64c17.7 0 32-14.3 32-32V320H496c8.8 0 16 7.2 16 16z"/></svg>',
    personal:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M575.8 255.5c0 18-15 32.1-32.8 32H512l0 160c0 35.3-28.7 64-64 64H392c-17.7 0-32-14.3-32-32V383.9c0-17.7-14.3-32-32-32H248c-17.7 0-32 14.3-32 32V479.5c0 17.7-14.3 32-32 32H128c-35.3 0-64-28.7-64-64l0-160H32.8c-18 0-32.8-14.1-32.8-32c0-9.6 4.4-18.6 12-24.6L266.4 8.4c12.3-10.5 30.9-10.5 43.2 0L563.8 230.9c7.6 6 12 15 12 24.6z"/></svg>',
    reading:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M96 32C43 32 0 75 0 128V384c0 53 43 96 96 96H256V128c0-53-43-96-96-96H96zM256 32H160c56.8 0 96 39.2 96 96V480H480c53 0 96-43 96-96V128c0-53-43-96-96-96H256z"/></svg>',
    shopping:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M528.1 301.3L575.6 88.7C579.4 71.8 566.6 56 549.3 56H159.2l-9.4-44.2C146.7 4.9 137.4 0 128 0H24C10.7 0 0 10.7 0 24S10.7 48 24 48H108.5l70.5 331.4c-20.9 11.9-35 34.4-35 60.1c0 38.7 31.3 70 70 70s70-31.3 70-70c0-8.1-1.4-15.9-3.9-23.2H392c-2.5 7.3-3.9 15.1-3.9 23.2c0 38.7 31.3 70 70 70s70-31.3 70-70c0-28.4-16.9-52.8-41.2-63.8l8.9-39.8c2.3-10.4-5.6-20.2-16.3-20.2H219.5l-13.6-64H512c7.5 0 14-5.2 15.6-12.7z"/></svg>',
    finance:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path fill="currentColor" d="M209.4 17c-9.4-22.6-41.4-22.6-50.8 0L126.5 96H32C14.3 96 0 110.3 0 128s14.3 32 32 32H112.6L80.5 238.9c-5.4 13.4 .2 28.7 13 35.6l63.5 34.4-30.3 86.1c-5.9 16.8 6.7 34.4 24.5 34.4H232.8c17.8 0 30.5-17.6 24.5-34.4L227 308.9l63.5-34.4c12.8-6.9 18.4-22.2 13-35.6L271.4 160H352c17.7 0 32-14.3 32-32s-14.3-32-32-32H257.5L209.4 17z"/></svg>',
    social: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path fill="currentColor" d="M323.4 74.8c-45.6-45.6-119.6-45.6-165.2 0L141.3 91.7l-17-17c-45.6-45.6-119.6-45.6-165.2 0s-45.6 119.6 0 165.2l17 17L301.8 482.7c10 10 26.2 10 36.2 0L563.9 256.9l17-17c45.6-45.6 45.6-119.6 0-165.2s-119.6-45.6-165.2 0l-17 17-17-17z"/></svg>',
    "dev-tools":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path fill="currentColor" d="M392.8 1.2c-17 4.7-27 22.3-22.3 39.3l2.1 7.5c3.5 12.5-.3 25.9-9.9 34.8L317.4 128H192c-17.7 0-32 14.3-32 32v45.4L76.2 230.5c-18.1 5.2-27.8 24.8-21.6 42.5l22.9 65.7c6.2 17.8 25.2 27.1 43.3 21.9L160 350.6V416c0 17.7 14.3 32 32 32H317.4l45.2 45.2c9.6 8.9 13.4 22.3 9.9 34.8l-2.1 7.5c-4.7 17 5.3 34.6 22.3 39.3s34.6-5.3 39.3-22.3l2.1-7.5c9.8-35.3-.3-73.2-26.3-99.2L363.9 400H448c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32H363.9l43.9-43.9c26-26 36.1-63.9 26.3-99.2L432.1 1.2c-4.7-17-22.3-27-39.3-22.3z"/></svg>',
};

const STARTER_GROUP_SUGGESTIONS = [
    {
        id: "group-work",
        kind: "group",
        name: t("ssh19_group_work_name"),
        description: t("ssh19_group_work_desc"),
        defaultSelected: true,
        icon: GROUP_ICONS.work,
    },
    {
        id: "group-personal",
        kind: "group",
        name: t("ssh19_group_personal_name"),
        description: t("ssh19_group_personal_desc"),
        defaultSelected: true,
        icon: GROUP_ICONS.personal,
    },
    {
        id: "group-reading",
        kind: "group",
        name: t("ssh19_group_reading_name"),
        description: t("ssh19_group_reading_desc"),
        defaultSelected: true,
        icon: GROUP_ICONS.reading,
    },
    {
        id: "group-shopping",
        kind: "group",
        name: t("ssh19_group_shopping_name"),
        description: t("ssh19_group_shopping_desc"),
        defaultSelected: false,
        icon: GROUP_ICONS.shopping,
    },
    {
        id: "group-finance",
        kind: "group",
        name: t("ssh19_group_finance_name"),
        description: t("ssh19_group_finance_desc"),
        defaultSelected: false,
        icon: GROUP_ICONS.finance,
    },
    {
        id: "group-social",
        kind: "group",
        name: t("ssh19_group_social_name"),
        description: t("ssh19_group_social_desc"),
        defaultSelected: false,
        icon: GROUP_ICONS.social,
    },
    {
        id: "group-dev-tools",
        kind: "group",
        name: t("ssh19_group_devtools_name"),
        description: t("ssh19_group_devtools_desc"),
        defaultSelected: false,
        icon: GROUP_ICONS["dev-tools"],
    },
];

const POPULAR_LINK_BUTTON_SUGGESTIONS = [
    ["google", "Google", "https://google.com"],
    ["youtube", "Youtube", "https://youtube.com"],
    ["facebook", "Facebook", "https://facebook.com"],
    ["instagram", "Instagram", "https://instagram.com"],
    ["chatgpt", "ChatGPT", "https://chatgpt.com"],
    ["reddit", "Reddit", "https://reddit.com"],
    ["wikipedia", "Wikipedia", "https://wikipedia.org"],
    ["x", "X", "https://x.com"],
    ["whatsapp", "Whatsapp", "https://whatsapp.com"],
    ["tiktok", "Tiktok", "https://tiktok.com"],
    ["yahoo", "Yahoo", "https://yahoo.com"],
    ["amazon", "Amazon", "https://amazon.com"],
    ["duckduckgo", "Duckduckgo", "https://duckduckgo.com"],
    ["bing", "Bing", "https://bing.com"],
    ["linkedin", "LinkedIn", "https://linkedin.com"],
    ["weather", "Weather", "https://weather.com"],
    ["discord", "Discord", "https://discord.com"],
].map(([id, name, url]) => ({
    id: `site-${id}`,
    kind: "link-button",
    name,
    url,
    description: url.replace(/^https?:\/\//, ""),
    defaultSelected: false,
    icon: buildFaviconUrl(url),
}));

const STARTER_SUGGESTION_SECTIONS = [
    {
        id: "starter-groups",
        title: t("ssh19_section_groups_title"),
        description: t("ssh19_section_groups_desc"),
        suggestions: STARTER_GROUP_SUGGESTIONS,
    },
    {
        id: "popular-sites",
        title: t("ssh19_section_sites_title"),
        description: t("ssh19_section_sites_desc"),
        suggestions: POPULAR_LINK_BUTTON_SUGGESTIONS,
    },
];

let suggestionsModal = null;
let suggestionsList = null;
let applyButton = null;

const getAllSuggestions = () =>
    STARTER_SUGGESTION_SECTIONS.flatMap((section) => section.suggestions);

const ensureUniqueElementName = (baseName, existingNames) => {
    const trimmed = (baseName || "Item").trim() || "Item";
    let candidate = trimmed;
    let suffix = 2;

    while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${trimmed} (${suffix})`;
        suffix += 1;
    }

    existingNames.add(candidate.toLowerCase());
    return candidate;
};

const getSelectedSuggestions = () => {
    if (!suggestionsList) return [];

    const selectedIds = new Set(
        Array.from(
            suggestionsList.querySelectorAll('input[type="checkbox"]:checked'),
        ).map((input) => input.value),
    );

    return getAllSuggestions().filter((suggestion) =>
        selectedIds.has(suggestion.id),
    );
};

const syncCardStates = () => {
    if (!suggestionsList) return;

    suggestionsList
        .querySelectorAll(".starter-suggestion-card")
        .forEach((card) => {
            const checkbox = card.querySelector('input[type="checkbox"]');
            card.classList.toggle("is-selected", checkbox?.checked === true);
        });
};

const updateApplyButton = () => {
    if (!applyButton) return;

    const selectedCount = getSelectedSuggestions().length;
    applyButton.disabled = selectedCount === 0;
    applyButton.textContent =
        selectedCount === 1
            ? t("ssh19_add_one_item")
            : t("ssh19_add_n_items", [selectedCount]);
};

const buildExistingNamesSet = () =>
    new Set(
        (getElements() || [])
            .map((group) => (group?.name || group?.content?.name || "").trim())
            .filter(Boolean)
            .map((name) => name.toLowerCase()),
    );

const addPopularSiteSuggestions = async (suggestions) => {
    const existingNames = buildExistingNamesSet();

    await addTopLevelActionWidgetsToWorkspace(
        suggestions.map((suggestion) => ({
            name: ensureUniqueElementName(suggestion.name, existingNames),
            type: "link-button",
            options: {
                url: suggestion.url,
                icon: suggestion.icon,
            },
        })),
    );
};

const createSuggestionCard = (suggestion) => {
    const label = document.createElement("label");
    label.className = `starter-suggestion-card${suggestion.defaultSelected ? " is-selected" : ""}`;
    label.dataset.kind = suggestion.kind;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = suggestion.id;
    input.checked = suggestion.defaultSelected;
    input.className = "starter-suggestion-checkbox";

    const checkboxUi = document.createElement("span");
    checkboxUi.className = "starter-suggestion-checkbox-ui";
    checkboxUi.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>';

    const iconWrap = document.createElement("span");
    iconWrap.className = "starter-suggestion-icon";
    renderStoredIcon(iconWrap, suggestion.icon, {
        imgWidth: 24,
        imgHeight: 24,
    });

    const copy = document.createElement("span");
    copy.className = "starter-suggestion-copy";

    const title = document.createElement("p");
    title.className = "starter-suggestion-card-title";
    title.textContent = suggestion.name;

    const description = document.createElement("p");
    description.className = "starter-suggestion-card-description";
    description.textContent = suggestion.description;

    copy.append(title, description);
    label.append(input, checkboxUi, iconWrap, copy);
    return label;
};

const renderSuggestions = () => {
    if (!suggestionsList) return;

    suggestionsList.replaceChildren();

    STARTER_SUGGESTION_SECTIONS.forEach((section) => {
        const sectionEl = document.createElement("section");
        sectionEl.className = "starter-suggestions-section";

        const header = document.createElement("div");
        header.className = "starter-suggestions-section-header";

        const heading = document.createElement("h3");
        heading.className = "starter-suggestions-section-title";
        heading.textContent = section.title;

        const description = document.createElement("p");
        description.className = "starter-suggestions-section-description";
        description.textContent = section.description;

        const grid = document.createElement("div");
        grid.className = "starter-suggestions-grid";

        section.suggestions.forEach((suggestion) => {
            grid.append(createSuggestionCard(suggestion));
        });

        header.append(heading, description);
        sectionEl.append(header, grid);
        suggestionsList.append(sectionEl);
    });

    syncCardStates();
    updateApplyButton();
};

export const closeStarterSuggestionsModal = () => {
    suggestionsModal?.classList.remove("active");
};

export const openStarterSuggestionsModal = () => {
    if (!suggestionsModal) return;

    closeAllDrawers();
    renderSuggestions();
    suggestionsModal.classList.add("active");

    requestAnimationFrame(() => {
        suggestionsList
            ?.querySelector('input[type="checkbox"]')
            ?.focus({ preventScroll: true });
    });
};

const applyStarterSuggestions = async () => {
    const selectedSuggestions = getSelectedSuggestions();
    if (selectedSuggestions.length === 0) {
        alert(t("ssh19_alert_select_one"));
        return;
    }

    const existingNames = buildExistingNamesSet();

    const groupSuggestions = selectedSuggestions.filter(
        (suggestion) => suggestion.kind === "group",
    );
    const linkButtonSuggestions = selectedSuggestions.filter(
        (suggestion) => suggestion.kind === "link-button",
    );

    for (const suggestion of groupSuggestions) {
        const groupName = ensureUniqueElementName(
            suggestion.name,
            existingNames,
        );
        await addGroupToWorkspace(groupName, []);
    }

    if (linkButtonSuggestions.length > 0) {
        await addPopularSiteSuggestions(linkButtonSuggestions);
    }

    closeStarterSuggestionsModal();
};

export const initStarterSuggestionsHandlers = () => {
    suggestionsModal = document.getElementById("starter-suggestions-modal");
    suggestionsList = document.getElementById("starter-suggestions-list");
    applyButton = document.getElementById("starter-suggestions-apply");
    if (!suggestionsModal || !suggestionsList || !applyButton) return;

    const closeButton = document.getElementById("starter-suggestions-close");
    const skipButton = document.getElementById("starter-suggestions-skip");

    closeButton?.addEventListener("click", closeStarterSuggestionsModal);
    skipButton?.addEventListener("click", closeStarterSuggestionsModal);
    applyButton.addEventListener("click", () => {
        void applyStarterSuggestions();
    });

    suggestionsModal.addEventListener("click", (event) => {
        if (event.target === suggestionsModal) {
            closeStarterSuggestionsModal();
        }
    });

    suggestionsList.addEventListener("change", (event) => {
        if (!(event.target instanceof HTMLInputElement)) return;
        syncCardStates();
        updateApplyButton();
    });

};
