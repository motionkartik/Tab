import { closeAllDrawers } from "./drawer-manager.js";
import { t } from "./i18n.js";
import { showToast } from "./undo-manager.js";
import {
    sanitizeLauncherAppTarget,
    sanitizeLinkTarget,
    sanitizeLinkUrl,
} from "./untrusted-input.js";

function normalizeActionType(rawType) {
    if (rawType === "clipboard" || rawType === "clipboard-button") {
        return "clipboard";
    }
    if (rawType === "launcher" || rawType === "launcher-button") {
        return "launcher";
    }
    if (rawType === "routine" || rawType === "routine-button") {
        return "routine";
    }
    return "link";
}

const routineDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Routine progress toast ──────────────────────────────────────────────────
function showRoutineProgress(name, total) {
    const el = document.createElement("div");
    el.className = "routine-progress-toast";
    const title = document.createElement("div");
    title.className = "routine-progress-title";
    title.textContent = name;
    const status = document.createElement("div");
    status.className = "routine-progress-status";
    status.textContent =
        total === 1
            ? t("ae0_starting_step", [total])
            : t("ae0_starting_steps", [total]);
    el.append(title, status);
    document.body.appendChild(el);
    // The scrolling container's vertical scrollbar (present only when content
    // overflows) sits at the viewport's right edge and would crowd the toast.
    // Offset right by its actual width so the gap matches the bottom — 0 when
    // there's no scrollbar (or it's an overlay scrollbar).
    const scroller = document.querySelector(".content-container");
    const scrollbarWidth = scroller
        ? scroller.offsetWidth - scroller.clientWidth
        : 0;
    if (scrollbarWidth > 0) {
        el.style.right = `calc(1.5rem + ${scrollbarWidth}px)`;
    }
    requestAnimationFrame(() => el.classList.add("visible"));
    return {
        update(index, step) {
            const label =
                step?.label || step?.kind || t("ae0_step_n", [index]);
            status.textContent = t("ae0_step_progress", [index, total, label]);
        },
        done(ranCount) {
            const allRan = ranCount >= total;
            status.textContent = allRan
                ? total === 1
                    ? t("ae0_done_step", [total])
                    : t("ae0_done_steps", [total])
                : t("ae0_done_partial", [ranCount, total, total - ranCount]);
            el.classList.add("done");
            setTimeout(() => {
                el.classList.remove("visible");
                setTimeout(() => el.remove(), 300);
            }, 1500);
        },
    };
}

async function runRoutineStep(step) {
    const kind = step?.kind;

    if (kind === "url") {
        const safeUrl = sanitizeLinkUrl(step?.url);
        if (!safeUrl) return;
        window.open(safeUrl, "_blank", "noopener,noreferrer");
        return;
    }

    if (kind === "app") {
        const safeTarget = sanitizeLauncherAppTarget(step?.target);
        if (!safeTarget) return;
        window.open(safeTarget, "_blank", "noopener,noreferrer");
        return;
    }

    if (kind === "file" || kind === "folder") {
        // Web build: opening local files/folders needed the native companion
        // app, which doesn't exist here.
        showToast(t("ae0_launch_failed"), true);
        return;
    }

    if (kind === "clipboard") {
        await navigator.clipboard.writeText(step?.content || "");
        return;
    }

    if (kind === "workspace") {
        if (!step?.workspaceId) return;
        const { switchWorkspace } = await import(
            "./workspaces/workspace-actions.js"
        );
        await switchWorkspace(step.workspaceId);
        return;
    }

    if (kind === "delay") {
        const ms = Number(step?.ms) || 0;
        if (ms > 0) await routineDelay(ms);
        return;
    }
}

export async function executeRoutineAction(item) {
    const steps = Array.isArray(item?.steps) ? item.steps : [];
    if (steps.length === 0) {
        showToast(t("ae0_no_steps"));
        return false;
    }

    const stagger = Number(item?.stagger) || 0;
    const progress = showRoutineProgress(item?.name || t("ae0_routine_default"), steps.length);
    let ran = 0;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        progress.update(i + 1, step);
        try {
            await runRoutineStep(step);
            ran++;
        } catch (err) {
            console.warn("Routine step failed", step, err);
        }
        if (stagger > 0 && i < steps.length - 1) {
            await routineDelay(stagger);
        }
    }

    progress.done(ran);
    return true;
}

export function executeLauncherAction(item) {
    const launcherKind = item?.launcherKind || "app";
    if (launcherKind === "app") {
        const safeTarget = sanitizeLauncherAppTarget(item?.target);
        if (!safeTarget) {
            showToast(t("ae0_blocked_launcher"), true);
            return false;
        }
        window.open(safeTarget, "_blank");
        return true;
    }

    if (launcherKind === "folder") {
        // Web build: opening local folders needed the native companion app.
        showToast(t("ae0_launch_failed"), true);
        return true;
    }

    if (launcherKind === "file") {
        // Web build: opening local files needed the native companion app.
        showToast(t("ae0_launch_failed"), true);
        return true;
    }

    if (launcherKind === "powershell") {
        // Web build: running commands needed the native companion app.
        showToast(t("ae0_launch_failed"), true);
        return true;
    }

    return false;
}

export function executeActionItem(item, { closeDrawers = false } = {}) {
    const actionType = normalizeActionType(item?.resultType || item?.type);

    if (actionType === "clipboard") {
        navigator.clipboard.writeText(item?.content || "").then(
            () => showToast(t("ae0_copied")),
            () => showToast(t("ae0_copy_failed"), true),
        );
        return true;
    }

    if (actionType === "launcher") {
        return executeLauncherAction(item);
    }

    if (actionType === "routine") {
        return executeRoutineAction(item);
    }

    const safeUrl = sanitizeLinkUrl(item?.url);
    if (!safeUrl) {
        showToast(t("ae0_blocked_link"), true);
        return false;
    }

    if (closeDrawers) closeAllDrawers();

    const target =
        sanitizeLinkTarget(item?.targetOverride) ||
        sanitizeLinkTarget(window.linkTarget) ||
        "_self";

    if (target === "_blank") {
        window.open(safeUrl, "_blank", "noopener,noreferrer");
    } else {
        window.location.href = safeUrl;
    }

    return true;
}
