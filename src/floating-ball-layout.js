"use strict";

// Pure viewport geometry. The controller measures its host once when a drag
// starts and reuses these targets for both rendering and pointer hit testing.
const MAX_TARGETS = 6;
const EPSILON = 0.000001;

function finite(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function separated(a, b, distance) {
    return Math.abs(a.x - b.x) + EPSILON >= distance || Math.abs(a.y - b.y) + EPSILON >= distance;
}

function fits(points, box, anchor, spacing) {
    return points.every((point, index) => (
        point.x + EPSILON >= box.left && point.x <= box.right + EPSILON
        && point.y + EPSILON >= box.top && point.y <= box.bottom + EPSILON
        && separated(point, anchor, spacing)
        && points.slice(0, index).every((other) => separated(point, other, spacing))
    ));
}

function arcTargets(count, box, anchor, direction, spacing) {
    const sweep = count === 2 ? Math.PI * 70 / 180 : Math.PI * 150 / 180;
    const points = Array.from({length: count}, (_, index) => {
        const angle = count === 1 ? 0 : -sweep / 2 + sweep * index / (count - 1);
        return {x: direction * Math.cos(angle), y: Math.sin(angle)};
    });
    let radius = spacing;
    for (let index = 0; index < points.length; index += 1) {
        for (let other = 0; other < index; other += 1) {
            const separation = Math.max(Math.abs(points[index].x - points[other].x), Math.abs(points[index].y - points[other].y));
            radius = Math.max(radius, spacing / separation);
        }
    }
    const targets = points.map((point) => ({x: anchor.x + point.x * radius, y: anchor.y + point.y * radius}));
    const left = Math.min(...targets.map((point) => point.x));
    const right = Math.max(...targets.map((point) => point.x));
    const top = Math.min(...targets.map((point) => point.y));
    const bottom = Math.max(...targets.map((point) => point.y));
    if (right - left > box.right - box.left + EPSILON || bottom - top > box.bottom - box.top + EPSILON) return null;
    const dx = clamp(0, box.left - left, box.right - right);
    const dy = clamp(0, box.top - top, box.bottom - bottom);
    targets.forEach((point) => { point.x += dx; point.y += dy; });

    // Translating a ring away from the top/bottom can put its first target over
    // the ball. Move the whole ring inward far enough to keep that exit clear.
    let inwardShift = 0;
    targets.forEach((point) => {
        if (Math.abs(point.y - anchor.y) < spacing) {
            inwardShift = Math.max(inwardShift, spacing - direction * (point.x - anchor.x));
        }
    });
    targets.forEach((point) => { point.x += direction * inwardShift; });
    if (targets.some((point) => direction * (point.x - anchor.x) < -EPSILON)) return null;
    return fits(targets, box, anchor, spacing) ? targets : null;
}

function verticalTargets(count, box, anchor, direction, spacing) {
    const height = (count - 1) * spacing;
    if (height > box.bottom - box.top + EPSILON) return null;
    const x = clamp(anchor.x + direction * spacing, box.left, box.right);
    if (direction * (x - anchor.x) < -EPSILON) return null;
    const starts = [anchor.y - height / 2, anchor.y - spacing - height, anchor.y + spacing];
    for (const start of starts) {
        const y = clamp(start, box.top, box.bottom - height);
        const targets = Array.from({length: count}, (_, index) => ({x, y: y + index * spacing}));
        if (fits(targets, box, anchor, spacing)) return targets;
    }
    return null;
}

function gridTargets(count, box, anchor, direction, spacing) {
    const columns = [];
    let x = clamp(anchor.x + direction * spacing, box.left, box.right);
    if (direction * (x - anchor.x) < -EPSILON) return [];
    while (columns.length < MAX_TARGETS && x + EPSILON >= box.left && x <= box.right + EPSILON) {
        columns.push(x);
        x += direction * spacing;
    }
    // Two spare rows allow a narrow host to leave space for the ball itself.
    const rows = Math.min(MAX_TARGETS + 2, Math.floor((box.bottom - box.top + EPSILON) / spacing) + 1);
    const height = (rows - 1) * spacing;
    const top = clamp(anchor.y - height / 2, box.top, box.bottom - height);
    const targets = [];
    columns.forEach((column) => {
        for (let row = 0; row < rows; row += 1) {
            const point = {x: column, y: top + row * spacing};
            if (separated(point, anchor, spacing)) targets.push(point);
        }
    });
    targets.sort((a, b) => (
        Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y)
        || a.y - b.y || direction * (a.x - b.x)
    ));
    return targets.slice(0, count).sort((a, b) => a.y - b.y || direction * (a.x - b.x));
}

/**
 * Return target centres in viewport coordinates. Targets remain at least 44px;
 * an impossibly small host reduces their number rather than shrinking hit areas.
 * If reduced, the last index is retained so the fixed More action stays reachable.
 */
function layoutFloatingBallActions(options = {}) {
    const {bounds = {}, anchor: rawAnchor = {}, surface} = options;
    const count = Math.floor(clamp(finite(options.count, 0), 0, MAX_TARGETS));
    const size = clamp(finite(options.size, 44), 44, 64);
    const gap = clamp(finite(options.gap, 8), 0, 64);
    const margin = Math.max(0, finite(options.margin, 8));
    const empty = {mode: "empty", targets: []};
    if (!count || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return empty;
    const inset = margin + size / 2;
    const box = {left: bounds.left + inset, right: bounds.right - inset, top: bounds.top + inset, bottom: bounds.bottom - inset};
    if (box.left > box.right || box.top > box.bottom) return empty;
    const anchor = {
        x: clamp(finite(rawAnchor.x, (box.left + box.right) / 2), box.left, box.right),
        y: clamp(finite(rawAnchor.y, (box.top + box.bottom) / 2), box.top, box.bottom),
    };
    const direction = options.edge === "left" ? 1 : -1;
    const spacing = size + gap;
    let mode = surface === "sidebar" ? "vertical" : "arc";
    let targets = mode === "arc" ? arcTargets(count, box, anchor, direction, spacing) : verticalTargets(count, box, anchor, direction, spacing);
    if (!targets && mode === "arc") {
        mode = "vertical";
        targets = verticalTargets(count, box, anchor, direction, spacing);
    }
    if (!targets) {
        mode = "grid";
        targets = gridTargets(count, box, anchor, direction, spacing);
    }
    if (!targets.length) return empty;
    return {
        mode,
        targets: targets.map((point, index) => ({
            ...point, size,
            index: targets.length < count && index === targets.length - 1 ? count - 1 : index,
        })),
    };
}

/** Nearest eligible circle wins in overlapping slop areas; ties use the index. */
function hitTestFloatingBallActions(targets, x, y, slop = 8) {
    if (!Array.isArray(targets) || !Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const padding = clamp(finite(slop, 8), 0, 32);
    let selected = -1;
    let nearest = Infinity;
    targets.forEach((target) => {
        if (!target || ![target.x, target.y, target.size, target.index].every(Number.isFinite) || target.size < 44 || target.index < 0) return;
        const distance = Math.hypot(target.x - x, target.y - y);
        if (distance > target.size / 2 + padding) return;
        if (distance < nearest - EPSILON || (Math.abs(distance - nearest) <= EPSILON && target.index < selected)) {
            nearest = distance;
            selected = target.index;
        }
    });
    return selected;
}

module.exports = {layoutFloatingBallActions, hitTestFloatingBallActions};
