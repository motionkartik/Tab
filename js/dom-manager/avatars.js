// avatars.js — 10 built-in flat SVG avatars for the Profile element. A diverse,
// featureless "portrait chip" style: each is a colored disc + shoulders + head
// (varied skin tone) + hair/accessory. Diversity is conveyed by skin tone, hair
// and accessories rather than facial features (cleaner, avoids crude faces).

const av = (bg, parts) =>
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="${bg}"/>${parts}</svg>`;

// shoulders shape (clothing colour)
const sh = (c) => `<path d="M16 96a34 34 0 0 1 68 0z" fill="${c}"/>`;
// head ellipse (skin tone)
const head = (skin) => `<ellipse cx="50" cy="45" rx="19" ry="21" fill="${skin}"/>`;

export const PRESET_AVATARS = {
    // 1 — light skin, short brown hair
    a1: av(
        "#dbe6f3",
        sh("#5b6e8c") +
            head("#f1c79e") +
            `<path d="M31 44c-2-17 9-25 19-25s21 8 19 25c-3-9-8-13-19-13s-16 4-19 13z" fill="#5b3a21"/>`,
    ),
    // 2 — light skin, long blonde hair
    a2: av(
        "#f7e6ef",
        `<path d="M27 44c0-30 46-30 46 0v34c0 6-9 6-9-2V46c0-18-28-18-28 0v30c0 8-9 8-9 2z" fill="#e7b85c"/>` +
            sh("#caa1c4") +
            head("#f3cda6") +
            `<path d="M31 44c-2-17 9-26 19-26s21 9 19 26c-3-9-8-13-19-13s-16 4-19 13z" fill="#e7b85c"/>`,
    ),
    // 3 — tan skin, black straight bob (asian woman)
    a3: av(
        "#fbe7d6",
        `<path d="M28 46c0-26 44-26 44 0v22c0 5-7 5-7-1V46c0-16-30-16-30 0v21c0 6-7 6-7 1z" fill="#211a17"/>` +
            sh("#c2622f") +
            head("#f0c79a") +
            `<path d="M30 42c0-18 40-18 40 0 0 3-2 5-4 3-3-7-9-9-16-9s-13 2-16 9c-2 2-4 0-4-3z" fill="#211a17"/>`,
    ),
    // 4 — tan skin, short black hair (asian man)
    a4: av(
        "#e6f0e8",
        sh("#3f7d54") +
            head("#eec392") +
            `<path d="M31 43c-1-16 9-24 19-24s20 8 19 24c-3-8-8-12-19-12s-16 4-19 12z" fill="#1c1714"/>`,
    ),
    // 5 — dark skin, short black hair
    a5: av(
        "#eae3f5",
        sh("#6a4d9c") +
            head("#8a5a34") +
            `<path d="M31 44c-2-16 9-24 19-24s21 8 19 24c-3-8-8-12-19-12s-15 4-19 12z" fill="#1a1410"/>`,
    ),
    // 6 — brown skin, afro/curly (woman)
    a6: av(
        "#fde7d9",
        `<circle cx="50" cy="38" r="26" fill="#2a1d15"/>` +
            sh("#d2683c") +
            head("#9b6239") +
            `<path d="M31 42c-1-15 9-22 19-22s20 7 19 22c-3-7-8-11-19-11s-16 4-19 11z" fill="#2a1d15"/>`,
    ),
    // 7 — light skin, gray hair + glasses (old man)
    a7: av(
        "#e9edf2",
        sh("#7d8794") +
            head("#f0c8a3") +
            `<path d="M32 43c-1-15 8-22 18-22s19 7 18 22c-3-7-7-11-18-11s-15 4-18 11z" fill="#b9bcc0"/>` +
            `<g fill="none" stroke="#3a3f47" stroke-width="2"><circle cx="42" cy="46" r="5"/><circle cx="58" cy="46" r="5"/><path d="M47 46h6M37 45l-4-1M63 45l4-1"/></g>`,
    ),
    // 8 — light skin, gray bun (old woman)
    a8: av(
        "#f3ece2",
        `<circle cx="50" cy="20" r="8" fill="#c3c6cb"/>` +
            sh("#b79b86") +
            head("#f1cca8") +
            `<path d="M31 44c-2-16 9-24 19-24s21 8 19 24c-3-8-8-12-19-12s-16 4-19 12z" fill="#c3c6cb"/>`,
    ),
    // 9 — medium skin, kid (bigger head, small tuft)
    a9: av(
        "#fff0d6",
        `<path d="M24 98a26 26 0 0 1 52 0z" fill="#e8a93b"/>` +
            `<ellipse cx="50" cy="46" rx="22" ry="23" fill="#eec59a"/>` +
            `<path d="M33 40c2-13 32-13 34 0-4-6-9-8-17-8s-13 2-17 8z" fill="#7a4a22"/>` +
            `<path d="M48 22c1-4 6-4 6 1 0 3-3 4-3 7-3-2-4-5-3-8z" fill="#7a4a22"/>`,
    ),
    // 10 — medium skin, bald + beard
    a10: av(
        "#e3eef0",
        sh("#3c7f86") +
            head("#d9a066") +
            `<path d="M31 46c0 12 8 20 19 20s19-8 19-20c-2 6-8 9-19 9s-17-3-19-9z" fill="#2c211a"/>` +
            `<path d="M33 40c3-8 31-8 34 0-4-5-10-7-17-7s-13 2-17 7z" fill="#d9a066"/>`,
    ),
};

export const PRESET_AVATAR_IDS = Object.keys(PRESET_AVATARS);

export const isPresetAvatar = (v) =>
    typeof v === "string" &&
    v.startsWith("preset:") &&
    PRESET_AVATAR_IDS.includes(v.slice(7));

export const getPresetAvatarSvg = (v) => PRESET_AVATARS[v.slice(7)] || "";
