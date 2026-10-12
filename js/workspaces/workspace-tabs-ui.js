import {
    workspaceOrder,
    currentWorkspace,
    protectedIds,
    workspaceNames,
    managedBoardIds,
} from "./workspace-state.js";
import { switchWorkspace } from "./workspace-actions.js";
import {
    defaultRenameWorkspaceHandler,
    getWorkspaceManagementActions,
} from "./workspace-management-actions.js";
import { t } from "../i18n.js";
import { getLocal } from "../storage-local.js";

const MAX_VISIBLE_TABS_WITHOUT_OVERFLOW = 4;

let activeContextMenu = null;
let activeOverflowMenu = null;
let activeOverflowTrigger = null;
let globalListenersInitialized = false;

const closeContextMenu = () => {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
};

const closeOverflowMenu = () => {
    if (activeOverflowMenu) {
        activeOverflowMenu.remove();
        activeOverflowMenu = null;
    }
    if (activeOverflowTrigger) {
        activeOverflowTrigger.classList.remove("open");
        const chevron = activeOverflowTrigger.querySelector(
            ".workspace-overflow-chevron",
        );
        if (chevron) chevron.style.transform = "";
        activeOverflowTrigger.setAttribute("aria-expanded", "false");
        activeOverflowTrigger = null;
    }
};

const initGlobalListeners = () => {
    if (globalListenersInitialized) return;
    globalListenersInitialized = true;

    document.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) {
            closeContextMenu();
            closeOverflowMenu();
            return;
        }

        if (!target.closest(".workspace-context-menu")) {
            closeContextMenu();
        }

        if (
            !target.closest(".workspace-overflow-trigger") &&
            !target.closest(".workspace-overflow-menu")
        ) {
            closeOverflowMenu();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeContextMenu();
            closeOverflowMenu();
        }
    });

    window.addEventListener(
        "resize",
        () => {
            closeContextMenu();
            closeOverflowMenu();
        },
        { passive: true },
    );

    document.addEventListener(
        "scroll",
        () => {
            closeContextMenu();
            closeOverflowMenu();
        },
        true,
    );
};

const getWorkspaceDisplayName = (workspaceId, defaultName) =>
    workspaceId === "default"
        ? defaultName
        : workspaceNames[workspaceId] || workspaceId.replace(/-/g, " ");

const getOrderedWorkspaceIds = () => {
    const uniqueIds = [];
    const seen = new Set();

    workspaceOrder.forEach((workspaceId) => {
        if (!workspaceId || seen.has(workspaceId)) return;
        uniqueIds.push(workspaceId);
        seen.add(workspaceId);
    });

    if (!seen.has("default")) uniqueIds.push("default");

    return uniqueIds;
};

const partitionWorkspaceIds = () => {
    const orderedIds = getOrderedWorkspaceIds();
    if (orderedIds.length <= MAX_VISIBLE_TABS_WITHOUT_OVERFLOW) {
        return {
            visibleWorkspaceIds: orderedIds,
            overflowWorkspaceIds: [],
        };
    }

    const visibleCount = MAX_VISIBLE_TABS_WITHOUT_OVERFLOW - 1;

    return {
        visibleWorkspaceIds: orderedIds.slice(0, visibleCount),
        overflowWorkspaceIds: orderedIds.slice(visibleCount),
    };
};

const appendWorkspaceIndicators = (target, workspaceId) => {
    const isManaged = managedBoardIds.has(workspaceId);

    if (isManaged) {
        const syncIcon = document.createElement("span");
        syncIcon.className = "workspace-sync-icon";
        syncIcon.textContent = "↺";
        syncIcon.title = t("wtu40_managed_board_readonly");
        target.appendChild(syncIcon);
    } else if (protectedIds.includes(workspaceId)) {
        const lockSpan = document.createElement("span");
        lockSpan.className = "workspace-lock-icon";
        lockSpan.textContent = "🔒";
        target.appendChild(lockSpan);
    }
};

