// Shared dropdown flip helper.
//
// Absolutely-positioned dropdown menus open downward by default. Near the bottom
// of a scrolling modal body (or the viewport) that makes them clip behind the
// modal footer or run off-screen. After a menu is shown, call flipMenuIfNeeded()
// to add a `flip-up` class on the chosen target when the menu would overflow its
// clipping boundary and there is room to open upward instead.

/** Find the nearest scrollable/clipping ancestor, or null for the viewport. */
function nearestClip(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

/**
 * @param {HTMLElement} menuEl   The dropdown panel element (already visible).
 * @param {object}      [opts]
 * @param {HTMLElement} [opts.flipTarget]  Element to receive the `flip-up` class
 *                                         (defaults to menuEl).
 * @param {number}      [opts.margin]      Edge padding in px.
 */
export function flipMenuIfNeeded(menuEl, { flipTarget = null, margin = 6 } = {}) {
    if (!menuEl) return;
    const target = flipTarget || menuEl;
    target.classList.remove("flip-up");

    const menuRect = menuEl.getBoundingClientRect();
    if (!menuRect.height) return;

    const clip = nearestClip(menuEl);
    const bottomLimit = clip
        ? clip.getBoundingClientRect().bottom
        : window.innerHeight;
    const topLimit = clip ? clip.getBoundingClientRect().top : 0;

    const overflowsBelow = menuRect.bottom > bottomLimit - margin;
    const fitsAbove = menuRect.top - menuRect.height > topLimit + margin;

    if (overflowsBelow && fitsAbove) target.classList.add("flip-up");
}

/**
 * Position a `position: fixed` popover relative to an anchor button: right-edge
 * aligned to the button and dropping below it, but flipping to sit above the
 * button when opening downward would run off the bottom of the viewport (and
 * there is room above). The popover must already be visible (so its height can
 * be measured) before calling.
 *
 * @param {HTMLElement} popover    The fixed-positioned popover (already shown).
 * @param {HTMLElement} anchorBtn  The button the popover hangs off.
 * @param {object}      [opts]
 * @param {number}      [opts.gap]     Gap between button and popover in px.
 * @param {number}      [opts.margin]  Viewport edge padding in px.
 */
export function placeFixedPopover(
    popover,
    anchorBtn,
    { gap = 4, margin = 6 } = {},
) {
    if (!popover || !anchorBtn) return;
    const rect = anchorBtn.getBoundingClientRect();
    popover.style.right = window.innerWidth - rect.right + "px";

    const popoverH = popover.offsetHeight;
    const below = rect.bottom + gap;
    const flipsUp =
        below + popoverH > window.innerHeight - margin &&
        rect.top - popoverH - gap > margin;
    popover.style.top = (flipsUp ? rect.top - popoverH - gap : below) + "px";
}
