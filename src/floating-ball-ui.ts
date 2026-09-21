/**
 * Floating ball portal and lifecycle controller.
 *
 * T-6757/B0 deliberately keeps action rendering out of this module.  The
 * controller owns the DOM singleton, pointer lifecycle, suspension and host
 * redraw recovery; action selection and execution are supplied by the host in
 * later batches.  Keeping that boundary small lets index.ts remain the
 * adapter for settings and the shared quick-action registry.
 */

export type FloatingBallSurface = "desktop" | "sidebar" | "mobile";

export type FloatingBallState =
    | "docked"
    | "dragging"
    | "targeting"
    | "executing"
    | "more"
    | "suspended"
    | "hidden";

export type FloatingBallEdge = "left" | "right";

export interface FloatingBallPosition {
    edge: FloatingBallEdge;
    /** Normalized vertical position in the visible viewport. */
    yRatio: number;
}

export interface FloatingBallBounds {
    /** Viewport coordinates of the host surface's visible rectangle. */
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface FloatingBallUiOptions {
    surface: FloatingBallSurface;
    document?: Document;
    /** Portal parent. Defaults to the current document body. */
    host?: HTMLElement;
    /** Re-resolve the parent after a host redraw/replacement. */
    resolveHost?: () => HTMLElement | null;
    /** Optional viewport rectangle used by embedded surfaces such as sidebars. */
    resolveBounds?: () => FloatingBallBounds | null;
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    /** Opacity applied after the ball has been idle for idleDelayMs. */
    idleOpacity?: number;
    /** Delay before the idle presentation is applied. */
    idleDelayMs?: number;
    /** Move the idle ball partly beyond its attached edge. */
    halfHide?: boolean;
    /** Disable the trigger while the host action surface is unavailable. */
    available?: boolean;
    /** Yield while the document is in fullscreen. Hidden documents always yield. */
    hideOnFullscreen?: boolean;
    /** Hide while the host surface scrolls downward; reveal on upward scroll. */
    hideOnScroll?: boolean;
    ariaLabel?: string;
    observeHost?: boolean;
    onOpenSwitcher?: () => void;
    onOpenMore?: () => void;
    /** Called when a drag ends over a mounted action target. */
    onActionTarget?: (target: HTMLElement) => void;
    onPositionChange?: (position: FloatingBallPosition) => void;
}

export interface FloatingBallUiPatch {
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    idleOpacity?: number;
    idleDelayMs?: number;
    halfHide?: boolean;
    available?: boolean;
    hideOnFullscreen?: boolean;
    hideOnScroll?: boolean;
    ariaLabel?: string;
}

export interface FloatingBallUiController {
    mount(): HTMLElement | null;
    update(patch: FloatingBallUiPatch): void;
    setSuspended(suspended: boolean): void;
    setHidden(hidden: boolean): void;
    setScrollHidden(hidden: boolean): void;
    setState(state: FloatingBallState): void;
    getState(): FloatingBallState;
    getPosition(): FloatingBallPosition;
    getElement(): HTMLElement | null;
    focus(): void;
    destroy(): void;
}

const ROOT_CLASS = "sw-fab-root";
const ROOT_SELECTOR = `.${ROOT_CLASS}`;
const ROOT_MARKER = "data-sw-floating-ball";
const DEFAULT_POSITION: FloatingBallPosition = {edge: "right", yRatio: 0.72};
const DEFAULT_TOUCH_SLOP = 9;
const DEFAULT_MARGIN = 8;
const MIN_TOUCH_SLOP = 8;
const MAX_TOUCH_SLOP = 12;
const DEFAULT_IDLE_OPACITY = 0.4;
const DEFAULT_IDLE_DELAY_MS = 5000;
const MAX_IDLE_DELAY_MS = 60_000;

type Cleanup = () => void;

/** A document may contain at most one controller for each surface. */
const ACTIVE_CONTROLLERS = new WeakMap<Document, Map<FloatingBallSurface, FloatingBallUiController>>();

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizePosition(value: FloatingBallPosition | undefined): FloatingBallPosition {
    return {
        edge: value?.edge === "left" ? "left" : "right",
        yRatio: clamp(Number.isFinite(value?.yRatio) ? Number(value?.yRatio) : DEFAULT_POSITION.yRatio, 0, 1),
    };
}

function normalizeTouchSlop(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_TOUCH_SLOP, MIN_TOUCH_SLOP, MAX_TOUCH_SLOP);
}

