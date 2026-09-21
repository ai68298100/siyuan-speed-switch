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

export interface FloatingBallUiOptions {
    surface: FloatingBallSurface;
    document?: Document;
    /** Portal parent. Defaults to the current document body. */
    host?: HTMLElement;
    /** Re-resolve the parent after a host redraw/replacement. */
    resolveHost?: () => HTMLElement | null;
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    ariaLabel?: string;
    observeHost?: boolean;
    onOpenSwitcher?: () => void;
    onOpenMore?: () => void;
    onPositionChange?: (position: FloatingBallPosition) => void;
}

export interface FloatingBallUiPatch {
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    ariaLabel?: string;
}

export interface FloatingBallUiController {
    mount(): HTMLElement | null;
    update(patch: FloatingBallUiPatch): void;
    setSuspended(suspended: boolean): void;
    setHidden(hidden: boolean): void;
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
        if (patch.ariaLabel !== undefined && this.trigger) {
            this.trigger.setAttribute("aria-label", patch.ariaLabel);
            this.trigger.setAttribute("title", patch.ariaLabel);
        }
        this.applyPosition();
    }

    setSuspended(suspended: boolean): void {
        if (this.disposed) return;
        if (suspended) {
            this.cancelPointer(true);
            this.setState("suspended");
        } else if (this.state === "suspended") {
            this.setState("docked");
        }
    }

    setHidden(hidden: boolean): void {
        if (this.disposed) return;
        if (hidden) {
            this.cancelPointer(true);
            this.setState("hidden");
        } else if (this.state === "hidden") {
            this.setState("docked");
        }
    }

    setState(state: FloatingBallState): void {
        if (this.disposed) return;
        this.state = state;
        if (this.root) this.root.dataset.state = state;
        if (this.trigger) {
            this.trigger.disabled = state === "executing";
            this.trigger.setAttribute("aria-busy", String(state === "executing"));
            this.trigger.setAttribute("aria-expanded", String(state === "targeting" || state === "more"));
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
        this.trigger?.focus();
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPointer(true);
        if (this.reconcileTimer !== null && this.doc) {
            const view = this.doc.defaultView;
            if (view) view.clearTimeout(this.reconcileTimer);
            else clearTimeout(this.reconcileTimer);
            this.reconcileTimer = null;
        }
        this.observer?.disconnect();
        this.observer = null;
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
        this.applyPosition();
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
            if (this.state === "suspended" || this.state === "hidden" || this.state === "executing") return;
            if (event.button !== undefined && event.button !== 0) return;
            this.activePointerId = event.pointerId;
            this.pointerStart = {x: event.clientX, y: event.clientY};
            this.positionAtPointerStart = this.getPosition();
            this.suppressClick = false;
            try { trigger.setPointerCapture(event.pointerId); } catch (_) { /* WebView may not support capture. */ }
        };
        const onPointerMove = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId || !this.pointerStart) return;
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
            const wasDragging = this.state === "dragging";
            if (wasDragging) {
                this.position = this.positionFromPointer(event.clientX, event.clientY);
                this.applyPosition();
                this.options.onPositionChange?.(this.getPosition());
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
            if (this.suppressClick) {
                this.suppressClick = false;
                event.preventDefault();
                return;
            }
            if (this.state === "suspended" || this.state === "hidden" || this.state === "executing") return;
            this.options.onOpenSwitcher?.();
        };
        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            if (this.state === "suspended" || this.state === "hidden" || this.state === "executing") return;
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
            if (this.state === "suspended" || this.state === "hidden" || this.state === "executing") return;
            if (!this.options.onOpenMore) return;
            this.setState("more");
            this.options.onOpenMore?.();
        };
        trigger.addEventListener("keydown", onKeyDown);
        this.cleanups.push(() => trigger.removeEventListener("keydown", onKeyDown));
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
    }

    private positionFromPointer(clientX: number, clientY: number): FloatingBallPosition {
        const view = this.doc.defaultView;
        const width = Math.max(1, view?.innerWidth || this.doc.documentElement.clientWidth || 1);
        const height = Math.max(1, view?.innerHeight || this.doc.documentElement.clientHeight || 1);
        const rect = this.root?.getBoundingClientRect();
        const ballHeight = rect?.height || 48;
        const availableHeight = Math.max(1, height - ballHeight - this.margin * 2);
        return {
            edge: clientX <= width / 2 ? "left" : "right",
            yRatio: clamp((clientY - ballHeight / 2 - this.margin) / availableHeight, 0, 1),
        };
    }

    private applyPosition(): void {
        if (!this.root) return;
        const {edge, yRatio} = this.position;
        this.root.dataset.edge = edge;
        this.root.dataset.yRatio = String(yRatio);
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
