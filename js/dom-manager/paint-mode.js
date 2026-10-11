import { t } from "../i18n.js";

let paintMode = null;

const showPaintPill = (type) => {
    let pill = document.getElementById('paint-mode-pill');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'paint-mode-pill';
        pill.className = 'paint-mode-pill';
        document.body.appendChild(pill);
    }
    pill.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'paint-mode-pill-icon';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M339.3 367.1c27.3-3.9 51.9-19.4 67.2-42.9L568.2 74.1c12.6-19.5 9.4-45.3-7.6-61.2S516.7.5 499.1 9.2L200.9 215.3c-20.8 12.8-33.4 35.9-33.4 60.7V360c0-1.3-.1-2.6-.1-3.9 0 0 0 0 0 0L120 360.2c-17.7 0-32 14.3-32 32l0 .2 0 72.2c0 17.7 14.3 32 32 32s32-14.3 32-32l0-72.1c.1-17.7 14.3-32 31.9-32c.1 0 .2 0 .3 0l166.7-.3c2.5 0 4.9.1 7.4.2zM512 384c0 35.3-28.7 64-64 64c-17.7 0-32 14.3-32 32s14.3 32 32 32c70.7 0 128-57.3 128-128c0-17.7-14.3-32-32-32s-32 14.3-32 32z"/></svg>';
    const label = document.createElement('span');
    label.className = 'paint-mode-pill-label';
    label.textContent = type === 'group' ? t("pm7_pill_group") : t("pm7_pill_link");
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'paint-mode-pill-cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = t("pm7_cancel_title");
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deactivatePaintMode();
    });
    pill.append(icon, label, cancelBtn);
    pill.style.display = 'flex';
};

const hidePaintPill = () => {
    const pill = document.getElementById('paint-mode-pill');
    if (pill) pill.style.display = 'none';
};

export const activatePaintMode = (type, style) => {
    paintMode = { type, style };
    showPaintPill(type);
};

export const deactivatePaintMode = () => {
    paintMode = null;
    hidePaintPill();
};

export const getPaintMode = () => paintMode;
