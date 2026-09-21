const test = require("node:test");
const assert = require("node:assert/strict");
const {layoutFloatingBallActions, hitTestFloatingBallActions} = require("../src/floating-ball-layout.js");

function assertSafe(result, bounds, requested, gap = 8, margin = 8) {
    assert.ok(result.targets.length <= Math.min(6, requested));
    assert.equal(new Set(result.targets.map((target) => target.index)).size, result.targets.length);
    result.targets.forEach((target, index) => {
        assert.ok(target.size >= 44);
        assert.ok(target.index >= 0 && target.index < Math.min(6, requested));
        assert.ok(target.x - target.size / 2 >= bounds.left + margin - 0.000001, "left boundary");
        assert.ok(target.x + target.size / 2 <= bounds.right - margin + 0.000001, "right boundary");
        assert.ok(target.y - target.size / 2 >= bounds.top + margin - 0.000001, "top boundary");
        assert.ok(target.y + target.size / 2 <= bounds.bottom - margin + 0.000001, "bottom boundary");
        result.targets.slice(0, index).forEach((other) => {
            assert.ok(Math.abs(target.x - other.x) >= target.size + gap - 0.000001 || Math.abs(target.y - other.y) >= target.size + gap - 0.000001, "target rectangles must not overlap");
        });
        assert.equal(hitTestFloatingBallActions(result.targets, target.x, target.y), target.index);
    });
}

test("floating ball layout mirrors an inward half ring at both viewport edges", () => {
    const bounds = {left: 0, right: 1200, top: 0, bottom: 800};
    const left = layoutFloatingBallActions({bounds, anchor: {x: 32, y: 400}, edge: "left", surface: "desktop", count: 6});
    const right = layoutFloatingBallActions({bounds, anchor: {x: 1168, y: 400}, edge: "right", surface: "mobile", count: 6});
    assert.equal(left.mode, "arc");
    assert.equal(right.mode, "arc");
    assert.equal(left.targets.length, 6);
    left.targets.forEach((target, index) => {
        assert.ok(target.x > 32);
        assert.ok(Math.abs(1200 - target.x - right.targets[index].x) < 0.000001);
        assert.equal(target.y, right.targets[index].y);
    });
    assertSafe(left, bounds, 6);
    assertSafe(right, bounds, 6);
});

test("floating ball layout shifts a top/bottom ring into available space without covering the ball", () => {
    const bounds = {left: 12, right: 402, top: 48, bottom: 798};
    for (const edge of ["left", "right"]) {
        for (const y of [80, 766]) {
            const anchor = {x: edge === "left" ? 44 : 370, y};
            const result = layoutFloatingBallActions({bounds, anchor, edge, count: 6});
            assert.equal(result.targets.length, 6);
            assertSafe(result, bounds, 6);
            result.targets.forEach((target) => {
                assert.ok(edge === "left" ? target.x >= anchor.x : target.x <= anchor.x);
                assert.ok(Math.abs(target.x - anchor.x) >= 52 - 0.000001 || Math.abs(target.y - anchor.y) >= 52 - 0.000001);
            });
        }
    }
});

test("floating ball layout uses the sidebar host rectangle and prefers a vertical stack", () => {
    const bounds = {left: 800, right: 1030, top: 90, bottom: 710};
    const result = layoutFloatingBallActions({bounds, anchor: {x: 998, y: 470}, edge: "right", surface: "sidebar", count: 5});
    assert.equal(result.mode, "vertical");
    assert.equal(result.targets.length, 5);
    assert.equal(new Set(result.targets.map((target) => target.x)).size, 1);
    assertSafe(result, bounds, 5);
});

test("floating ball layout falls back to a compact grid in a low landscape viewport", () => {
    const bounds = {left: 0, right: 740, top: 0, bottom: 150};
    const result = layoutFloatingBallActions({bounds, anchor: {x: 708, y: 75}, edge: "right", count: 6});
    assert.equal(result.mode, "grid");
    assert.equal(result.targets.length, 6);
    assertSafe(result, bounds, 6);
});

test("floating ball layout retains More and 44px targets when only part of the first layer fits", () => {
    const bounds = {left: 0, right: 160, top: 0, bottom: 120};
    const result = layoutFloatingBallActions({bounds, anchor: {x: 128, y: 60}, edge: "right", count: 6});
    assert.equal(result.mode, "grid");
    assert.ok(result.targets.length > 0 && result.targets.length < 6);
    assert.equal(result.targets.at(-1).index, 5);
    assertSafe(result, bounds, 6);
    assert.deepEqual(layoutFloatingBallActions({bounds: {left: 0, right: 30, top: 0, bottom: 30}, count: 6}), {mode: "empty", targets: []});
});

test("floating ball layout stays bounded across 100 drag anchors, host sizes and target sizes", () => {
    for (let index = 0; index < 100; index += 1) {
        const bounds = {left: 23, right: 23 + 120 + (index * 97) % 1200, top: 61, bottom: 61 + 140 + (index * 53) % 800};
        const edge = index % 2 ? "left" : "right";
        const size = 44 + index % 21;
        const anchor = {x: edge === "left" ? bounds.left + 40 : bounds.right - 40, y: bounds.top + (bounds.bottom - bounds.top) * (index % 11) / 10};
        const result = layoutFloatingBallActions({bounds, anchor, edge, surface: index % 3 === 0 ? "sidebar" : "desktop", count: 6, size});
        assert.ok(result.targets.length > 0, `drag ${index} must keep an action reachable`);
        assertSafe(result, bounds, 6);
        assert.deepEqual(result, layoutFloatingBallActions({bounds, anchor, edge, surface: index % 3 === 0 ? "sidebar" : "desktop", count: 6, size}));
    }
});

test("floating ball hit testing extends each circle by 8px and picks only the nearest target", () => {
    const targets = [{x: 100, y: 100, size: 44, index: 2}, {x: 152, y: 100, size: 44, index: 5}];
    assert.equal(hitTestFloatingBallActions(targets, 72, 100), 2);
    assert.equal(hitTestFloatingBallActions(targets, 69, 100), -1);
    assert.equal(hitTestFloatingBallActions(targets, 72, 100, 0), -1);
    assert.equal(hitTestFloatingBallActions(targets, 127, 100), 5);
    assert.equal(hitTestFloatingBallActions(targets, 125, 100), 2);
    assert.equal(hitTestFloatingBallActions(targets, 126, 100), 2);
    assert.equal(hitTestFloatingBallActions([...targets].reverse(), 126, 100), 2);
    assert.equal(hitTestFloatingBallActions(targets, 100, 131), -1);
});

test("floating ball geometry rejects malformed coordinates and bounds work to six targets", () => {
    assert.deepEqual(layoutFloatingBallActions({count: 6}), {mode: "empty", targets: []});
    assert.deepEqual(layoutFloatingBallActions({bounds: {left: 0, right: Infinity, top: 0, bottom: 800}, count: 6}), {mode: "empty", targets: []});
    const bounds = {left: 0, right: 1200, top: 0, bottom: 800};
    assert.equal(layoutFloatingBallActions({bounds, count: 1000, anchor: {x: 1168, y: 400}}).targets.length, 6);
    assert.deepEqual(layoutFloatingBallActions({bounds, count: -1}), {mode: "empty", targets: []});
    assert.equal(hitTestFloatingBallActions(null, 0, 0), -1);
    assert.equal(hitTestFloatingBallActions([{x: NaN, y: 0, size: 44, index: 1}], 0, 0), -1);
    assert.equal(hitTestFloatingBallActions([{x: 0, y: 0, size: 44, index: 1}], NaN, 0), -1);
});
