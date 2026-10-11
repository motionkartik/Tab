// Undo Manager — stacking toasts (info + undo), each with independent timers

const _activeKeyedToasts = new Map();

function _getContainer() {
    let c = document.getElementById("toast-container");
    if (!c) {
        c = document.createElement("div");
        c.id = "toast-container";
        document.body.appendChild(c);
    }
    return c;
}

function _createToast(className = "undo-toast") {
    const toast = document.createElement("div");
    toast.className = className;
    return toast;
}

function _show(toast) {
    const container = _getContainer();
    container.appendChild(toast);
    // Double rAF ensures element is painted before transition starts
    requestAnimationFrame(() =>
        requestAnimationFrame(() => toast.classList.add("visible")),
    );
}

function _removeTrackedToast(key, toast) {
    const active = _activeKeyedToasts.get(key);
    if (active?.toast === toast) _activeKeyedToasts.delete(key);
}

function _removeImmediately(toast) {
    if (!toast) return;
    if (toast._dismissTimer) {
        clearTimeout(toast._dismissTimer);
        toast._dismissTimer = null;
    }
    if (toast._undoHandler && toast._undoButton) {
        toast._undoButton.removeEventListener("click", toast._undoHandler);
    }
    if (toast._closeHandler && toast._closeButton) {
        toast._closeButton.removeEventListener("click", toast._closeHandler);
    }
    if (toast._key) _removeTrackedToast(toast._key, toast);
    toast.remove();
}

function _dismiss(toast) {
    if (!toast) return;
    if (toast._dismissTimer) {
        clearTimeout(toast._dismissTimer);
        toast._dismissTimer = null;
    }
    if (toast._key) _removeTrackedToast(toast._key, toast);
    toast.classList.remove("visible");
    setTimeout(() => _removeImmediately(toast), 300);
}

/**
 * Show a brief info/error toast with no undo button. Auto-hides after 2s.
 * @param {string} label  Message to display
 * @param {boolean} [isError=false]  Red tint for failure feedback
 */
export const showToast = (label, isError = false, options = {}) => {
    const {
        durationMs = 2000,
        dismissible = false,
        singletonKey = null,
    } = options || {};
    if (singletonKey) {
        const active = _activeKeyedToasts.get(singletonKey);
        if (active?.toast) _removeImmediately(active.toast);
    }
    const toast = _createToast("app-toast");
    toast._key = singletonKey;

    const labelSpan = document.createElement("span");
    labelSpan.className = "undo-toast-label";
    labelSpan.textContent = label;
    toast.appendChild(labelSpan);
    toast.classList.toggle("undo-toast-error", isError);

    if (dismissible) {
        const closeBtn = document.createElement("button");
        closeBtn.className = "undo-toast-close";
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Dismiss notification");
        closeBtn.textContent = "×";
        toast.appendChild(closeBtn);

        const closeHandler = () => _dismiss(toast);
        toast._closeButton = closeBtn;
        toast._closeHandler = closeHandler;
        closeBtn.addEventListener("click", closeHandler);
    }

    _show(toast);
    toast._dismissTimer = setTimeout(() => _dismiss(toast), durationMs);
    if (singletonKey) _activeKeyedToasts.set(singletonKey, { toast });
};

export const showUndoToast = (
    label,
    undoFn,
    {
        actionLabel = "Undo",
        durationMs = 5000,
        singletonKey = null,
        dismissible = false,
    } = {},
) => {
    if (singletonKey) {
        const active = _activeKeyedToasts.get(singletonKey);
        if (active?.toast) _removeImmediately(active.toast);
    }

    const toast = _createToast();
    toast._key = singletonKey;

    const labelSpan = document.createElement("span");
    labelSpan.className = "undo-toast-label";
    labelSpan.textContent = label;

    const undoBtn = document.createElement("button");
    undoBtn.className = "undo-toast-btn";
    undoBtn.textContent = actionLabel;

    toast.appendChild(labelSpan);
    toast.appendChild(undoBtn);

    if (dismissible) {
        const closeBtn = document.createElement("button");
        closeBtn.className = "undo-toast-close";
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Dismiss notification");
        closeBtn.textContent = "×";
        toast.appendChild(closeBtn);

        const closeHandler = () => _dismiss(toast);
        toast._closeButton = closeBtn;
        toast._closeHandler = closeHandler;
        closeBtn.addEventListener("click", closeHandler);
    }

    _show(toast);

    toast._dismissTimer = setTimeout(() => _dismiss(toast), durationMs);

    const undoHandler = () => {
        undoFn();
        _dismiss(toast);
    };
    toast._undoButton = undoBtn;
    toast._undoHandler = undoHandler;
    undoBtn.addEventListener("click", undoHandler);

    if (singletonKey) _activeKeyedToasts.set(singletonKey, { toast });
};
