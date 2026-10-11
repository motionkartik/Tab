// Group Style Editor — side drawer for per-group CSS variable overrides
import { closeAllDrawers } from "./drawer-manager.js";
import { t } from "./i18n.js";

const GROUP_STYLE_GROUPS = [
    {
        label: t("gse21_card"),
        vars: [
            { var: "--card-bg", label: t("gse21_background"), type: "color" },
            {
                var: "--card-border-color",
                label: t("gse21_border_color"),
                type: "color",
            },
            {
                var: "--card-shadow",
                label: t("gse21_shadow"),
                type: "text",
                placeholder: t("gse21_none"),
            },
        ],
    },
    {
        label: t("gse21_group_header"),
        vars: [
            { var: "--header-bg", label: t("gse21_background"), type: "color" },
            {
                var: "--header-color",
                label: t("gse21_text_color"),
                type: "color",
            },
        ],
    },
    {
        label: t("gse21_links"),
        vars: [
            { var: "--link-color", label: t("gse21_text_color"), type: "color" },
            { var: "--icon-color", label: t("gse21_icon_color"), type: "color" },
        ],
    },
    {
        label: t("gse21_other"),
        vars: [
            {
                var: "--accent-color",
                label: t("gse21_accent_color"),
                type: "color",
            },
        ],
    },
];

let drawerEl = null;

function clearDrawerPendingCommits(drawer) {
    drawer?._cleanupPendingCommits?.();
    if (drawer) drawer._cleanupPendingCommits = null;
}

function hideDrawer(drawer) {
    clearDrawerPendingCommits(drawer);
    drawer?.classList.remove("active");
}

function getDrawer() {
    if (drawerEl) return drawerEl;

    const backdrop = document.createElement("div");
    backdrop.className = "settings-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "settings-modal";

    const header = document.createElement("div");
    header.className = "settings-modal-header";

    const titleEl = document.createElement("h2");
    titleEl.textContent = t("gse21_group_style_title");

    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-modal-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => hideDrawer(backdrop));

    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) hideDrawer(backdrop);
    });

    header.append(titleEl, closeBtn);

    const content = document.createElement("div");
    content.className = "settings-content";
    content.id = "group-style-editor-content";

    modal.append(header, content);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    drawerEl = backdrop;
    return backdrop;
}

// Read the current computed value of a CSS var from the body (reflects active theme)
function getComputedVar(varName) {
    return (
        getComputedStyle(document.body).getPropertyValue(varName).trim() || ""
    );
}

// Parse any CSS color into { r, g, b, a } — returns null if unparseable
function parseColor(val) {
    if (!val) return null;
    val = val.trim();
    // rgb() / rgba()
    const m = val.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
    );
    if (m)
        return {
            r: +m[1],
            g: +m[2],
            b: +m[3],
            a: m[4] !== undefined ? +m[4] : 1,
        };
    // hex / named → resolve via canvas
    try {
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillStyle = val;
        const c = ctx.fillStyle;
        if (/^#[0-9a-f]{6}$/i.test(c)) {
            return {
                r: parseInt(c.slice(1, 3), 16),
                g: parseInt(c.slice(3, 5), 16),
                b: parseInt(c.slice(5, 7), 16),
                a: 1,
            };
        }
    } catch {}
    return null;
}

function rgbToHex(r, g, b) {
    return (
        "#" +
        [r, g, b]
            .map((x) => Math.round(x).toString(16).padStart(2, "0"))
            .join("")
    );
}

function normalizeHexColor(hexColor) {
    if (typeof hexColor !== "string") return null;
    const trimmed = hexColor.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return null;
}

function buildRgba(hexColor, alpha) {
    const normalized = normalizeHexColor(hexColor) || "#888888";
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return alpha >= 1
        ? normalized
        : `rgba(${r},${g},${b},${+alpha.toFixed(2)})`;
}

