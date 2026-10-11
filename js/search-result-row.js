import { renderStoredIcon, isStoredIconUrl } from "./safe-svg.js";
import { getSearchResultTypeMeta } from "./search-utils.js";
import { t } from "./i18n.js";

// Shared result-row builder for the local hero-search dropdown (web-search.js)
// and the dashboard spotlight overlay (spotlight.js), so the two never drift.
// Row anatomy (left -> right): outlined type button (icon + label), favicon,
// title + subtitle, then a right-hand aside with neutral workspace pills and the
// group the item is filed under. See agents/plans/active/search-spotlight-redesign.md.

// Leading favicon / stored icon only. The type button already declares what kind
// of element this is, so when there is no real icon we render nothing (no
// placeholder) and the caller omits the slot.
function setResultIcon(container, result) {
    if (!result.icon) return false;

    const rendered = renderStoredIcon(container, result.icon, {
        imgWidth: 16,
        imgHeight: 16,
    });
    if (!rendered) return false;

    if (result.iconColor && !isStoredIconUrl(result.icon)) {
        container.style.setProperty("--icon-override", result.iconColor);
    } else {
        container.style.removeProperty("--icon-override");
    }
    return true;
}

// Outlined "link / copy / launcher" type button. Always present, leftmost, so
// every row declares what it is.
function buildTypeButton(result) {
    const meta = getSearchResultTypeMeta(result.resultType);
    // search-utils is shared with content scripts, so its English label stays
    // as the fallback; the localized label is resolved here at the display site.
    const key = `search_type_${result.resultType}`;
    const translated = t(key);
    const typeLabel = translated === key ? meta.label : translated;

    const btn = document.createElement("span");
    btn.className = "spotlight-type-button";
    btn.dataset.type = result.resultType;
    btn.title = typeLabel;
    btn.setAttribute("aria-label", typeLabel);

    const icon = document.createElement("span");
    icon.className = "spotlight-type-button-icon";
    icon.innerHTML = meta.icon;

    const label = document.createElement("span");
    label.className = "spotlight-type-button-label";
    label.textContent = typeLabel;

    btn.append(icon, label);
    return btn;
}

// Right-hand aside: neutral workspace pills (a link can live in several
// workspaces) over the group it is filed under. `result.workspaces` (string[])
// is preferred; falls back to the single `workspaceLabel`. Returns null when
// there is nothing to show.
function buildResultAside(result) {
    const aside = document.createElement("span");
    aside.className = "spotlight-result-aside";

    const workspaces =
        Array.isArray(result.workspaces) && result.workspaces.length
            ? result.workspaces
            : result.workspaceLabel
              ? [result.workspaceLabel]
              : [];

    if (workspaces.length) {
        const pills = document.createElement("span");
        pills.className = "spotlight-pills";
        workspaces.forEach((ws) => {
            const pill = document.createElement("span");
            pill.className = "spotlight-pill";
            pill.textContent = ws;
            pill.title = ws;
            pills.appendChild(pill);
        });
        aside.appendChild(pills);
    }

    if (result.group) {
        const group = document.createElement("span");
        group.className = "spotlight-result-group";
        group.textContent = result.group;
        group.title = result.group;
        aside.appendChild(group);
    }

    return aside.childElementCount ? aside : null;
}

// Build one result row. `onActivate(result)` is wired to click. `tag` defaults
// to "button"; pass "div" when the caller nests an interactive control (e.g. the
// spotlight add-to-group button), since nested buttons are invalid HTML.
export function buildSearchResultRow(result, { onActivate, tag = "button" } = {}) {
    const row = document.createElement(tag);
    if (tag === "button") row.type = "button";
    row.className = "spotlight-result";

    row.appendChild(buildTypeButton(result));

    const iconWrap = document.createElement("span");
    iconWrap.className = "spotlight-icon";
    if (setResultIcon(iconWrap, result)) {
        row.appendChild(iconWrap);
    }

    const textCol = document.createElement("span");
    textCol.className = "spotlight-result-text";

    const nameEl = document.createElement("span");
    nameEl.className = "spotlight-result-name";
    nameEl.textContent = result.name || "";
    textCol.appendChild(nameEl);

    if (result.subtitle) {
        const subtitleEl = document.createElement("span");
        subtitleEl.className = "spotlight-result-url";
        subtitleEl.textContent = result.subtitle;
        textCol.appendChild(subtitleEl);
    }

    row.appendChild(textCol);

    const aside = buildResultAside(result);
    if (aside) row.appendChild(aside);

    if (onActivate) {
        row.addEventListener("click", () => onActivate(result));
    }

    return row;
}
