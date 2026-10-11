import { t } from "../i18n.js";
// Curated box-shadow "elevation" presets for the theme editor.
//
// These are applied as plain overrides when chosen. The editor also offers a
// "Theme default" choice (handled in buildShadowControl) that clears the
// override so the var falls back to the active theme's own — often multi-layer,
// hand-tuned — shadow. Presets are therefore opt-in and never clobber a theme's
// crafted depth unless the user picks one.
export const SHADOW_PRESETS = [
    { label: t("shadow_none"), value: "none" },
    {
        // Tight, low-spread, paper-on-desk.
        label: t("shadow_subtle"),
        value: "0 1px 2px rgba(0, 0, 0, 0.07), 0 1px 1px rgba(0, 0, 0, 0.06)",
    },
    { label: t("shadow_medium"), value: "0 4px 12px rgba(0, 0, 0, 0.12)" },
    { label: t("shadow_strong"), value: "0 14px 32px -8px rgba(0, 0, 0, 0.28)" },
    {
        label: t("shadow_glow"),
        value: "0 0 0 1px rgba(255, 255, 255, 0.05), 0 10px 30px -6px rgba(80, 140, 255, 0.3)",
    },
];