export const openGroupStyleEditor = (groupData, widgetEl, onSave) => {
    const drawer = getDrawer();
    clearDrawerPendingCommits(drawer);
    const pendingDebounces = new Set();
    drawer._cleanupPendingCommits = () => {
        pendingDebounces.forEach((timer) => clearTimeout(timer));
        pendingDebounces.clear();
    };
    const content = drawer.querySelector("#group-style-editor-content");
    content.innerHTML = "";

    const style = groupData.style ? { ...groupData.style } : {};
    const getItemEl = () =>
        widgetEl?.querySelector(".grid-stack-item-content .item");
    const getContentEl = () =>
        widgetEl?.querySelector(".grid-stack-item-content");

    function applyVar(varName, value) {
        const itemEl = getItemEl(),
            contentEl = getContentEl();
        if (itemEl) itemEl.style.setProperty(varName, value);
        if (contentEl) contentEl.style.setProperty(varName, value);
    }
    function removeVar(varName) {
        const itemEl = getItemEl(),
            contentEl = getContentEl();
        if (itemEl) itemEl.style.removeProperty(varName);
        if (contentEl) contentEl.style.removeProperty(varName);
    }

    function commitStyle() {
        groupData.style = Object.keys(style).length ? style : undefined;
        const itemEl = getItemEl();
        if (itemEl) {
            itemEl.dataset.groupStyle = groupData.style
                ? JSON.stringify(groupData.style)
                : "";
        }
        onSave();
    }

    function buildVarRow(varName, label, type, placeholder) {
        const row = document.createElement("div");
        row.className = "gse-row";

        const labelEl = document.createElement("span");
        labelEl.className = "gse-label";
        labelEl.textContent = label;

        const controls = document.createElement("div");
        controls.className = "gse-controls";

        const overrideVal = style[varName] || "";

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "↺";
        clearBtn.title = t("gse21_clear_override");
        clearBtn.className = "settings-btn-secondary gse-clear-btn";

        if (type === "color") {
            const displayVal = overrideVal || getComputedVar(varName);
            const parsed = parseColor(displayVal);
            const initHex = parsed
                ? rgbToHex(parsed.r, parsed.g, parsed.b)
                : "#888888";
            const initAlpha = parsed ? parsed.a : 1;

            const picker = document.createElement("input");
            picker.type = "color";
            picker.value = initHex;
            picker.className = "gse-color-picker";

            const alphaSlider = document.createElement("input");
            alphaSlider.type = "range";
            alphaSlider.min = "0";
            alphaSlider.max = "100";
            alphaSlider.value = Math.round(initAlpha * 100);
            alphaSlider.className = "gse-alpha-slider";

            const alphaLabel = document.createElement("span");
            alphaLabel.textContent = t("gse21_alpha_percent", [alphaSlider.value]);
            alphaLabel.className = "gse-alpha-label";

            let hasOverride = !!overrideVal;

            function onColorChange() {
                hasOverride = true;
                const v = buildRgba(picker.value, alphaSlider.value / 100);
                style[varName] = v;
                applyVar(varName, v);
                alphaLabel.textContent = t("gse21_alpha_percent", [alphaSlider.value]);
                commitStyle();
            }

            picker.addEventListener("input", onColorChange);
            alphaSlider.addEventListener("input", onColorChange);

            clearBtn.addEventListener("click", () => {
                hasOverride = false;
                delete style[varName];
                removeVar(varName);
                const computed = parseColor(getComputedVar(varName));
                picker.value = computed
                    ? rgbToHex(computed.r, computed.g, computed.b)
                    : "#888888";
                alphaSlider.value = computed
                    ? Math.round(computed.a * 100)
                    : 100;
                alphaLabel.textContent = t("gse21_alpha_percent", [alphaSlider.value]);
                commitStyle();
            });

            controls.append(picker, alphaSlider, alphaLabel, clearBtn);
        } else {
            const input = document.createElement("input");
            input.type = "text";
            input.value = overrideVal;
            input.placeholder = placeholder || "";
            input.className = "gse-text-input";

            let debounce = null;
            input.addEventListener("input", () => {
                clearTimeout(debounce);
                if (debounce) pendingDebounces.delete(debounce);
                debounce = setTimeout(() => {
                    pendingDebounces.delete(debounce);
                    const v = input.value.trim();
                    if (v) {
                        style[varName] = v;
                        applyVar(varName, v);
                    } else {
                        delete style[varName];
                        removeVar(varName);
                    }
                    commitStyle();
                }, 400);
                pendingDebounces.add(debounce);
            });

            clearBtn.addEventListener("click", () => {
                clearTimeout(debounce);
                if (debounce) pendingDebounces.delete(debounce);
                input.value = "";
                delete style[varName];
                removeVar(varName);
                commitStyle();
            });

            controls.append(input, clearBtn);
        }

        row.append(labelEl, controls);
        return row;
    }

    // Render groups
    GROUP_STYLE_GROUPS.forEach((group) => {
        const section = document.createElement("div");
        section.className = "settings-section";

        const h3 = document.createElement("h3");
        h3.textContent = group.label;
        section.appendChild(h3);

        group.vars.forEach(({ var: varName, label, type, placeholder }) => {
            section.appendChild(buildVarRow(varName, label, type, placeholder));
        });

        content.appendChild(section);
    });

    // Reset all overrides
    const resetSection = document.createElement("div");
    resetSection.className = "settings-section settings-reset";

    const resetBtn = document.createElement("button");
    resetBtn.className = "settings-btn-secondary";
    resetBtn.textContent = t("gse21_reset_all");
    resetBtn.style.textTransform = "none";
    resetBtn.addEventListener("click", () => {
        groupData.style = undefined;
        const itemEl = getItemEl();
        if (itemEl) itemEl.dataset.groupStyle = "";
        GROUP_STYLE_GROUPS.forEach((g) =>
            g.vars.forEach(({ var: v }) => removeVar(v)),
        );
        onSave();
        openGroupStyleEditor(groupData, widgetEl, onSave);
    });

    resetSection.appendChild(resetBtn);
    content.appendChild(resetSection);

    closeAllDrawers();
    drawer.classList.add("active");
};