function normalizeIdleOpacity(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_OPACITY, 0.4, 1);
}

function normalizeIdleDelay(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_DELAY_MS, 0, MAX_IDLE_DELAY_MS);
}

function getControllerMap(doc: Document): Map<FloatingBallSurface, FloatingBallUiController> {
    let map = ACTIVE_CONTROLLERS.get(doc);
    if (!map) {
        map = new Map<FloatingBallSurface, FloatingBallUiController>();
        ACTIVE_CONTROLLERS.set(doc, map);
    }
    return map;
}

/**
 * A small, dependency-free lifecycle controller for the floating-ball portal.
 * The class is intentionally usable from tests with a JSDOM document.
 */
export class FloatingBallUi implements FloatingBallUiController {
    private readonly doc: Document | null;
    private readonly surface: FloatingBallSurface;
    private readonly options: FloatingBallUiOptions;
    private readonly cleanups: Cleanup[] = [];
    private root: HTMLElement | null = null;
    private trigger: HTMLButtonElement | null = null;
    private observer: MutationObserver | null = null;
    private reconcileTimer: number | null = null;
    private disposed = false;
    private state: FloatingBallState = "docked";
    private position: FloatingBallPosition;
    private touchSlop: number;
    private margin: number;
    private idleOpacity: number;
    private idleDelayMs: number;
    private halfHide: boolean;
    private available: boolean;
    private hideOnFullscreen: boolean;
    private hideOnScroll: boolean;
    private scrollCleanup: Cleanup | null = null;
    private scrollOffsets = new WeakMap<object, number>();
    // CSS fixes the portal footprint per surface (48px desktop/mobile, 44px
    // sidebar). Keep it as a value so pointer frames do not force layout reads.
    private ballSize: number;
    private suspendedReason = false;
    private hiddenReasons = {
        manual: false,
        fullscreen: false,
        visibility: false,
        scroll: false,
    };
    private pointerInside = false;
    private focused = false;
    private idleTimer: number | null = null;
    private activePointerId: number | null = null;
    private pointerStart: {x: number; y: number} | null = null;
    private positionAtPointerStart: FloatingBallPosition | null = null;
    private suppressClick = false;

    constructor(options: FloatingBallUiOptions) {
        this.options = options;
        this.doc = options.document || (typeof document !== "undefined" ? document : null);
        this.surface = options.surface;
        this.position = normalizePosition(options.position);
        this.touchSlop = normalizeTouchSlop(options.touchSlopPx);
        this.margin = clamp(Number(options.marginPx), 0, 64);
        if (!Number.isFinite(this.margin)) this.margin = DEFAULT_MARGIN;
        this.idleOpacity = normalizeIdleOpacity(options.idleOpacity);
        this.idleDelayMs = normalizeIdleDelay(options.idleDelayMs);
        this.halfHide = options.halfHide !== false;
        this.available = options.available !== false;
        this.hideOnFullscreen = options.hideOnFullscreen !== false;
        this.hideOnScroll = options.hideOnScroll !== false;
        this.ballSize = this.surface === "sidebar" ? 44 : 48;
    }

    mount(): HTMLElement | null {
        if (this.disposed || !this.doc) return null;
        const map = getControllerMap(this.doc);
        const previous = map.get(this.surface);
        if (previous && previous !== this) previous.destroy();
        map.set(this.surface, this);

        const host = this.resolvePortalHost();
        if (!host) return null;
        if (!this.root) this.createPortal();
        this.attachPortal(host);
        this.observeHostRedraw(host);
        return this.root;
    }