const updateOverflowSelection = (workspaceId) => {
    const trigger = document.querySelector(".workspace-overflow-trigger");
    const items = document.querySelectorAll(".workspace-overflow-item");

    if (!trigger) return;

    let overflowWorkspaceIds = [];
    try {
        overflowWorkspaceIds = JSON.parse(trigger.dataset.overflowIds || "[]");
    } catch (_error) {
        overflowWorkspaceIds = [];
    }

    const defaultName = trigger.dataset.defaultName || t("wtu40_start");
    const defaultLabel = trigger.dataset.defaultLabel || t("wtu40_more");
    const isOverflowActive = overflowWorkspaceIds.includes(workspaceId);
    const activeDisplayName = isOverflowActive
        ? getWorkspaceDisplayName(workspaceId, defaultName)
        : defaultLabel;

    items.forEach((item) => {
        const isActive = item.dataset.workspace === workspaceId;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-current", isActive ? "true" : "false");
        if (isActive) {
            item.style.background = "var(--tab-active-bg)";
            item.style.color = "var(--tab-active-color)";
        } else {
            item.style.background = "";
            item.style.color = "";
        }
    });

    const label = trigger.querySelector(".workspace-overflow-label");

    trigger.classList.toggle("active", isOverflowActive);
    trigger.setAttribute("aria-current", isOverflowActive ? "true" : "false");

    if (label) {
        label.textContent = activeDisplayName;
    }
};

const showWorkspaceContextMenu = (workspaceId, displayName, e) => {
    e.preventDefault();
    e.stopPropagation();
    closeOverflowMenu();
    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "workspace-context-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const actions = getWorkspaceManagementActions({
        workspaceId,
        displayName,
        onRename: defaultRenameWorkspaceHandler,
    });

    let previousSection = null;
    actions.forEach((action, index) => {
        if (index > 0 && action.section !== previousSection) {
            const separator = document.createElement("div");
            separator.className = "workspace-context-menu-separator";
            menu.appendChild(separator);
        }

        const item = document.createElement("div");
        item.className =
            "workspace-context-menu-item" +
            (action.className ? ` ${action.className}` : "");
        item.innerHTML = `<span>${action.icon}</span><span>${action.label}</span>`;
        item.addEventListener("click", async () => {
            closeContextMenu();
            await action.handler();
        });
        menu.appendChild(item);

        previousSection = action.section;
    });

    document.body.appendChild(menu);
    activeContextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
};

const createWorkspaceTab = (workspaceId, defaultName) => {
    const isManaged = managedBoardIds.has(workspaceId);
    const displayName = getWorkspaceDisplayName(workspaceId, defaultName);

    const tab = document.createElement("div");
    tab.className = `workspace-tab${workspaceId === currentWorkspace ? " active" : ""}${isManaged ? " managed-board-tab" : ""}`;
    tab.dataset.workspace = workspaceId;
    tab.dataset.displayName = displayName;

    appendWorkspaceIndicators(tab, workspaceId);

    const nameSpan = document.createElement("span");
    nameSpan.className = "workspace-name";
    nameSpan.textContent = displayName;
    tab.appendChild(nameSpan);

    tab.onclick = () => {
        closeOverflowMenu();
        switchWorkspace(workspaceId);
    };

    tab.addEventListener("contextmenu", (e) =>
        showWorkspaceContextMenu(workspaceId, displayName, e),
    );

    return tab;
};

const positionOverflowMenu = (menu, trigger) => {
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 6}px`;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
        menu.style.left = `${Math.max(8, window.innerWidth - menuRect.width - 8)}px`;
    }
    if (menuRect.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.max(8, rect.top - menuRect.height - 6)}px`;
    }
};

