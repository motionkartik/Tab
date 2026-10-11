// Clock module — displays live time and date in the header
import { t } from "./i18n.js";
import { setLocal } from "./storage-local.js";

let clockInterval = null;
let clockOptions = { format: "24h", showSeconds: true, showDate: true };
let greetingName = "";

function greetingKeyForHour(hour) {
    if (hour < 5) return "night";
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
}

function updateGreetingText() {
    const greetingEl = document.getElementById("clock-greeting");
    if (!greetingEl) return;
    const period = greetingKeyForHour(new Date().getHours());
    const name = (greetingName || "").trim();
    greetingEl.textContent = name
        ? t(`greet_${period}_name`, [name])
        : t(`greet_${period}`);
}

/** Set the name appended to the greeting (persisted separately by callers). */
export const setGreetingName = (name) => {
    greetingName = typeof name === "string" ? name : "";
    updateGreetingText();
};

export function syncHeroVisibility() {
    const heroPanel = document.getElementById("hero-panel");
    const searchBar = document.getElementById("web-search-bar");
    const clockEl = document.getElementById("clock-display");
    const greetingEl = document.getElementById("clock-greeting");
    if (!heroPanel) return;

    const searchVisible = !!searchBar && searchBar.style.display !== "none";
    const clockVisible = !!clockEl && clockEl.style.display !== "none";
    const greetingVisible =
        !!greetingEl && greetingEl.style.display !== "none";

    heroPanel.style.display =
        searchVisible || clockVisible || greetingVisible ? "flex" : "none";
    heroPanel.classList.toggle(
        "hero-clock-only",
        (clockVisible || greetingVisible) && !searchVisible,
    );
    heroPanel.classList.toggle(
        "hero-search-only",
        searchVisible && !clockVisible && !greetingVisible,
    );
}

// Greeting visibility is controlled independently of the clock so users can
// keep the greeting while hiding the time/date (or vice versa).
export const setGreetingVisible = (show) => {
    const greetingEl = document.getElementById("clock-greeting");
    if (!greetingEl) return;

    if (show) {
        greetingEl.style.display = "";
        updateGreetingText();
    } else {
        greetingEl.style.display = "none";
    }

    syncHeroVisibility();
};

const updateClock = () => {
    const now = new Date();
    const timeEl = document.getElementById("clock-time");
    const dateEl = document.getElementById("clock-date");

    updateGreetingText();

    if (timeEl) {
        const opts = { hour: "2-digit", minute: "2-digit" };
        if (clockOptions.showSeconds) opts.second = "2-digit";
        opts.hour12 = clockOptions.format === "12h";
        timeEl.textContent = now.toLocaleTimeString([], opts);
    }

    if (dateEl) {
        if (clockOptions.showDate) {
            dateEl.style.display = "";
            dateEl.textContent = now.toLocaleDateString([], {
                weekday: "long",
                day: "numeric",
                month: "long",
            });
        } else {
            dateEl.style.display = "none";
        }
    }
};

/** Flip between 24h and 12h, persist, and keep the settings select in sync. */
export const toggleClockFormat = () => {
    const next = clockOptions.format === "12h" ? "24h" : "12h";
    clockOptions.format = next;
    try {
        setLocal({ general_clockFormat: next });
    } catch {
        /* ignore */
    }
    const select = document.getElementById("clock-format-select");
    if (select) select.value = next;
    updateClock();
};

const bindFormatToggle = () => {
    const timeEl = document.getElementById("clock-time");
    if (!timeEl || timeEl.dataset.formatToggleBound === "true") return;
    timeEl.dataset.formatToggleBound = "true";
    timeEl.title = t("clock_toggle_format_title");
    timeEl.addEventListener("click", () => toggleClockFormat());
};

export const initClock = (show, opts = {}) => {
    if (opts.format !== undefined) clockOptions.format = opts.format;
    if (opts.showSeconds !== undefined)
        clockOptions.showSeconds = opts.showSeconds;
    if (opts.showDate !== undefined) clockOptions.showDate = opts.showDate;
    if (opts.greetingName !== undefined) greetingName = opts.greetingName || "";

    const clockEl = document.getElementById("clock-display");
    if (!clockEl) return;

    bindFormatToggle();

    if (show) {
        clockEl.style.display = "";
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    } else {
        clockEl.style.display = "none";
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    }

    syncHeroVisibility();
};

export const updateClockOptions = (opts) => {
    if (opts.format !== undefined) clockOptions.format = opts.format;
    if (opts.showSeconds !== undefined)
        clockOptions.showSeconds = opts.showSeconds;
    if (opts.showDate !== undefined) clockOptions.showDate = opts.showDate;
    if (opts.greetingName !== undefined)
        greetingName = opts.greetingName || "";
    updateClock();
};
