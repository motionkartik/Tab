import { t } from "./i18n.js";
import { getSearchResults, performWebSearch } from "./search-utils.js";
import { buildSearchResultRow } from "./search-result-row.js";
import { executeActionItem } from "./action-executor.js";

function openWebSearch(query) {
    void performWebSearch(query, { newTab: window.webSearchNewTab });
}

let suggestSeq = 0;

/**
 * Google suggestions via JSONP script injection (client=firefox honors the
 * `callback` param; plain fetch is blocked by missing CORS headers, so a
 * backend-free page can only reach this endpoint as a script).
 * Resolves to an array of suggestion strings; never rejects — the endpoint
 * is unofficial, so failures/timeouts yield [].
 */
function fetchGoogleSuggestions(query) {
    return new Promise((resolve) => {
        const id = `rtSuggest${Date.now().toString(36)}${++suggestSeq}`;
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            try {
                delete window[id];
            } catch {
                window[id] = undefined;
            }
            script.remove();
            clearTimeout(timer);
            resolve(Array.isArray(value) ? value : []);
        };
        window[id] = (payload) => {
            const list = Array.isArray(payload) && Array.isArray(payload[1])
                ? payload[1]
                : [];
            done(list.filter((s) => typeof s === "string"));
        };
        const script = document.createElement("script");
        script.src =
            "https://suggestqueries.google.com/complete/search?client=firefox&q=" +
            encodeURIComponent(query) +
            "&callback=" +
            id;
        script.onerror = () => done([]);
        document.head.appendChild(script);
        const timer = setTimeout(() => done([]), 2500);
    });
}

