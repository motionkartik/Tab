import {
    normalizeStoredIconValue,
    renderStoredIcon,
    renderStoredIconPreview,
} from "./safe-svg.js";
import { sanitizeImageSource, normalizeLinkUrl, sanitizeLinkUrl } from "./untrusted-input.js";
import { t } from "./i18n.js";
import { remoteFaviconsAllowed } from "./favicon.js";

// Shared icon picker logic for both the link drawer and the group drawer.

let faData = null;
const pickerStates = new Map();
const BATCH_SIZE = 80;

const loadFAData = async () => {
    if (faData) return faData;
    const url = new URL("./fa-icons.json", import.meta.url).href;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching fa-icons.json`);
    faData = await resp.json();
    return faData;
};

const buildList = (data, category, search) => {
    const list = [];
    const term = (search || "").toLowerCase().trim();
    const styles =
        category === "all" ? ["solid", "brands", "regular"] : [category];

    styles.forEach((style) => {
        Object.entries(data?.[style] || {}).forEach(([name, icon]) => {
            if (!term || name.includes(term)) {
                list.push({ name, style, path: icon.p, viewBox: icon.v });
            }
        });
    });

    return list;
};

const getPickerState = (key = "link") => {
    if (!pickerStates.has(key)) {
        pickerStates.set(key, {
            key,
            currentCategory: "solid",
            currentSearch: "",
            currentList: [],
            renderedCount: 0,
            pickerInitialized: false,
            listenersBound: false,
            root: null,
            searchTimer: null,
        });
    }
    return pickerStates.get(key);
};

const getRoot = (options = {}) => {
    if (options.root) return options.root;
    if (options.rootId) return document.getElementById(options.rootId);
    if (options.key === "group") return document.getElementById("group");
    return document.getElementById("link") || document;
};

const resolveOptions = (options = {}) => {
    const key = options.key || "link";
    const root = getRoot(options) || document;

    const defaults =
        key === "group"
            ? {
                  searchId: "group-fa-icon-search",
                  gridId: "group-fa-icon-grid",
                  svgInputId: "group-svg",
                  previewSelector: "#group-chosen-icon",
                  clearButtonId: "group-clear-icon-btn",
                  usedIconsStripId: "group-used-icons-strip",
                  categoryTabSelector: ".fa-category-tab",
                  topLevelTabSelector: ".icon-picker-tab",
                  panelSelector: ".icon-picker-panel",
                  topLevelPanelPrefix: "icon-panel-",
                  defaultCategory: "solid",
                  defaultTopLevelTab: "group-fa",
                  urlInputId: "group-link-button-url",
                  emptyPreviewText: t("ip22_no_icon_chosen"),
              }
            : {
                  searchId: "fa-icon-search",
                  gridId: "fa-icon-grid",
                  svgInputId: "svg",
                  previewSelector: ".choosen-icon",
                  clearButtonId: "clear-icon-btn",
                  usedIconsStripId: "used-icons-strip",
                  categoryTabSelector: ".fa-category-tab",
                  topLevelTabSelector: ".icon-picker-tab",
                  panelSelector: ".icon-picker-panel",
                  topLevelPanelPrefix: "icon-panel-",
                  defaultCategory: "solid",
                  defaultTopLevelTab: "fa",
                  urlInputId: "url",
                  emptyPreviewText: t("ip22_no_icon_chosen"),
              };

    return {
        key,
        root,
        ...defaults,
        ...options,
    };
};

const resolveContext = (options = {}) => {
    const resolved = resolveOptions(options);
    const { root } = resolved;

    return {
        ...resolved,
        grid: resolved.grid || root.querySelector(`#${resolved.gridId}`),
        svgInput:
            resolved.svgInput || root.querySelector(`#${resolved.svgInputId}`),
        preview:
            resolved.preview || root.querySelector(resolved.previewSelector),
        search: resolved.search || root.querySelector(`#${resolved.searchId}`),
        clearBtn:
            resolved.clearBtn ||
            (resolved.clearButtonId
                ? root.querySelector(`#${resolved.clearButtonId}`)
                : null),
        urlInput:
            resolved.urlInput ||
            (resolved.urlInputId
                ? root.querySelector(`#${resolved.urlInputId}`)
                : null),
        usedIconsStrip:
            resolved.usedIconsStrip ||
            (resolved.usedIconsStripId
                ? root.querySelector(`#${resolved.usedIconsStripId}`)
                : null),
        categoryTabs:
            resolved.categoryTabs ||
            Array.from(root.querySelectorAll(resolved.categoryTabSelector)),
        topLevelTabs:
            resolved.topLevelTabs ||
            Array.from(root.querySelectorAll(resolved.topLevelTabSelector)),
        panels:
            resolved.panels ||
            Array.from(root.querySelectorAll(resolved.panelSelector)),
    };
};

