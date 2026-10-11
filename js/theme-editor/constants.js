export const STORAGE_KEY = "saved_themes";
export const LEGACY_SAVED_THEMES_STORAGE_KEY = "pro_saved_themes"; // Older saved-themes key, still read during migration
export const LEGACY_ACTIVE_SAVED_THEME_ID_KEY = "pro_active_theme_id"; // Older global active-saved-theme key, still read during migration

// Body classes per theme (mirrors event-handlers applyTheme)
export const THEME_CLASSES = {
    simple: [],
    light: ["ui-light"],
    dark: ["ui-dark"],
    midnight: ["ui-midnight"],
    luxury: ["ui-luxury"],
    nordic: ["ui-nordic"],
    ocean: ["ui-ocean"],
    "aurora-glass": ["ui-aurora-glass"],
    frost: ["ui-frost"],
    sakura: ["ui-sakura"],
    professional: ["ui-professional"],
    "pastel-sunset": ["ui-pastel-sunset"],
    "lavender-sky": ["ui-lavender-sky"],
};

export const ALL_THEME_CLASSES = [
    "dark-mode", // legacy: no longer applied; kept so stale classes get stripped on theme switch
    "ui-dark",
    "ui-light",
    "ui-midnight",
    "ui-luxury",
    "ui-nordic",
    "ui-ocean",
    "ui-aurora-glass",
    "ui-frost",
    "ui-sakura",
    "ui-professional",
    "ui-pastel-sunset",
    "ui-lavender-sky",
];