export function initWebSearchBar() {
    const webSearchBar = document.getElementById("web-search-bar");
    const webSearchInput = document.getElementById("web-search-input");
    const dropdownEl = document.getElementById("web-search-dropdown");

    if (!webSearchBar || !webSearchInput || !dropdownEl) return;

    let focusedIndex = -1;
    let renderRequestId = 0;
    let suggestDebounceTimer = 0;

    const getInteractiveRows = () => [
        ...dropdownEl.querySelectorAll(
            ".web-search-dropdown .spotlight-result, .web-search-dropdown .spotlight-result-suggestion, .web-search-dropdown .spotlight-result-web",
        ),
    ];

    const hideDropdown = () => {
        renderRequestId += 1;
        clearTimeout(suggestDebounceTimer);
        dropdownEl.hidden = true;
        dropdownEl.replaceChildren();
        focusedIndex = -1;
        webSearchInput.setAttribute("aria-expanded", "false");
    };

    const updateFocus = ({ scroll = true } = {}) => {
        const rows = getInteractiveRows();
        rows.forEach((row, index) => {
            row.classList.toggle("focused", index === focusedIndex);
        });
        // The initial focus sits on the web row at the bottom; scrolling it
        // into view would drag the dropdown down on every keystroke, so the
        // render path opts out and only keyboard navigation scrolls.
        if (scroll && rows[focusedIndex]) {
            rows[focusedIndex].scrollIntoView({ block: "nearest" });
        }
    };

    const renderDropdown = async () => {
        const query = webSearchInput.value.trim();
        const requestId = ++renderRequestId;
        dropdownEl.replaceChildren();
        focusedIndex = -1;

        const scrollArea = document.createElement("div");
        scrollArea.className = "web-search-dropdown-scroll";

        if (!query) {
            hideDropdown();
            return;
        }

        // Keep local matches compact so Google suggestions remain visible in
        // the dropdown without scrolling past a long list of saved items.
        const { results } = await getSearchResults(query, { limit: 5 });
        if (
            requestId !== renderRequestId ||
            webSearchInput.value.trim() !== query
        ) {
            return;
        }

        if (results.length > 0) {
            const resultsHeader = document.createElement("div");
            resultsHeader.className = "search-results-section-label";
            resultsHeader.textContent = t("ws34_results_header");
            scrollArea.appendChild(resultsHeader);
        }

        results.forEach((result) => {
            const row = buildSearchResultRow(result, {
                onActivate: (r) => {
                    if (executeActionItem(r)) hideDropdown();
                },
            });
            scrollArea.appendChild(row);
        });

        if (results.length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "spotlight-no-results";
            emptyEl.textContent = t("ws34_no_matches", [query]);
            scrollArea.appendChild(emptyEl);
        }

        // Google suggestions slot: filled in below local results once the
        // debounced JSONP request resolves (inserted before the web row).
        const suggestSlot = document.createElement("div");
        suggestSlot.className = "web-search-suggest-slot";
        scrollArea.appendChild(suggestSlot);

        // Web search renders LAST, below the user's own results, but carries
        // the initial focus: Enter always web-searches and the focus ring
        // shows that. CWS policy wants the user's items first; predictability
        // wants a constant Enter. See agents/plans/active/cws-search-policy-plan.md §4a.
        const webRow = document.createElement("button");
        webRow.type = "button";
        webRow.className = "spotlight-result-web";

        const webIcon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        webIcon.setAttribute("viewBox", "0 0 512 512");
        webIcon.innerHTML =
            '<path d="M352 256c0 22.2-1.2 43.6-3.3 64H163.3c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64H348.7c2.2 20.4 3.3 41.8 3.3 64zm28.8-64H503.9c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64H380.8c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32H376.7c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0H167.7c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.5 26 20.9 58.2 27 94.7zm-209 0H18.6C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192H131.2c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64H8.1C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.5-26-20.9-58.2-27-94.6H344.3c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352H135.3zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6H493.4z"></path>';

        const label = document.createElement("span");
        label.textContent = t("ws34_search_web_for", [query]);

        webRow.append(webIcon, label);
        webRow.addEventListener("click", () => {
            openWebSearch(query);
            hideDropdown();
        });
        scrollArea.appendChild(webRow);

        dropdownEl.appendChild(scrollArea);
        dropdownEl.hidden = false;
        webSearchInput.setAttribute("aria-expanded", "true");
        focusedIndex = getInteractiveRows().length - 1;
        updateFocus({ scroll: false });

        // Debounced Google suggestions (JSONP, no backend). Local results
        // above already painted; suggestions merge in when they arrive.
        clearTimeout(suggestDebounceTimer);
        suggestDebounceTimer = setTimeout(() => {
            void appendSuggestions(query, requestId, suggestSlot, webRow, results);
        }, 220);
    };

    const appendSuggestions = async (
        query,
        requestId,
        suggestSlot,
        webRow,
        localResults,
    ) => {
        const suggestions = await fetchGoogleSuggestions(query);
        if (
            requestId !== renderRequestId ||
            webSearchInput.value.trim() !== query ||
            !suggestSlot.isConnected
        ) {
            return;
        }
        const seen = new Set([query.toLowerCase()]);
        (localResults || []).forEach((r) => {
            if (r?.name) seen.add(String(r.name).toLowerCase());
            if (r?.url) seen.add(String(r.url).toLowerCase());
        });
        const fresh = suggestions
            .map((s) => String(s).trim())
            .filter((s) => s && !seen.has(s.toLowerCase()));
        const unique = [...new Set(fresh)].slice(0, 5);
        unique.forEach((text) => {
            seen.add(text.toLowerCase());
            const row = document.createElement("button");
            row.type = "button";
            row.className = "spotlight-result-suggestion";
            const icon = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "svg",
            );
            icon.setAttribute("viewBox", "0 0 512 512");
            icon.innerHTML =
                '<path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>';
            const label = document.createElement("span");
            label.textContent = text;
            row.append(icon, label);
            row.addEventListener("click", () => {
                openWebSearch(text);
                hideDropdown();
            });
            // Insert before the web row to keep order: local → suggestions → web.
            webRow.before(row);
            // The web row held the initial focus; it shifted down by one.
            focusedIndex += 1;
        });
        if (unique.length > 0) updateFocus({ scroll: false });
    };

    webSearchInput.addEventListener("input", () => {
        void renderDropdown();
    });
    webSearchInput.addEventListener("focus", () => {
        void renderDropdown();
    });
    webSearchInput.addEventListener("blur", () => {
        setTimeout(() => {
            if (!webSearchBar.contains(document.activeElement)) {
                hideDropdown();
            }
        }, 0);
    });
    webSearchInput.addEventListener("keydown", (event) => {
        const query = webSearchInput.value.trim();
        if (!query && event.key !== "Escape") return;

        const rows = getInteractiveRows();

        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (rows.length === 0) return;
            focusedIndex = (focusedIndex + 1) % rows.length;
            updateFocus();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (rows.length === 0) return;
            focusedIndex = (focusedIndex - 1 + rows.length) % rows.length;
            updateFocus();
            return;
        }

        if (event.key === "Escape") {
            hideDropdown();
            return;
        }

        if (event.key !== "Enter") return;

        event.preventDefault();
        if (focusedIndex >= 0 && rows[focusedIndex]) {
            rows[focusedIndex].click();
            return;
        }

        openWebSearch(query);
        hideDropdown();
    });

    dropdownEl.addEventListener("mousedown", (event) => {
        event.preventDefault();
    });

    document.addEventListener("mousedown", (event) => {
        if (!webSearchBar.contains(event.target)) {
            hideDropdown();
        }
    });
}