const renderPreview = (preview, iconValue, emptyText) => {
    if (!preview) return;
    renderStoredIconPreview(preview, iconValue, {
        emptyText: emptyText || t("ip22_no_icon_chosen"),
    });
};

const buildFaviconUrl = (url) => {
    if (!remoteFaviconsAllowed()) return "";
    const domain = new URL(url).hostname;
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
};



export const clearIconPickerSelection = (options = {}) => {
    const context = resolveContext(options);
    const { svgInput, preview, emptyPreviewText } = context;
    if (svgInput) {
        svgInput.value = "";
        svgInput.dispatchEvent(new Event("input"));
    }
    renderPreview(preview, "", emptyPreviewText);
};

export const setIconPickerSelection = (iconValue, options = {}) => {
    const context = resolveContext(options);
    const { svgInput, preview, emptyPreviewText } = context;
    if (!svgInput) return false;
    svgInput.value = iconValue || "";
    svgInput.dispatchEvent(new Event("input"));
    renderPreview(preview, iconValue || "", emptyPreviewText);

    return true;
};

export const autofetchFaviconIntoPicker = (rawUrl, options = {}) => {
    const safeUrl = sanitizeLinkUrl(rawUrl || "");
    if (!safeUrl) {
        clearIconPickerSelection(options);
        return false;
    }

    try {
        const faviconUrl = buildFaviconUrl(safeUrl);
        setIconPickerSelection(faviconUrl, options);
        return true;
    } catch {
        clearIconPickerSelection(options);
        return false;
    }
};

const appendBatch = (state, context) => {
    const { grid, svgInput, preview, emptyPreviewText } = context;
    if (!grid || !svgInput || !preview) return;

    const batch = state.currentList.slice(
        state.renderedCount,
        state.renderedCount + BATCH_SIZE,
    );
    const fragment = document.createDocumentFragment();

    batch.forEach(({ name, path, viewBox }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fa-icon-btn";
        btn.title = name;

        const svgEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svgEl.setAttribute("viewBox", viewBox);

        const pathEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
        );
        pathEl.setAttribute("d", path);
        svgEl.appendChild(pathEl);

        btn.appendChild(svgEl);
        btn.addEventListener("click", () => {
            const svgHtml = svgEl.outerHTML;
            svgInput.value = svgHtml;
            svgInput.dispatchEvent(new Event("input"));
            renderPreview(preview, svgHtml, emptyPreviewText);
        });

        fragment.appendChild(btn);
    });

    grid.appendChild(fragment);
    state.renderedCount += batch.length;
};

const refreshGrid = (state, context) => {
    if (!context.grid) return;
    context.grid.innerHTML = "";
    state.renderedCount = 0;
    appendBatch(state, context);
};

const activateTopLevelTab = (context, tabName) => {
    const { topLevelTabs, panels, topLevelPanelPrefix, defaultTopLevelTab } =
        context;

    if (!topLevelTabs.length) return;

    const targetTab =
        tabName || defaultTopLevelTab || topLevelTabs[0]?.dataset?.tab;

    topLevelTabs.forEach((tab, index) => {
        const isActive = targetTab
            ? tab.dataset.tab === targetTab
            : index === 0;
        tab.classList.toggle("active", isActive);
    });

    panels.forEach((panel) => panel.classList.remove("active"));

    if (targetTab && topLevelPanelPrefix) {
        const panel = context.root.querySelector(
            `#${topLevelPanelPrefix}${targetTab}`,
        );
        if (panel) panel.classList.add("active");
    } else if (panels[0]) {
        panels[0].classList.add("active");
    }
};

