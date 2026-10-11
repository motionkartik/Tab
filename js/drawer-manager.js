/**
 * drawer-manager.js — centralised open/close for all right-side slide-out drawers.
 *
 * "Drawers" are the panels that slide in from the right using the `.active` class:
 *   - Settings drawer       (#settings-modal)
 *   - Link / item editor    (#link)
 *   - Group style editor    (dynamically created .settings-modal-backdrop)
 *
 * Call closeAllDrawers() before opening any drawer so only one is ever visible.
 */

export function closeAllDrawers() {
    // Static drawers
    document.getElementById("settings-modal")?.classList.remove("active");
    document.getElementById("link")?.classList.remove("active");
    document.getElementById("group")?.classList.remove("active");

    // Dynamically created group style editor (there is at most one)
    document
        .querySelectorAll(".settings-modal-backdrop.active")
        .forEach((el) => {
            // Don't close the settings modal twice — it's already handled above
            if (el.id !== "settings-modal") el.classList.remove("active");
        });

    // Close any open context-menu popovers too
    document
        .querySelectorAll(
            ".link-overflow-popover.open, .group-menu-popover.open",
        )
        .forEach((el) => el.remove());
}
