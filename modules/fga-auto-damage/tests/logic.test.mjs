import test from "node:test";
import assert from "node:assert/strict";
import { judgeTarget, decide, describe } from "../scripts/logic.mjs";

const r = (total, extra = {}) => ({ total, isCritical: false, isFumble: false, ...extra });
const foreman = [{ name: "Foreman", ac: 18 }];

test("judge: meets AC is a hit, under is a miss", () => {
  assert.equal(judgeTarget(r(18), 18), "hit");
  assert.equal(judgeTarget(r(17), 18), "miss");
});

test("judge: natural 20 always hits, natural 1 always misses", () => {
  assert.equal(judgeTarget(r(5, { isCritical: true }), 30), "crit");
  assert.equal(judgeTarget(r(30, { isFumble: true }), 10), "miss");
});

test("judge: unknown AC", () => {
  assert.equal(judgeTarget(r(15), null), "unknown");
});

test("Bob's 15 misses Foreman's AC 18: no damage", () => {
  const d = decide({ roll: r(15), targets: foreman, trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, false);
  assert.equal(d.reason, "miss");
});

test("a 19 hits Foreman: damage rolls, not critical", () => {
  const d = decide({ roll: r(19), targets: foreman, trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, true);
  assert.equal(d.critical, false);
});

test("a natural 20 rolls critical damage", () => {
  const d = decide({ roll: r(25, { isCritical: true }), targets: foreman, trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, true);
  assert.equal(d.critical, true);
});

test("crit only: a plain hit does not roll", () => {
  const d = decide({ roll: r(19), targets: foreman, trigger: "crit", noTarget: "skip" });
  assert.equal(d.roll, false);
});

test("crit only: a crit rolls", () => {
  const d = decide({ roll: r(25, { isCritical: true }), targets: foreman, trigger: "crit", noTarget: "skip" });
  assert.equal(d.roll, true);
  assert.equal(d.critical, true);
});

test("always: rolls even on a miss", () => {
  const d = decide({ roll: r(3), targets: foreman, trigger: "always", noTarget: "skip" });
  assert.equal(d.roll, true);
  assert.equal(d.critical, false);
});

test("no target, skip: nothing rolls", () => {
  const d = decide({ roll: r(15), targets: [], trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, false);
  assert.equal(d.reason, "no-target-skip");
});

test("no target, roll anyway: damage rolls", () => {
  const d = decide({ roll: r(15), targets: [], trigger: "hit", noTarget: "roll" });
  assert.equal(d.roll, true);
});

test("no target, natural 20 still rolls critical damage", () => {
  const d = decide({ roll: r(22, { isCritical: true }), targets: [], trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, true);
  assert.equal(d.critical, true);
});

test("no target, natural 1 never rolls", () => {
  const d = decide({ roll: r(6, { isFumble: true }), targets: [], trigger: "hit", noTarget: "roll" });
  assert.equal(d.roll, false);
});

test("target with unknown AC follows the no-target choice", () => {
  const t = [{ name: "Ghost", ac: null }];
  assert.equal(decide({ roll: r(15), targets: t, trigger: "hit", noTarget: "skip" }).roll, false);
  assert.equal(decide({ roll: r(15), targets: t, trigger: "hit", noTarget: "roll" }).roll, true);
});

test("two targets: one hit is enough to roll", () => {
  const t = [{ name: "A", ac: 25 }, { name: "B", ac: 12 }];
  const d = decide({ roll: r(15), targets: t, trigger: "hit", noTarget: "skip" });
  assert.equal(d.roll, true);
});

test("describe reads clearly", () => {
  const d = decide({ roll: r(15), targets: foreman, trigger: "hit", noTarget: "skip" });
  assert.equal(describe(d, r(15), "Bob"), "Bob: miss on Foreman (15 vs AC 18). No damage rolled.");
});

test("describe without a name has no prefix and starts with a capital", () => {
  const d = decide({ roll: r(19), targets: foreman, trigger: "hit", noTarget: "skip" });
  assert.equal(describe(d, r(19), ""), "Hit on Foreman (19 vs AC 18). Rolling damage.");
  assert.equal(describe(d, r(19)), "Hit on Foreman (19 vs AC 18). Rolling damage.");
});