const activateCategoryTab = (context, category) => {
    const targetCategory = category || context.defaultCategory || "solid";
    context.categoryTabs.forEach((tab, index) => {
        const isActive = tab.dataset.cat
            ? tab.dataset.cat === targetCategory
            : index === 0;
        tab.classList.toggle("active", isActive);
    });
};

// --- Custom icon tab (paste any SVG/PNG link) -------------------------------
// Injected into the FA category row of each drawer (link + group), so both
// pickers offer Solid / Brands / Regular / Custom without HTML duplication.
const ensureCustomIconTab = (context, state, options = {}) => {
    const tabsRow = context.categoryTabs[0]?.parentElement;
    if (!tabsRow || state.customPanel?.isConnected) return;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "fa-category-tab";
    tab.dataset.cat = "custom";
    tab.textContent = t("ip22_cat_custom");
    tabsRow.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "custom-icon-panel";
    panel.hidden = true;
    panel.innerHTML =
        '<input type="text" class="custom-icon-url" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="custom-icon-use"></button>' +
        '<p class="custom-icon-error" role="alert" hidden></p>';
    const urlInput = panel.querySelector(".custom-icon-url");
    const useBtn = panel.querySelector(".custom-icon-use");
    const errorEl = panel.querySelector(".custom-icon-error");
    urlInput.placeholder = t("ip22_custom_url_ph");
    useBtn.textContent = t("ip22_custom_use");
    (context.grid || tabsRow).after(panel);

    const showError = (key) => {
        errorEl.textContent = key ? t(key) : "";
        errorEl.hidden = !key;
    };

    const applyCustomUrl = () => {
        showError(null);
        const safe = sanitizeImageSource(
            normalizeLinkUrl(urlInput.value.trim()),
        );
        if (!safe) {
            showError("ip22_custom_invalid");
            return;
        }
        // Probe first: only adopt the URL when it actually loads as an image
        // (works for SVG and PNG alike; SVGs load inert via <img>).
        useBtn.disabled = true;
        const probe = new Image();
        probe.onload = () => {
            useBtn.disabled = false;
            setIconPickerSelection(safe, options);
        };
        probe.onerror = () => {
            useBtn.disabled = false;
            showError("ip22_custom_failed");
        };
        probe.src = safe;
    };

    useBtn.addEventListener("click", applyCustomUrl);
    urlInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyCustomUrl();
        }
    });

    // Visibility follows the active category tab (delegated so it works no
    // matter in which order the generic tab handlers were bound).
    tabsRow.addEventListener("click", (event) => {
        const active = event.target.closest("[data-cat]");
        const custom = active?.dataset.cat === "custom";
        panel.hidden = !custom;
        if (context.grid) context.grid.style.display = custom ? "none" : "";
        if (context.search)
            context.search.style.display = custom ? "none" : "";
        if (custom) {
            showError(null);
            urlInput.focus();
        }
    });

    state.customPanel = panel;
};

const hideCustomIconPanel = (context, state) => {
    if (state.customPanel) state.customPanel.hidden = true;
    if (context.grid) context.grid.style.display = "";
    if (context.search) context.search.style.display = "";
};

const setupListeners = (state, context, data) => {
    if (state.listenersBound && state.root === context.root) return;
    state.listenersBound = true;
    state.root = context.root;

    const {
        grid,
        svgInput,
        preview,
        search,
        clearBtn,
    } = context;

    if (grid) {
        grid.addEventListener("scroll", () => {
            if (state.renderedCount >= state.currentList.length) return;
            if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 100) {
                appendBatch(state, context);
            }
        });
    }

    if (search) {
        search.addEventListener("input", () => {
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => {
                state.currentSearch = search.value;
                state.currentList = buildList(
                    data,
                    state.currentCategory,
                    state.currentSearch,
                );
                refreshGrid(state, context);
                state.searchTimer = null;
            }, 200);
        });
    }

    context.categoryTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            context.categoryTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            state.currentCategory = tab.dataset.cat || context.defaultCategory;
            state.currentList = buildList(
                data,
                state.currentCategory,
                state.currentSearch,
            );
            refreshGrid(state, context);
        });
    });

    context.topLevelTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            activateTopLevelTab(context, tab.dataset.tab);
        });
    });


    if (clearBtn && svgInput && preview) {
        clearBtn.addEventListener("click", () => {
            svgInput.value = "";
            svgInput.dispatchEvent(new Event("input"));
            renderPreview(preview, "", context.emptyPreviewText);
        });
    }
};