    update(patch: FloatingBallUiPatch): void {
        if (this.disposed) return;
        if (patch.position) this.position = normalizePosition(patch.position);
        if (patch.touchSlopPx !== undefined) this.touchSlop = normalizeTouchSlop(patch.touchSlopPx);
        if (patch.marginPx !== undefined) {
            const margin = Number(patch.marginPx);
            this.margin = clamp(Number.isFinite(margin) ? margin : DEFAULT_MARGIN, 0, 64);
        }
        if (patch.idleOpacity !== undefined) this.idleOpacity = normalizeIdleOpacity(patch.idleOpacity);
        if (patch.idleDelayMs !== undefined) this.idleDelayMs = normalizeIdleDelay(patch.idleDelayMs);
        if (patch.halfHide !== undefined) this.halfHide = patch.halfHide !== false;
        if (patch.available !== undefined) this.available = patch.available === true;
        if (patch.hideOnFullscreen !== undefined) {
            this.hideOnFullscreen = patch.hideOnFullscreen !== false;
            this.syncDocumentVisibility();
        }
        if (patch.hideOnScroll !== undefined) {
            this.hideOnScroll = patch.hideOnScroll !== false;
            if (!this.hideOnScroll) this.setScrollHidden(false);
            this.syncScrollLifecycle();
        }
        if (patch.ariaLabel !== undefined && this.trigger) {
            this.trigger.setAttribute("aria-label", patch.ariaLabel);
            this.trigger.setAttribute("title", patch.ariaLabel);
        }
        this.applyPosition();
        this.applyAccessibilityState();
        this.setIdle(false);
        this.scheduleIdle();
    }

    setSuspended(suspended: boolean): void {
        if (this.disposed || this.suspendedReason === suspended) return;
        this.suspendedReason = suspended;
        if (suspended) {
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!suspended) this.markActive();
    }

