// Default Buff / Debuff / Off classifications for the dnd5e system's
// built-in condition catalog (CONFIG.statusEffects), used to pre-fill the
// "Configure Status Icons" GM window so the GM is only fixing the ones
// they'd call differently rather than starting from a blank slate.
//
// Anything not listed here (a condition the live system exposes that this
// table doesn't know about) falls back to "off" wherever it's looked up —
// never auto-shown until the GM deliberately classifies it. "Off" is also
// used for conditions that are really just trackers/tactical markers
// rather than a clear buff or debuff (Concentrating, Flanking, Cover, etc.).
export const DEFAULT_STATUS_CLASSIFICATIONS = {
  bleeding: "debuff",
  blinded: "debuff",
  burning: "debuff",
  burrowing: "off",
  charmed: "debuff",
  concentrating: "off",
  cursed: "debuff",
  dead: "debuff",
  deafened: "debuff",
  dehydration: "debuff",
  diseased: "debuff",
  dodging: "buff",
  encumbered: "debuff",
  ethereal: "off",
  exceedingCarryingCapacity: "debuff",
  exhaustion: "debuff",
  falling: "off",
  flanked: "debuff",
  flanking: "buff",
  flying: "buff",
  frightened: "debuff",
  grappled: "debuff",
  coverHalf: "off",
  heavilyEncumbered: "debuff",
  hiding: "buff",
  hovering: "off",
  inaudible: "off",
  incapacitated: "debuff",
  invisible: "buff",
  malnutrition: "debuff",
  marked: "off",
  concentration: "off",
  cover: "off",
  disengage: "buff",
  distracted: "debuff",
  exhausted: "debuff",
  hasted: "buff",
  petrified: "debuff",
  rage: "buff",
  slowed: "debuff",
  turned: "debuff",
  paralyzed: "debuff",
  poisoned: "debuff",
  prone: "debuff",
  restrained: "debuff",
  silenced: "debuff",
  sleeping: "debuff",
  stable: "buff",
  stunned: "debuff",
  suffocation: "debuff",
  surprised: "debuff",
  coverThreeQuarters: "off",
  coverTotal: "off",
  transformed: "off",
  unconscious: "debuff"
};