export const setGroupIcons = (items, options = {}) => {
    const context = resolveContext(options);
    const strip = context.usedIconsStrip;
    const list = strip?.querySelector(".used-icons-list");
    const svgInput = context.svgInput;
    const preview = context.preview;

    if (!strip || !list || !svgInput || !preview) return;

    const seen = new Set();
    const uniqueIcons = [];

    (items || []).forEach((item) => {
        const normalizedIcon = normalizeStoredIconValue(item.icon || "");
        if (!normalizedIcon || seen.has(normalizedIcon)) return;
        seen.add(normalizedIcon);
        uniqueIcons.push(normalizedIcon);
    });

    list.innerHTML = "";
    strip.style.display = uniqueIcons.length === 0 ? "none" : "";

    uniqueIcons.forEach((iconValue) => {
        const normalizedIconValue = normalizeStoredIconValue(iconValue);
        if (!normalizedIconValue) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "used-icon-btn";
        btn.title = t("ip22_use_this_icon");

        const rendered = renderStoredIcon(btn, normalizedIconValue, {
            imgWidth: 20,
            imgHeight: 20,
        });
        if (!rendered) return;

        const img = btn.querySelector("img");
        if (img) {
            img.onerror = () => {
                btn.remove();
                if (!list.children.length) strip.style.display = "none";
            };
        }

        btn.addEventListener("click", () => {
            svgInput.value = normalizedIconValue;
            svgInput.dispatchEvent(new Event("input"));
            renderPreview(
                preview,
                normalizedIconValue,
                context.emptyPreviewText,
            );
        });

        list.appendChild(btn);
    });
};

export const resetIconPicker = (options = {}) => {
    const context = resolveContext(options);
    const state = getPickerState(context.key);

    ensureCustomIconTab(context, state, options);

    clearTimeout(state.searchTimer);
    state.searchTimer = null;
    state.currentSearch = "";
    state.currentCategory = context.defaultCategory || "solid";

    if (context.search) context.search.value = "";
    activateCategoryTab(context, state.currentCategory);
    activateTopLevelTab(context, context.defaultTopLevelTab);
    hideCustomIconPanel(context, state);

    if (faData && context.grid && context.svgInput && context.preview) {
        state.currentList = buildList(faData, state.currentCategory, "");
        refreshGrid(state, context);
    }
};

export const initIconPicker = async (options = {}) => {
    const context = resolveContext(options);
    const state = getPickerState(context.key);
    const { grid, svgInput, preview } = context;

    if (!grid || !svgInput || !preview) return;

    if (state.pickerInitialized && state.root === context.root) return;
    state.pickerInitialized = true;
    state.root = context.root;
    state.currentCategory = context.defaultCategory || "solid";

    grid.innerHTML = `<div class="fa-icon-loading">${t("ip22_loading_icons")}</div>`;

    let data;
    try {
        data = await loadFAData();
    } catch (e) {
        console.error("[icon-picker] Failed to load FA icon data:", e);
        grid.innerHTML =
            `<div class="fa-icon-loading">${t("ip22_failed_load_icons")}</div>`;
        state.pickerInitialized = false;
        return;
    }

    state.currentList = buildList(data, state.currentCategory, "");
    refreshGrid(state, context);
    ensureCustomIconTab(context, state, options);
    setupListeners(state, context, data);
    activateCategoryTab(context, state.currentCategory);
    activateTopLevelTab(context, context.defaultTopLevelTab);
};
