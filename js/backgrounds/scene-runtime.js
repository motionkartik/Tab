// Runtime for the canvas ("scene") backgrounds. Loaded on demand the first time
// a scene background is applied or its thumbnail is needed.
//
// One full-viewport canvas sits behind the page (z-index -1, no pointer events)
// and a single requestAnimationFrame loop drives the active scene.

import { buildPalette, resolveSceneVariant } from "./scene-kit.js";

const CANVAS_ID = "bg-scene-canvas";
const MAX_DPR = 1.5;
const MAX_FRAME_SECONDS = 0.05;

const sceneLoaders = {
    wave: () => import("./scenes/wave.js"),
    waves: () => import("./scenes/waves.js"),
    swell: () => import("./scenes/swell.js"),
    constellation: () => import("./scenes/constellation.js"),
    grid: () => import("./scenes/grid.js"),
    drift: () => import("./scenes/drift.js"),
    leaves: () => import("./scenes/leaves.js"),
    maple: () => import("./scenes/maple.js"),
    snow: () => import("./scenes/snow.js"),
    rain: () => import("./scenes/rain.js"),
};

const loadScene = async (id) => {
    const loader = sceneLoaders[id];
    if (!loader) return null;
    return (await loader()).default;
};

const reducedMotionQuery = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)");
const darkSchemeQuery = () =>
    window.matchMedia("(prefers-color-scheme: dark)");

/** The running scene, or null. */
let active = null;
/** Bumped on every start/stop so a slow scene import cannot revive a stale scene. */
let generation = 0;

function sizeCanvas(state) {
    const { canvas, ctx } = state;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 2 || h < 2) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    state.w = w;
    state.h = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
}

function drawFrame(state, dt) {
    if (!state.w) return;
    state.t += dt;
    state.instance.draw(
        state.ctx,
        state.w,
        state.h,
        state.t,
        dt,
        state.palette,
    );
}

/** Re-run the scene's setup (after a resize or palette change) and paint one frame. */
function resetScene(state) {
    if (!sizeCanvas(state)) return;
    state.instance.init?.(state.ctx, state.w, state.h, state.palette);
    drawFrame(state, 0);
}

function tick(now) {
    const state = active;
    if (!state) return;
    const dt = Math.min(MAX_FRAME_SECONDS, (now - state.last) / 1000);
    state.last = now;
    drawFrame(state, dt);
    state.raf = requestAnimationFrame(tick);
}

function startLoop(state) {
    cancelAnimationFrame(state.raf);
    // Respect reduced motion: keep the still frame, do not animate.
    if (reducedMotionQuery().matches) return;
    state.last = performance.now();
    state.raf = requestAnimationFrame(tick);
}

function teardown(state) {
    cancelAnimationFrame(state.raf);
    window.removeEventListener("resize", state.onResize);
    reducedMotionQuery().removeEventListener("change", state.onMotionChange);
    darkSchemeQuery().removeEventListener("change", state.onSchemeChange);
    state.canvas.remove();
}

export function stopScene() {
    generation++;
    if (!active) return;
    teardown(active);
    active = null;
}

/**
 * Start (or replace) the scene background.
 * @param {{ id: string, tint: string, variant: "system"|"dark"|"light" }} desc
 */
export async function startScene(desc) {
    const myGeneration = ++generation;
    const scene = await loadScene(desc.id);
    if (!scene || myGeneration !== generation) return;

    if (active) {
        teardown(active);
        active = null;
    }

    const canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.setAttribute("aria-hidden", "true");
    const state = {
        desc,
        canvas,
        ctx: canvas.getContext("2d"),
        instance: scene.make(),
        palette: buildPalette(desc.tint, resolveSceneVariant(desc.variant)),
        // Start mid-cycle so slow scenes do not open on their flattest frame.
        t: 20 + Math.random() * 40,
        w: 0,
        h: 0,
        raf: 0,
        last: 0,
    };
    state.onResize = () => resetScene(state);
    state.onMotionChange = () => startLoop(state);
    state.onSchemeChange = () => {
        if (state.desc.variant !== "system") return;
        state.palette = buildPalette(
            state.desc.tint,
            resolveSceneVariant("system"),
        );
        resetScene(state);
    };

    document.body.prepend(canvas);
    window.addEventListener("resize", state.onResize);
    reducedMotionQuery().addEventListener("change", state.onMotionChange);
    darkSchemeQuery().addEventListener("change", state.onSchemeChange);

    active = state;
    resetScene(state);
    startLoop(state);
}

/**
 * Paint one still frame of a scene into a small canvas (settings thumbnails
 * and the current-background preview).
 */
export async function renderSceneStill(canvas, id, tint, variant) {
    const scene = await loadScene(id);
    if (!scene) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth;
    const h = rect.height || canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = buildPalette(tint, resolveSceneVariant(variant));
    const instance = scene.make();
    instance.init?.(ctx, w, h, palette);
    // A fixed time keeps every thumbnail stable between renders.
    instance.draw(ctx, w, h, 30, 0, palette);
}
