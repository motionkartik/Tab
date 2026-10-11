import { getLocal, setLocal } from "../storage-local.js";
import { linkTargetSelect } from "../variables.js";
import { t } from "../i18n.js";

import {
    initClock,
    syncHeroVisibility,
    updateClockOptions,
    setGreetingVisible,
    setGreetingName,
} from "../clock.js";
import { openSpotlight } from "../spotlight.js";
import { initWebSearchBar } from "../web-search.js";

export const initSettingsGeneralHandlers = () => {
    if (linkTargetSelect) {
        linkTargetSelect.addEventListener(
            "change",
            function onLinkTargetChange() {
                const value = this.value;
                setLocal({ general_linkTarget: value });
            },
        );
    }

    const clockToggle = document.getElementById("clock-toggle");
    if (clockToggle) {
        clockToggle.addEventListener("change", function onClockToggleChange() {
            const show = this.checked;
            const format =
                document.getElementById("clock-format-select")?.value || "24h";
            const showSeconds =
                document.getElementById("clock-seconds-toggle")?.checked !==
                false;
            const showDate =
                document.getElementById("clock-date-toggle")?.checked !== false;
            initClock(show, { format, showSeconds, showDate });
            setLocal({ general_clockShow: show });
        });
    }

    const greetingToggle = document.getElementById("greeting-toggle");
    if (greetingToggle) {
        greetingToggle.addEventListener(
            "change",
            function onGreetingToggleChange() {
                setGreetingVisible(this.checked);
                setLocal({ general_greetingShow: this.checked });
            },
        );
    }

    const greetingNameInput = document.getElementById("greeting-name-input");
    if (greetingNameInput) {
        greetingNameInput.addEventListener(
            "change",
            function onGreetingNameChange() {
                const name = this.value.trim().slice(0, 40);
                this.value = name;
                setGreetingName(name);
                setLocal({ general_greetingName: name });
            },
        );
    }

    const clockFormatSelect = document.getElementById("clock-format-select");
    if (clockFormatSelect) {
        clockFormatSelect.addEventListener(
            "change",
            function onClockFormatChange() {
                updateClockOptions({ format: this.value });
                setLocal({ general_clockFormat: this.value });
            },
        );
    }

    const clockSecondsToggle = document.getElementById("clock-seconds-toggle");
    if (clockSecondsToggle) {
        clockSecondsToggle.addEventListener(
            "change",
            function onClockSecondsChange() {
                updateClockOptions({ showSeconds: this.checked });
                setLocal({ general_clockSeconds: this.checked });
            },
        );
    }

    const clockDateToggle = document.getElementById("clock-date-toggle");
    if (clockDateToggle) {
        clockDateToggle.addEventListener(
            "change",
            function onClockDateChange() {
                updateClockOptions({ showDate: this.checked });
                setLocal({ general_clockDate: this.checked });
            },
        );
    }

    const todoBadgeToggle = document.getElementById("todo-badge-toggle");
    if (todoBadgeToggle) {
        getLocal(["general_todoBadge"], (result) => {
            todoBadgeToggle.checked = result.general_todoBadge !== false;
        });
        todoBadgeToggle.addEventListener("change", function () {
            // The badge itself listens for this key via storage.onChanged.
            setLocal({ general_todoBadge: this.checked });
        });
    }

    // Task reminder notifications — master switch, backed by the Web
    // Notifications API. Turning it on requests permission (must run inside
    // this user-gesture change handler). Turning it off keeps existing
    // reminders — they just stop firing.
    const todoNotifToggle = document.getElementById("todo-notifications-toggle");
    const todoNotifHint = document.getElementById("todo-notifications-hint");
    if (todoNotifToggle) {
        const permissionGranted = () =>
            typeof Notification !== "undefined" &&
            Notification.permission === "granted";
        const paintNotifState = async () => {
            const { general_todoNotifications } =
                await getLocal("general_todoNotifications");
            const wantOn = general_todoNotifications !== false;
            const granted = permissionGranted();
            todoNotifToggle.checked = wantOn && granted;
            if (todoNotifHint) {
                const blocked = wantOn && !granted;
                todoNotifHint.hidden = !blocked;
                if (blocked)
                    todoNotifHint.textContent = t("setg_tasks_notif_blocked");
            }
        };
        void paintNotifState();
        todoNotifToggle.addEventListener("change", async function () {
            if (this.checked) {
                let granted = permissionGranted();
                if (!granted && typeof Notification !== "undefined") {
                    try {
                        granted =
                            (await Notification.requestPermission()) ===
                            "granted";
                    } catch {
                        granted = false;
                    }
                }
                await setLocal({
                    general_todoNotifications: granted,
                });
            } else {
                await setLocal({
                    general_todoNotifications: false,
                });
            }
            await paintNotifState();
        });
    }

    const webSearchToggle = document.getElementById("web-search-toggle");
    const webSearchEngineSelect = document.getElementById("web-search-engine");
    const webSearchInput = document.getElementById("web-search-input");
    const webSearchBar = document.getElementById("web-search-bar");

    if (webSearchToggle) {
        webSearchToggle.addEventListener(
            "change",
            function onWebSearchToggleChange() {
                const enabled = this.checked;
                if (webSearchBar)
                    webSearchBar.style.display = enabled ? "" : "none";
                syncHeroVisibility();
                if (enabled && webSearchInput)
                    setTimeout(() => webSearchInput.focus(), 50);
                setLocal({ general_webSearchEnabled: enabled });
                // Let the Notes button reposition (next to the search bar when
                // enabled, top-right otherwise) without a reload.
                window.dispatchEvent(
                    new CustomEvent("rt:web-search-toggled", {
                        detail: { enabled },
                    }),
                );
            },
        );
    }

    if (webSearchEngineSelect) {
        webSearchEngineSelect.addEventListener(
            "change",
            function onWebSearchEngineChange() {
                window.webSearchEngine = this.value;
                setLocal({
                    general_webSearchEngine: this.value,
                });
            },
        );
    }

    const webSearchNewTabToggle = document.getElementById(
        "web-search-new-tab-toggle",
    );
    if (webSearchNewTabToggle) {
        webSearchNewTabToggle.addEventListener(
            "change",
            function onWebSearchNewTabChange() {
                window.webSearchNewTab = this.checked;
                setLocal({
                    general_webSearchNewTab: this.checked,
                });
            },
        );
    }

    initWebSearchBar();

    const spotlightHintBtn = document.getElementById("spotlight-hint-btn");
    if (spotlightHintBtn) {
        spotlightHintBtn.addEventListener("click", () => openSpotlight());
    }

    const spotlightGroupNameToggle = document.getElementById(
        "spotlight-group-name-toggle",
    );
    if (spotlightGroupNameToggle) {
        spotlightGroupNameToggle.addEventListener(
            "change",
            function onSpotlightGroupNameToggleChange() {
                setLocal({
                    general_spotlightGroupName: this.checked,
                });
            },
        );
    }

    const spotlightShortcutsToggle = document.getElementById(
        "spotlight-shortcuts-toggle",
    );
    if (spotlightShortcutsToggle) {
        spotlightShortcutsToggle.addEventListener(
            "change",
            function onSpotlightShortcutsToggleChange() {
                setLocal({
                    general_spotlightShortcuts: this.checked,
                });
            },
        );
    }

    const spotlightThemeSelect = document.getElementById(
        "spotlight-theme-select",
    );
    if (spotlightThemeSelect) {
        spotlightThemeSelect.addEventListener(
            "change",
            function onSpotlightThemeChange() {
                setLocal({
                    general_spotlightTheme:
                        this.value === "light" ? "light" : "dark",
                });
            },
        );
    }

    const autoGrowGroupsToggle = document.getElementById(
        "auto-grow-groups-toggle",
    );
    if (autoGrowGroupsToggle) {
        autoGrowGroupsToggle.addEventListener(
            "change",
            function onAutoGrowGroupsOnItemAddChange() {
                window.autoGrowGroupsOnItemAdd = this.checked;
                setLocal({
                    general_autoGrowGroupsOnItemAdd: this.checked,
                });
            },
        );
    }

};