    setHidden(hidden: boolean): void {
        if (this.disposed || this.hiddenReasons.manual === hidden) return;
        this.hiddenReasons.manual = hidden;
        if (hidden) {
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    setScrollHidden(hidden: boolean): void {
        if (this.disposed || this.hiddenReasons.scroll === hidden) return;
        this.hiddenReasons.scroll = hidden;
        if (hidden) {
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    setState(state: FloatingBallState): void {
        if (this.disposed) return;
        if (state === "suspended") return this.setSuspended(true);
        if (state === "hidden") return this.setHidden(true);
        this.applyState(this.effectiveBlockedState() || state);
    }

    private applyState(state: FloatingBallState): void {
        if (this.disposed) return;
        this.state = state;
        if (this.root) this.root.dataset.state = state;
        if (this.trigger) {
            this.applyAccessibilityState();
        }
        if (state !== "docked") {
            this.clearIdleTimer();
            this.setIdle(false);
        } else {
            this.scheduleIdle();
        }
    }

    getState(): FloatingBallState {
        return this.state;
    }

    getPosition(): FloatingBallPosition {
        return {...this.position};
    }

    getElement(): HTMLElement | null {
        return this.root;
    }

    focus(): void {
        if (this.disposed || !this.trigger || !this.available || this.isInteractionBlocked()) return;
        this.trigger.focus();
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPointer(true);
        this.clearIdleTimer();
        if (this.reconcileTimer !== null && this.doc) {
            const view = this.doc.defaultView;
            if (view) view.clearTimeout(this.reconcileTimer);
            else clearTimeout(this.reconcileTimer);
            this.reconcileTimer = null;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.scrollCleanup?.();
        this.scrollCleanup = null;
        this.pointerInside = false;
        this.focused = false;
        while (this.cleanups.length) this.cleanups.pop()?.();
        this.root?.remove();
        this.root = null;
        this.trigger = null;
        if (this.doc) {
            const map = ACTIVE_CONTROLLERS.get(this.doc);
            if (map?.get(this.surface) === this) map.delete(this.surface);
        }
    }

    private createPortal(): void {
        const root = this.doc.createElement("div");
        // Keep sw__fab on the portal root while the existing stylesheet is
        // being migrated.  New CSS can target sw-fab-root without breaking
        // users who still have the legacy FAB rules loaded.
        root.className = `${ROOT_CLASS} sw__fab`;
        root.setAttribute(ROOT_MARKER, this.surface);
        root.dataset.surface = this.surface;
        root.dataset.state = this.state;
        root.dataset.idle = "false";
        root.dataset.halfHide = String(this.halfHide);
        root.style.setProperty("--sw-fab-idle-opacity", String(this.idleOpacity));

        const trigger = this.doc.createElement("button");
        trigger.type = "button";
        trigger.className = "sw-fab-trigger";
        trigger.setAttribute("aria-label", this.options.ariaLabel || "打开切换器");
        trigger.setAttribute("title", this.options.ariaLabel || "打开切换器");
        trigger.setAttribute("aria-expanded", "false");
        trigger.innerHTML = "<svg aria-hidden=\"true\"><use href=\"#iconLayout\" xlink:href=\"#iconLayout\"></use></svg>";
        root.appendChild(trigger);

        this.root = root;
        this.trigger = trigger;
        this.bindPointerLifecycle(trigger);
        this.bindKeyboardLifecycle(trigger);
        this.bindActivityLifecycle(trigger);
        this.bindEnvironmentLifecycle();
        this.bindViewportLifecycle();
        this.syncScrollLifecycle();
        this.applyPosition();
        this.applyState(this.effectiveBlockedState() || this.state);
        this.scheduleIdle();
    }

    private resolvePortalHost(): HTMLElement | null {
        const resolved = this.options.resolveHost?.();
        if (resolved) return resolved;
        if (this.options.host) return this.options.host;
        return this.doc.body || null;
    }

    private attachPortal(host: HTMLElement): void {
        if (!this.root) return;
        // A hot-reloaded bundle can leave a marked root behind after its
        // module-level WeakMap was recreated.  Keep the DOM singleton even in
        // that case; the normal plugin onunload path still owns listener
        // cleanup for the old controller.
        const stale = host.querySelector<HTMLElement>(
            `${ROOT_SELECTOR}[${ROOT_MARKER}="${this.surface}"]`,
        );
        if (stale && stale !== this.root) stale.remove();
        if (this.root.parentElement !== host) host.appendChild(this.root);
        this.applyPosition();
    }

    private observeHostRedraw(host: HTMLElement): void {
        if (this.options.observeHost === false) return;
        const MutationObserverCtor = this.doc.defaultView?.MutationObserver;
        if (typeof MutationObserverCtor !== "function") return;
        this.observer?.disconnect();
        const observedRoot = host.ownerDocument.body || host;
        this.observer = new MutationObserverCtor(() => {
            if (this.disposed || this.reconcileTimer !== null) return;
            if (this.root?.isConnected && this.root.parentElement === host) return;
            const view = this.doc.defaultView;
            const schedule = () => {
                this.reconcileTimer = null;
                if (this.disposed) return;
                const nextHost = this.resolvePortalHost();
                if (!nextHost) return;
                if (!this.root) this.createPortal();
                this.attachPortal(nextHost);
                this.observeHostRedraw(nextHost);
            };
            this.reconcileTimer = view
                ? view.setTimeout(schedule, 0)
                : setTimeout(schedule, 0) as unknown as number;
        });
        this.observer.observe(observedRoot, {childList: true, subtree: true});
    }

    private bindPointerLifecycle(trigger: HTMLButtonElement): void {
        const onPointerDown = (event: PointerEvent) => {
            if (this.isInteractionBlocked() || this.activePointerId !== null) return;
            if (event.button !== undefined && event.button !== 0) return;
            this.activePointerId = event.pointerId;
            this.markActive();
            this.pointerStart = {x: event.clientX, y: event.clientY};
            this.positionAtPointerStart = this.getPosition();
            this.suppressClick = false;
            try { trigger.setPointerCapture(event.pointerId); } catch (_) { /* WebView may not support capture. */ }
        };
        const onPointerMove = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId || !this.pointerStart) return;
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            const dx = event.clientX - this.pointerStart.x;
            const dy = event.clientY - this.pointerStart.y;
            if (this.state !== "dragging" && Math.hypot(dx, dy) > this.touchSlop) {
                this.suppressClick = true;
                this.setState("dragging");
            }
            if (this.state !== "dragging") return;
            event.preventDefault();
            this.position = this.positionFromPointer(event.clientX, event.clientY);
            this.applyPosition();
        };
        const onPointerUp = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId) return;
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            const wasDragging = this.state === "dragging";
            if (wasDragging) {
                this.position = this.positionFromPointer(event.clientX, event.clientY);
                this.applyPosition();
                this.options.onPositionChange?.(this.getPosition());
                // Pointer capture keeps the gesture on the trigger, so use
                // hit-testing to hand a drag release to the action panel.
                // The panel remains an optional host concern; a missing or
                // stale target simply behaves like a normal drop on empty
                // space and does not execute the switcher.
                const element = this.doc?.elementFromPoint?.(event.clientX, event.clientY) as HTMLElement | null;
                const target = element?.closest?.("[data-action-id]") as HTMLElement | null;
                if (target && this.root?.contains(target)) {
                    this.options.onActionTarget?.(target);
                }
                event.preventDefault();
            }
            this.cancelPointer(false);
            // A drag's pointerup can still be followed by the synthetic
            // button click.  Keep the guard alive until that click handler
            // consumes it; pointercancel/blur clear it immediately.
            this.suppressClick = wasDragging;
        };
        const onPointerCancel = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId) return;
            this.cancelPointer(true);
        };
        const onClick = (event: MouseEvent) => {
            this.markActive();
            if (this.suppressClick) {
                this.suppressClick = false;
                event.preventDefault();
                return;
            }
            if (this.isInteractionBlocked()) return;
            this.options.onOpenSwitcher?.();
        };
        const onContextMenu = (event: MouseEvent) => {
            this.markActive();
            event.preventDefault();
            if (this.isInteractionBlocked()) return;
            if (!this.options.onOpenMore) return;
            this.setState("more");
            this.options.onOpenMore?.();
        };
        trigger.addEventListener("pointerdown", onPointerDown);
        trigger.addEventListener("pointermove", onPointerMove);
        trigger.addEventListener("pointerup", onPointerUp);
        trigger.addEventListener("pointercancel", onPointerCancel);
        trigger.addEventListener("click", onClick);
        trigger.addEventListener("contextmenu", onContextMenu);
        this.cleanups.push(() => {
            trigger.removeEventListener("pointerdown", onPointerDown);
            trigger.removeEventListener("pointermove", onPointerMove);
            trigger.removeEventListener("pointerup", onPointerUp);
            trigger.removeEventListener("pointercancel", onPointerCancel);
            trigger.removeEventListener("click", onClick);
            trigger.removeEventListener("contextmenu", onContextMenu);
        });

