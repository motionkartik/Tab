import { isRemoteImageUrl, letterAvatarElement, remoteFaviconsAllowed } from "./favicon.js";

const DISALLOWED_SVG_SELECTOR =
    "script, foreignObject, iframe, object, embed, image, use, audio, video, canvas, style";

function extractLegacyImageSrc(iconValue) {
    if (typeof iconValue !== "string") return "";

    const trimmed = iconValue.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith("&lt;img") && !lower.startsWith("<img")) {
        return "";
    }

    const decoded = trimmed.includes("&lt;")
        ? trimmed
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/&quot;/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/&amp;/gi, "&")
        : trimmed;

    const parsed = new DOMParser().parseFromString(decoded, "text/html");
    const img = parsed.querySelector("img");
    return img?.getAttribute("src")?.trim() || "";
}

export function normalizeStoredIconValue(iconValue) {
    if (typeof iconValue !== "string") return "";

    const trimmed = iconValue.trim();
    if (!trimmed) return "";

    const legacyImgSrc = extractLegacyImageSrc(trimmed);
    if (legacyImgSrc) return legacyImgSrc;

    return trimmed;
}

export function isStoredIconUrl(iconValue) {
    const normalized = normalizeStoredIconValue(iconValue);
    return (
        typeof normalized === "string" &&
        !!normalized &&
        (normalized.startsWith("http://") ||
            normalized.startsWith("https://") ||
            normalized.startsWith("data:image/") ||
            normalized.startsWith("blob:"))
    );
}

export function createSafeSvgElement(svgMarkup) {
    if (typeof svgMarkup !== "string") return null;

    const trimmed = svgMarkup.trim();
    if (!trimmed.startsWith("<svg")) return null;

    let parsed = new DOMParser().parseFromString(trimmed, "image/svg+xml");
    if (parsed.querySelector("parsererror")) return null;

    let root = parsed.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;

    // Markup without xmlns is still well-formed XML, but parses into a
    // namespace-less generic Element: it has no `.style`, so downstream
    // `svg.style.*` writes throw and abort the whole board render — and it
    // wouldn't paint as an image anyway. Re-parse with the namespace
    // injected so pasted/imported icons missing xmlns stay usable.
    const SVG_NS = "http://www.w3.org/2000/svg";
    if (root.namespaceURI !== SVG_NS) {
        parsed = new DOMParser().parseFromString(
            trimmed.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`),
            "image/svg+xml",
        );
        if (parsed.querySelector("parsererror")) return null;
        root = parsed.documentElement;
        if (
            !root ||
            root.namespaceURI !== SVG_NS ||
            root.tagName.toLowerCase() !== "svg"
        )
            return null;
    }

    root.querySelectorAll(DISALLOWED_SVG_SELECTOR).forEach((el) => el.remove());

    // Include the root <svg> itself: querySelectorAll("*") matches only
    // descendants, so an on*/javascript: attribute on the root element (e.g.
    // `<svg onload=...>`) would otherwise slip through unscrubbed.
    [root, ...root.querySelectorAll("*")].forEach((el) => {
        [...el.attributes].forEach((attr) => {
            const name = attr.name.toLowerCase();
            // Strip ASCII control/whitespace chars (tab, newline, etc.) before
            // the scheme test: the HTML URL parser ignores them, so
            // "jav\tascript:" is a live javascript: URL that a naive
            // startsWith("javascript:") check would miss.
            const value = attr.value
                .replace(/[\x00-\x20]/g, "")
                .toLowerCase();

            if (name.startsWith("on") || name === "style") {
                el.removeAttribute(attr.name);
                return;
            }

            if (
                (name === "href" || name === "xlink:href") &&
                (value.startsWith("javascript:") ||
                    value.startsWith("data:text/html"))
            ) {
                el.removeAttribute(attr.name);
            }
        });
    });

    return document.importNode(root, true);
}

export function createIconImage(url, options = {}) {
    const {
        width = 16,
        height = 16,
        className = "",
        objectFit = "contain",
        borderRadius = "2px",
        fallbackLetter = "",
    } = options;

    const img = document.createElement("img");
    img.src = url;
    img.width = width;
    img.height = height;
    if (className) img.className = className;
    img.style.display = "block";
    img.style.objectFit = objectFit;
    img.style.borderRadius = borderRadius;
    img.onerror = () => {
        if (fallbackLetter) {
            img.replaceWith(
                letterAvatarElement(fallbackLetter, Math.max(width, height)),
            );
        } else {
            img.style.display = "none";
        }
    };
    return img;
}

export function renderStoredIcon(container, iconValue, options = {}) {
    if (!container) return false;

    const {
        allowUrlImages = true,
        imgWidth = 16,
        imgHeight = 16,
        imgClassName = "",
        emptyText = "",
        fallbackLetter = "",
    } = options;

    const normalizedIconValue = normalizeStoredIconValue(iconValue);

    container.replaceChildren();
    container.style.display = "";

    if (!normalizedIconValue) {
        if (fallbackLetter) {
            container.appendChild(
                letterAvatarElement(fallbackLetter, Math.max(imgWidth, imgHeight)),
            );
            return true;
        }
        if (emptyText) {
            container.textContent = emptyText;
        } else {
            container.style.display = "none";
        }
        return false;
    }

    if (allowUrlImages && isStoredIconUrl(normalizedIconValue)) {
        // Privacy gate: never emit a remote request when the user disabled
        // remote favicons — show the letter avatar instead.
        if (isRemoteImageUrl(normalizedIconValue) && !remoteFaviconsAllowed()) {
            if (fallbackLetter) {
                container.appendChild(
                    letterAvatarElement(fallbackLetter, Math.max(imgWidth, imgHeight)),
                );
                return true;
            }
            container.style.display = "none";
            return false;
        }
        container.appendChild(
            createIconImage(normalizedIconValue, {
                width: imgWidth,
                height: imgHeight,
                className: imgClassName,
                fallbackLetter,
            }),
        );
        return true;
    }

    const safeSvg = createSafeSvgElement(normalizedIconValue);
    if (!safeSvg) {
        if (emptyText) {
            container.textContent = emptyText;
        } else {
            container.style.display = "none";
        }
        return false;
    }

    container.appendChild(safeSvg);
    return true;
}

export function renderStoredIconPreview(container, iconValue, options = {}) {
    return renderStoredIcon(container, iconValue, {
        imgWidth: 28,
        imgHeight: 28,
        emptyText: "No icon chosen yet!",
        ...options,
    });
}