const createOverflowTrigger = (overflowWorkspaceIds, defaultName) => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "workspace-tab workspace-overflow-trigger";
    trigger.style.height = "35px";
    trigger.style.minHeight = "35px";
    trigger.dataset.defaultLabel = t("wtu40_more");
    trigger.dataset.defaultName = defaultName;
    trigger.dataset.overflowIds = JSON.stringify(overflowWorkspaceIds);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "workspace-overflow-label";
    label.textContent = t("wtu40_more");

    const chevron = document.createElement("span");
    chevron.className = "workspace-overflow-chevron";
    chevron.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true" width="18" height="18"><path d="M4 6.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    chevron.style.display = "inline-flex";
    chevron.style.alignItems = "center";
    chevron.style.justifyContent = "center";
    chevron.style.opacity = "0.8";
    chevron.style.transition = "transform 0.15s ease";

    trigger.append(label, chevron);

    const openMenu = () => {
        closeContextMenu();

        if (activeOverflowMenu) {
            closeOverflowMenu();
            return;
        }

        const menu = document.createElement("div");
        menu.className = "workspace-context-menu workspace-overflow-menu";
        menu.setAttribute("role", "menu");
        menu.style.minWidth = `${Math.max(trigger.offsetWidth, 160)}px`;

        overflowWorkspaceIds.forEach((workspaceId) => {
            const displayName = getWorkspaceDisplayName(
                workspaceId,
                defaultName,
            );
            const item = document.createElement("button");
            item.type = "button";
            item.className =
                "workspace-context-menu-item workspace-overflow-item";
            item.dataset.workspace = workspaceId;
            item.dataset.displayName = displayName;
            item.setAttribute("role", "menuitem");

            const content = document.createElement("span");
            content.style.display = "inline-flex";
            content.style.alignItems = "center";
            content.style.gap = "0.35rem";

            appendWorkspaceIndicators(content, workspaceId);

            const name = document.createElement("span");
            name.className = "workspace-name";
            name.textContent = displayName;
            content.appendChild(name);

            item.appendChild(content);

            item.addEventListener("click", () => {
                closeOverflowMenu();
                switchWorkspace(workspaceId);
            });

            item.addEventListener("contextmenu", (e) =>
                showWorkspaceContextMenu(workspaceId, displayName, e),
            );

            menu.appendChild(item);
        });

        document.body.appendChild(menu);
        activeOverflowMenu = menu;
        activeOverflowTrigger = trigger;
        trigger.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
        chevron.style.transform = "rotate(180deg)";

        positionOverflowMenu(menu, trigger);
        updateOverflowSelection(currentWorkspace);
    };

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        openMenu();
    });

    return trigger;
};

const appendAddButton = (tabsContainer, existingAddBtn) => {
    if (existingAddBtn) {
        existingAddBtn.title = t("wtu40_add_workspace");
        tabsContainer.appendChild(existingAddBtn);
    } else {
        const newAddBtn = document.createElement("button");
        newAddBtn.className = "workspace-add-btn";
        newAddBtn.id = "add-workspace-btn";
        newAddBtn.title = t("wtu40_add_workspace");
        newAddBtn.innerHTML = "+";
        newAddBtn.onclick = async () => {
            const name = prompt(t("wtu40_enter_workspace_name"));
            if (name && name.trim()) {
                const { addWorkspace } =
                    await import("./workspace-actions.js");
                const newId = addWorkspace(name.trim());
                if (newId) switchWorkspace(newId);
            }
        };
        tabsContainer.appendChild(newAddBtn);
    }
};

export const renderWorkspaceTabs = () => {
    const tabsContainer = document.getElementById("workspace-tabs");
    if (!tabsContainer) return;

    initGlobalListeners();
    closeOverflowMenu();

    getLocal(["defaultWorkspaceName"], (result) => {
        const defaultName = result.defaultWorkspaceName || t("wtu40_start");
        const addBtn = tabsContainer.querySelector(".workspace-add-btn");
        const { visibleWorkspaceIds, overflowWorkspaceIds } =
            partitionWorkspaceIds();

        tabsContainer.innerHTML = "";

        visibleWorkspaceIds.forEach((workspaceId) => {
            tabsContainer.appendChild(
                createWorkspaceTab(workspaceId, defaultName),
            );
        });

        if (overflowWorkspaceIds.length > 0) {
            tabsContainer.appendChild(
                createOverflowTrigger(overflowWorkspaceIds, defaultName),
            );
        }

        appendAddButton(tabsContainer, addBtn);
        updateActiveTab(currentWorkspace);
    });
};

export const updateActiveTab = (workspaceId) => {
    const tabs = document.querySelectorAll(".workspace-tab[data-workspace]");
    tabs.forEach((tab) => {
        if (tab.dataset.workspace === workspaceId) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    updateOverflowSelection(workspaceId);
};

export { closeContextMenu, closeOverflowMenu };
