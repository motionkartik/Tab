import {
    alreadyInUseIconsAddLink,
    choosenIconAddLink,
    svgInput,
} from "./variables.js";
import { createSafeSvgElement } from "./safe-svg.js";
import { t } from "./i18n.js";

// Utility functions

/**
 * Update icons in the icon selector
 */
export const updateIcons = () => {
    const allLinkSvg = [...document.querySelectorAll(".link-container svg")];
    const uniqueSvgMarkup = [];
    allLinkSvg.forEach((svg) => {
        if (uniqueSvgMarkup.indexOf(svg.outerHTML) === -1) {
            uniqueSvgMarkup.push(svg.outerHTML);
        }
    });

    if (choosenIconAddLink)
        choosenIconAddLink.textContent = t("u33_no_icon_chosen");
    if (alreadyInUseIconsAddLink) {
        alreadyInUseIconsAddLink.replaceChildren();

        uniqueSvgMarkup.forEach((markup) => {
            const safeSvg = createSafeSvgElement(markup);
            if (!safeSvg) return;
            safeSvg.addEventListener("click", () => {
                svgInput.value = markup;
                if (choosenIconAddLink) {
                    const chosenSvg = createSafeSvgElement(markup);
                    choosenIconAddLink.replaceChildren();
                    if (chosenSvg) choosenIconAddLink.appendChild(chosenSvg);
                }
            });
            alreadyInUseIconsAddLink.appendChild(safeSvg);
        });
    }
};
