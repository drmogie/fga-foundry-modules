/**
 * Pure decision logic. No Foundry calls in here, so it can be tested with plain node.
 */

/**
 * Work out what one attack roll did to one target.
 * @param {{total:number, isCritical:boolean, isFumble:boolean}} roll
 * @param {number|null} ac  Target armor class, or null if unknown.
 * @returns {"crit"|"hit"|"miss"|"unknown"}
 */
export function judgeTarget(roll, ac) {
  if (roll.isCritical) return "crit";
  if (roll.isFumble) return "miss";
  if (typeof ac !== "number" || Number.isNaN(ac)) return "unknown";
  return roll.total >= ac ? "hit" : "miss";
}

/**
 * Decide whether damage should roll.
 * @param {object} args
 * @param {{total:number, isCritical:boolean, isFumble:boolean}} args.roll
 * @param {Array<{name:string, ac:number|null}>} args.targets
 * @param {"hit"|"crit"|"always"} args.trigger  Player's choice.
 * @param {"skip"|"roll"} args.noTarget         What to do with no usable target.
 * @returns {{roll:boolean, critical:boolean, results:Array<{name:string, ac:number|null, outcome:string}>, reason:string}}
 */
export function decide({ roll, targets, trigger, noTarget }) {
  const results = targets.map((t) => ({ name: t.name, ac: t.ac, outcome: judgeTarget(roll, t.ac) }));
  const anyCrit = results.some((r) => r.outcome === "crit");
  const anyHit = results.some((r) => r.outcome === "hit" || r.outcome === "crit");
  const anyUnknown = results.some((r) => r.outcome === "unknown");
  const critical = anyCrit || (results.length === 0 && roll.isCritical);

  if (trigger === "always") {
    return { roll: true, critical, results, reason: "always" };
  }

  if (trigger === "crit") {
    const ok = results.length ? anyCrit : roll.isCritical;
    return { roll: ok, critical: ok, results, reason: ok ? "crit" : "not-crit" };
  }

  // trigger === "hit"
  if (anyHit) return { roll: true, critical, results, reason: "hit" };
  if (results.length === 0 || anyUnknown) {
    // Nothing to compare against. Use the player's no-target choice.
    // A natural 20 always hits, so it rolls either way.
    if (roll.isCritical) return { roll: true, critical: true, results, reason: "crit" };
    if (roll.isFumble) return { roll: false, critical: false, results, reason: "fumble" };
    const ok = noTarget === "roll";
    return { roll: ok, critical: false, results, reason: ok ? "no-target-roll" : "no-target-skip" };
  }
  return { roll: false, critical: false, results, reason: "miss" };
}

/** Short one-line note for chat. */
export function describe(decision, roll, actorName) {
  const total = roll.total;
  const who = actorName ? `${actorName}: ` : "";
  const cap = (t) => (who ? t : t.charAt(0).toUpperCase() + t.slice(1));
  if (!decision.results.length) {
    if (decision.reason === "crit") return `${who}${cap("critical hit")} (${total}). Rolling damage.`;
    if (decision.roll) return `${who}${cap("no target picked")} (${total}). Rolling damage anyway.`;
    if (decision.reason === "fumble") return `${who}${cap("natural 1, a miss")}.`;
    return `${who}${cap("no target picked")} (${total}). No damage rolled.`;
  }
  const parts = decision.results.map((r) => {
    const ac = typeof r.ac === "number" ? `AC ${r.ac}` : "AC unknown";
    const word = r.outcome === "crit" ? "critical hit" : r.outcome === "hit" ? "hit" : r.outcome === "miss" ? "miss" : "unknown";
    return `${word} on ${r.name} (${total} vs ${ac})`;
  });
  return `${who}${cap(parts.join("; "))}. ${decision.roll ? "Rolling damage." : "No damage rolled."}`;
}