        const view = this.doc.defaultView;
        if (view) {
            const onBlur = () => this.cancelPointer(true);
            view.addEventListener("blur", onBlur);
            this.cleanups.push(() => view.removeEventListener("blur", onBlur));
        }
    }

    private bindKeyboardLifecycle(trigger: HTMLButtonElement): void {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
            event.preventDefault();
            this.markActive();
            if (this.isInteractionBlocked()) return;
            if (!this.options.onOpenMore) return;
            this.setState("more");
            this.options.onOpenMore?.();
        };
        trigger.addEventListener("keydown", onKeyDown);
        this.cleanups.push(() => trigger.removeEventListener("keydown", onKeyDown));
    }

    private bindActivityLifecycle(trigger: HTMLButtonElement): void {
        const onPointerEnter = () => {
            this.pointerInside = true;
            this.markActive();
        };
        const onPointerLeave = () => {
            this.pointerInside = false;
            this.scheduleIdle();
        };
        const onFocus = () => {
            this.focused = true;
            this.markActive();
        };
        const onFocusOut = (event: FocusEvent) => {
            const related = event.relatedTarget as Node | null;
            if (related && this.root?.contains(related)) return;
            this.focused = false;
            this.scheduleIdle();
        };
        trigger.addEventListener("pointerenter", onPointerEnter);
        trigger.addEventListener("pointerleave", onPointerLeave);
        const root = this.root;
        trigger.addEventListener("focus", onFocus);
        root.addEventListener("focusin", onFocus);
        root.addEventListener("focusout", onFocusOut);
        this.cleanups.push(() => {
            trigger.removeEventListener("pointerenter", onPointerEnter);
            trigger.removeEventListener("pointerleave", onPointerLeave);
            root.removeEventListener("focusin", onFocus);
            trigger.removeEventListener("focus", onFocus);
            root.removeEventListener("focusout", onFocusOut);
        });
    }

    private bindEnvironmentLifecycle(): void {
        const onVisibilityChange = () => this.syncDocumentVisibility();
        this.doc.addEventListener("fullscreenchange", onVisibilityChange);
        this.doc.addEventListener("visibilitychange", onVisibilityChange);
        this.cleanups.push(() => {
            this.doc?.removeEventListener("fullscreenchange", onVisibilityChange);
            this.doc?.removeEventListener("visibilitychange", onVisibilityChange);
        });
        onVisibilityChange();
    }

    /**
     * Re-apply the fixed portal position after a resize, rotation, or mobile
     * keyboard viewport change. The listener is event-driven and does no
     * polling or layout work while the viewport is stable.
     */
    private bindViewportLifecycle(): void {
        const view = this.doc.defaultView;
        if (!view) return;
        const onViewportChange = () => {
            if (this.disposed) return;
            this.applyPosition();
            this.syncDocumentVisibility();
            if (this.state === "docked") this.scheduleIdle();
        };
        view.addEventListener("resize", onViewportChange, {passive: true});
        view.addEventListener("orientationchange", onViewportChange, {passive: true});
        const visualViewport = view.visualViewport;
        visualViewport?.addEventListener("resize", onViewportChange, {passive: true});
        this.cleanups.push(() => {
            view.removeEventListener("resize", onViewportChange);
            view.removeEventListener("orientationchange", onViewportChange);
            visualViewport?.removeEventListener("resize", onViewportChange);
        });
    }

    private syncDocumentVisibility(): void {
        this.setEnvironmentHidden("fullscreen", this.hideOnFullscreen && Boolean(this.doc?.fullscreenElement));
        this.setEnvironmentHidden("visibility", this.doc?.visibilityState === "hidden");
    }

    private syncScrollLifecycle(): void {
        this.scrollCleanup?.();
        this.scrollCleanup = null;
        this.scrollOffsets = new WeakMap<object, number>();
        if (!this.doc || this.disposed || !this.hideOnScroll) return;
        const onScroll = (event: Event) => {
            if (this.disposed || !this.hideOnScroll || this.state === "executing") return;
            const rawTarget = event.target;
            if (!rawTarget || (typeof rawTarget !== "object")) return;
            const target = rawTarget as object;
            const nodeType = Number((rawTarget as Node).nodeType);
            if (this.root && nodeType > 0 && this.root.contains(rawTarget as Node)) return;
            const offset = this.readScrollOffset(target);
            if (offset === null) return;
            const previous = this.scrollOffsets.get(target);
            this.scrollOffsets.set(target, offset);
            // The first event establishes a baseline and does not hide the
            // ball. Subsequent direction changes are the only state writes.
            if (previous === undefined || Math.abs(offset - previous) < 1) return;
            this.setScrollHidden(offset > previous);
        };
        this.doc.addEventListener("scroll", onScroll, {capture: true, passive: true});
        this.scrollCleanup = () => {
            this.doc?.removeEventListener("scroll", onScroll, true);
            this.scrollCleanup = null;
        };
    }

    private readScrollOffset(target: object): number | null {
        if (target === this.doc || target === this.doc.documentElement || target === this.doc.body) {
            const view = this.doc.defaultView;
            return Math.max(0, Number(view?.scrollY) || 0, Number(this.doc.documentElement?.scrollTop) || 0, Number(this.doc.body?.scrollTop) || 0);
        }
        const value = Number((target as HTMLElement).scrollTop);
        return Number.isFinite(value) ? Math.max(0, value) : null;
    }

    private setEnvironmentHidden(reason: "fullscreen" | "visibility", hidden: boolean): void {
        if (this.disposed || this.hiddenReasons[reason] === hidden) return;
        this.hiddenReasons[reason] = hidden;
        if (hidden) {
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    private effectiveBlockedState(): FloatingBallState | null {
        if (this.suspendedReason) return "suspended";
        if (this.hiddenReasons.manual || this.hiddenReasons.fullscreen || this.hiddenReasons.visibility || this.hiddenReasons.scroll) return "hidden";
        return null;
    }

    private isInteractionBlocked(): boolean {
        return this.state === "suspended" || this.state === "hidden" || this.state === "executing"
            || !this.available;
    }

    private applyAccessibilityState(): void {
        if (!this.root || !this.trigger) return;
        const inert = this.state === "suspended" || this.state === "hidden";
        if (inert) {
            const active = this.doc?.activeElement as HTMLElement | null;
            if (active && this.root.contains(active)) active.blur?.();
            this.focused = false;
            this.pointerInside = false;
        }
        this.root.setAttribute("aria-hidden", String(inert));
        this.root.toggleAttribute("inert", inert);
        this.root.inert = inert;
        this.trigger.tabIndex = inert ? -1 : 0;
        this.trigger.disabled = !this.available || this.state === "executing" || inert;
        this.trigger.setAttribute("aria-busy", String(this.state === "executing"));
        this.trigger.setAttribute("aria-expanded", String(this.state === "targeting" || this.state === "more"));
    }

    private markActive(): void {
        if (this.disposed || this.state === "suspended" || this.state === "hidden") return;
        this.setIdle(false);
        if (this.pointerInside || this.focused || this.activePointerId !== null) this.clearIdleTimer();
        else this.scheduleIdle();
    }

    private setIdle(idle: boolean): void {
        if (!this.root) return;
        this.root.dataset.idle = String(idle);
        this.root.dataset.halfHide = String(this.halfHide);
        this.root.style.setProperty("--sw-fab-idle-opacity", String(this.idleOpacity));
    }

    private clearIdleTimer(): void {
        if (this.idleTimer === null || !this.doc) return;
        const view = this.doc.defaultView;
        if (view) view.clearTimeout(this.idleTimer);
        else clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private scheduleIdle(): void {
        if (!this.root || this.disposed || this.state !== "docked") return;
        this.clearIdleTimer();
        if (this.pointerInside || this.focused || this.activePointerId !== null) return;
        if (this.idleDelayMs <= 0) {
            this.setIdle(true);
            return;
        }
        const view = this.doc.defaultView;
        const timeout = () => {
            this.idleTimer = null;
            if (this.disposed || this.state !== "docked") return;
            this.setIdle(true);
        };
        this.idleTimer = view
            ? view.setTimeout(timeout, this.idleDelayMs)
            : setTimeout(timeout, this.idleDelayMs) as unknown as number;
    }

    private cancelPointer(restore: boolean): void {
        const preserveClickSuppression = !restore && this.suppressClick;
        if (restore && this.positionAtPointerStart) {
            this.position = this.positionAtPointerStart;
            this.applyPosition();
        }
        if (this.activePointerId !== null && this.trigger) {
            try { this.trigger.releasePointerCapture(this.activePointerId); } catch (_) { /* already released */ }
        }
        this.activePointerId = null;
        this.pointerStart = null;
        this.positionAtPointerStart = null;
        this.suppressClick = preserveClickSuppression;
        if (this.state === "dragging" || this.state === "targeting") this.setState("docked");
        else this.scheduleIdle();
    }

    private positionFromPointer(clientX: number, clientY: number): FloatingBallPosition {
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, view?.innerWidth || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, view?.innerHeight || this.doc.documentElement.clientHeight || 1);
        const bounds = this.getBounds(viewportWidth, viewportHeight);
        const ballHeight = this.ballSize;
        const minCenter = bounds.top + this.margin + ballHeight / 2;
        const maxCenter = Math.max(minCenter, bounds.bottom - this.margin - ballHeight / 2);
        const availableHeight = Math.max(1, maxCenter - minCenter);
        return {
            edge: clientX <= bounds.left + (bounds.right - bounds.left) / 2 ? "left" : "right",
            yRatio: clamp((clientY - minCenter) / availableHeight, 0, 1),
        };
    }

    private getBounds(viewportWidth: number, viewportHeight: number): FloatingBallBounds {
        const raw = this.options.resolveBounds?.();
        if (!raw) return {left: 0, right: viewportWidth, top: 0, bottom: viewportHeight};
        const left = Number(raw.left);
        const right = Number(raw.right);
        const top = Number(raw.top);
        const bottom = Number(raw.bottom);
        if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
            return {left: 0, right: viewportWidth, top: 0, bottom: viewportHeight};
        }
        return {
            left: clamp(left, 0, viewportWidth),
            right: clamp(right, 0, viewportWidth),
            top: clamp(top, 0, viewportHeight),
            bottom: clamp(bottom, 0, viewportHeight),
        };
    }

    private applyPosition(): void {
        if (!this.root) return;
        const {edge, yRatio} = this.position;
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, view?.innerWidth || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, view?.innerHeight || this.doc.documentElement.clientHeight || 1);
        const bounds = this.getBounds(viewportWidth, viewportHeight);
        this.root.dataset.edge = edge;
        this.root.dataset.yRatio = String(yRatio);
        if (this.options.resolveBounds) {
            this.root.style.setProperty("--sw-fab-host-width", `${Math.max(0, bounds.right - bounds.left)}px`);
        } else {
            this.root.style.removeProperty("--sw-fab-host-width");
        }
        if (this.options.resolveBounds && bounds.right > bounds.left && bounds.bottom > bounds.top) {
            const height = this.ballSize;
            const minCenter = bounds.top + this.margin + height / 2;
            const maxCenter = Math.max(minCenter, bounds.bottom - this.margin - height / 2);
            const center = minCenter + (maxCenter - minCenter) * yRatio;
            this.root.style.top = `${center.toFixed(3)}px`;
            this.root.style.left = edge === "left" ? `${(bounds.left + this.margin).toFixed(3)}px` : "auto";
            this.root.style.right = edge === "right"
                ? `${(viewportWidth - bounds.right + this.margin).toFixed(3)}px`
                : "auto";
            return;
        }
        this.root.style.top = `${(yRatio * 100).toFixed(3)}%`;
        this.root.style.left = edge === "left" ? `${this.margin}px` : "auto";
        this.root.style.right = edge === "right" ? `${this.margin}px` : "auto";
    }
}

export function createFloatingBallUi(options: FloatingBallUiOptions): FloatingBallUiController {
    return new FloatingBallUi(options);
}

// Friendly alias for callers that want the architectural name used by ADR
// 0066 while keeping the UI-specific class name available to existing code.
export {FloatingBallUi as FloatingBallController};
