import { getActiveNamedThemeId, getSavedNamedThemes } from "./state.js";
import { t } from "../i18n.js";

export function renderSavedThemesStrip({
    onApplyNamedTheme,
    onDeleteNamedTheme,
    onDeactivateSavedTheme,
} = {}) {
    const strip = document.getElementById("theme-editor-saved-strip");
    if (!strip) return;

    strip.innerHTML = "";

    const savedThemes = getSavedNamedThemes();
    const activeNamedThemeId = getActiveNamedThemeId();

    const deactivateBtn = document.createElement("button");
    deactivateBtn.type = "button";
    deactivateBtn.className = "settings-btn theme-editor-saved-deactivate";
    deactivateBtn.textContent = t("ss32_deactivate_btn");
    deactivateBtn.title = activeNamedThemeId
        ? t("ss32_deactivate_title_active")
        : t("ss32_deactivate_title_none");
    deactivateBtn.disabled = !activeNamedThemeId;
    deactivateBtn.addEventListener("click", () => {
        if (!activeNamedThemeId) return;
        onDeactivateSavedTheme?.();
    });
    strip.appendChild(deactivateBtn);

    if (savedThemes.length === 0) {
        const empty = document.createElement("span");
        empty.className = "theme-editor-saved-empty";
        empty.textContent = t("ss32_empty");
        strip.appendChild(empty);
        return;
    }

    savedThemes.forEach((theme) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `theme-editor-saved-chip${theme.id === activeNamedThemeId ? " active" : ""}`;
        btn.title = t("ss32_apply_title", [theme.name, theme.baseTheme]);

        const nameSpan = document.createElement("span");
        nameSpan.className = "theme-editor-chip-name";
        nameSpan.textContent = theme.name;

        const delSpan = document.createElement("span");
        delSpan.className = "theme-editor-chip-delete";
        delSpan.textContent = "×";
        delSpan.title = t("ss32_delete_title");

        btn.append(nameSpan, delSpan);
        btn.addEventListener("click", (e) => {
            if (e.target === delSpan) {
                onDeleteNamedTheme?.(theme.id);
            } else {
                onApplyNamedTheme?.(theme.id);
            }
        });
        strip.appendChild(btn);
    });
}