// Default background gradients per theme (shared with layout theme handling)
export const THEME_BG_DEFAULTS = {
    simple: "radial-gradient(1000px 580px at 50% -10%, #f6f1e8 0%, rgba(246,241,232,0) 60%), linear-gradient(180deg, #e9e2d4 0%, #ded5c4 100%)",
    light: "linear-gradient(135deg, #eff1f5, #c8d0de)",
    dark: "radial-gradient(1100px 660px at 50% -7%, rgba(245, 165, 36, 0.18) 0%, rgba(245, 165, 36, 0) 55%), linear-gradient(rgb(21, 18, 12) 0%, rgb(14, 11, 7) 100%)",
    midnight:
        "radial-gradient(1100px 660px at 50% -12%, rgba(82,142,255,0.22) 0%, rgba(79,140,255,0) 55%), linear-gradient(180deg, #0b1322 0%, #070a14 100%)",
    luxury: "radial-gradient(1000px 440px at 50% -14%, rgba(250,232,184,0.52) 0%, rgba(250,232,184,0) 62%), radial-gradient(1200px 600px at 50% -10%, rgba(216,178,112,0.17) 0%, rgba(216,178,112,0) 56%), radial-gradient(1200px 760px at 50% 124%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 55%), radial-gradient(840px 600px at 86% 8%, rgba(196,154,92,0.12) 0%, rgba(196,154,92,0) 55%), linear-gradient(180deg,#1d1914 0%,#15110a 52%,#0d0a06 100%)",
    nordic: "radial-gradient(900px 480px at 50% -8%, #f7f6ec 0%, rgba(247,246,236,0) 56%), radial-gradient(1300px 820px at 50% 118%, rgba(116,126,96,0.20) 0%, rgba(116,126,96,0) 52%), radial-gradient(700px 700px at 88% 8%, rgba(192,105,74,0.07) 0%, rgba(192,105,74,0) 55%), linear-gradient(180deg, #e8e6d6 0%, #dcdbc4 52%, #d0cfb4 100%)",
    ocean: "radial-gradient(1200px 520px at 50% -10%, rgba(200,244,248,0.24) 0%, rgba(200,244,248,0) 55%), radial-gradient(1200px 760px at 50% 124%, rgba(8,36,46,0.35) 0%, rgba(8,36,46,0) 55%), radial-gradient(820px 620px at 86% 10%, rgba(47,212,198,0.12) 0%, rgba(47,212,198,0) 55%), linear-gradient(180deg, #175163 0%, #124351 50%, #0d3343 100%)",
    "aurora-glass":
        "radial-gradient(1000px 560px at 12% -8%, rgba(45,212,191,0.34) 0%, rgba(45,212,191,0) 55%), radial-gradient(920px 540px at 88% 2%, rgba(167,139,250,0.34) 0%, rgba(167,139,250,0) 54%), radial-gradient(840px 640px at 60% 122%, rgba(56,189,248,0.30) 0%, rgba(56,189,248,0) 60%), linear-gradient(160deg, #0a1633 0%, #14245f 48%, #1e3a8a 100%)",
    frost: "radial-gradient(1100px 560px at 12% -5%, rgba(255,255,255,0.20), transparent 55%), radial-gradient(900px 520px at 92% 6%, rgba(129,140,248,0.30), transparent 52%), linear-gradient(155deg, #1e3a8a 0%, #2563eb 46%, #3b82f6 76%, #5b9bf5 100%)",
    sakura: "radial-gradient(1000px 520px at 50% -8%, #fff3f7 0%, rgba(255,243,247,0) 56%), radial-gradient(1200px 760px at 50% 122%, rgba(214,110,150,0.28) 0%, rgba(214,110,150,0) 56%), radial-gradient(820px 620px at 85% 8%, rgba(245,170,190,0.30) 0%, rgba(245,170,190,0) 55%), linear-gradient(180deg, #fde2ec 0%, #f9d0de 52%, #f2bdd0 100%)",
    professional:
        "__css__:radial-gradient(1100px 600px at 50% -8%, rgb(230, 232, 237) 0%, rgba(230, 232, 237, 0) 58%) fixed, radial-gradient(1250px 720px at 50% 128%, rgba(34, 40, 52, 0.12) 0%, rgba(34, 40, 52, 0) 56%), linear-gradient(170deg, rgb(206, 210, 218) 0%, rgb(189, 194, 204) 56%, rgb(177, 182, 194) 100%)",
    "pastel-sunset":
        "radial-gradient(1000px 520px at 50% -8%, #fff1ec 0%, rgba(255,241,236,0) 56%), radial-gradient(1150px 760px at 88% 120%, rgba(246,172,118,0.32) 0%, rgba(246,172,118,0) 56%), radial-gradient(940px 660px at 10% 10%, rgba(244,148,176,0.30) 0%, rgba(244,148,176,0) 55%), linear-gradient(140deg, #fcd8e1 0%, #fcdccf 46%, #fce6c4 100%)",
    "lavender-sky":
        "radial-gradient(1000px 520px at 50% -8%, #f6f1ff 0%, rgba(246,241,255,0) 56%), radial-gradient(1150px 780px at 88% 122%, rgba(98,132,232,0.42) 0%, rgba(98,132,232,0) 56%), radial-gradient(980px 680px at 8% 8%, rgba(168,134,232,0.36) 0%, rgba(168,134,232,0) 55%), radial-gradient(1300px 720px at 50% 132%, rgba(64,74,148,0.22) 0%, rgba(64,74,148,0) 55%), linear-gradient(140deg, #e6dcfb 0%, #dcd8f8 46%, #cbd8f5 100%)",
};

export const THEME_LABELS = {
    light: "Default Light",
    dark: "Default Dark",
    midnight: "Midnight",
    luxury: "Luxury",
    nordic: "Nordic",
    ocean: "Ocean",
    "aurora-glass": "Aurora Glass",
    frost: "Frost",
    sakura: "Sakura",
    professional: "Professional",
    "pastel-sunset": "Pastel Sunset",
    "lavender-sky": "Lavender Sky",
};

// Per-theme default CSS variable values.
// AUTO-GENERATED from public/css/variables.css (self-contained theme blocks).
// Do not edit by hand: run `npm run gen:theme-constants` after changing variables.css.
export { THEME_DEFAULTS } from "./theme-defaults.generated.js";
