// Pure canvas drawing for the screen transitions. No Foundry code in here.

export const TRANSITION = {
  NONE: "none",
  FADE: "fade",
  SWIRL: "swirl",
  GAS: "gas",
  OIL: "oil"
};

export const TRANSITION_LABELS = {
  [TRANSITION.NONE]: "None",
  [TRANSITION.FADE]: "Fade to black",
  [TRANSITION.SWIRL]: "Swirl down the drain",
  [TRANSITION.GAS]: "Swirling gas (rainbow)",
  [TRANSITION.OIL]: "Rainbow oil in water"
};

const ARMS = 5;
const STEPS = 36;
const TURNS = 1.6; // how many spins across one full close

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// A fixed, repeatable "random" number per index, so the same frame always
// draws the same way, but different blobs/ribbons don't all move in sync.
function seed(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Draw one frame.
 * p:   0 = clear screen, 1 = solid black
 * dir: "in" while the black is closing, "out" while it is opening.
 *      The swirl keeps spinning the same way in both, so the drain runs on
 *      through the black and back out the other side.
 */
export function drawFrame(ctx, w, h, effect, p, dir = "in") {
  ctx.clearRect(0, 0, w, h);
  if (p <= 0) return;
  if (p >= 1) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (effect === TRANSITION.GAS) {
    drawGas(ctx, w, h, p, dir);
    return;
  }

  if (effect === TRANSITION.OIL) {
    drawOil(ctx, w, h, p, dir);
    return;
  }

  if (effect !== TRANSITION.SWIRL) {
    ctx.globalAlpha = p;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    return;
  }

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.hypot(cx, cy) * 1.05;
  const spin = (dir === "in" ? p : 2 - p) * TURNS * Math.PI * 2;
  const curl = Math.PI * 1.9;
  const phi = (Math.PI / ARMS) * 1.1 * Math.pow(p, 1.1);

  ctx.fillStyle = "#000";

  // Outer darkness: the edges go black first and it closes toward the middle.
  const irisR = R * (1 - 0.95 * Math.pow(p, 1.25));
  const grad = ctx.createRadialGradient(cx, cy, Math.max(0, irisR * 0.55), cx, cy, Math.max(1, irisR * 1.15));
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Twisting black arms, wider as p grows.
  ctx.fillStyle = "#000";
  for (let k = 0; k < ARMS; k++) {
    const base = (k * Math.PI * 2) / ARMS + spin;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const rho = i / STEPS;
      const a = base + curl * rho - phi;
      const x = cx + Math.cos(a) * R * rho;
      const y = cy + Math.sin(a) * R * rho;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = STEPS; i >= 0; i--) {
      const rho = i / STEPS;
      const a = base + curl * rho + phi;
      ctx.lineTo(cx + Math.cos(a) * R * rho, cy + Math.sin(a) * R * rho);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Finish smoothly into solid black.
  if (p > 0.88) {
    ctx.globalAlpha = (p - 0.88) / 0.12;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

const GAS_WISPS = 14;

/**
 * Rainbow smoke. Starts as nothing in the middle of the screen and grows
 * outward until it covers everything. Soft, stretched-out wisps (not round
 * blobs) drift and curl with their own wobble, overlapping heavily so it
 * reads as a continuous swirling cloud rather than a handful of glowing
 * spotlights. "Screen" blending and muted color keep it looking like
 * translucent smoke instead of light sources.
 */
function drawGas(ctx, w, h, p, dir) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.hypot(cx, cy) * 1.15;
  const growth = Math.pow(p, 0.6);
  const radius = R * growth;

  // Runs 0 -> 2 across the whole close-then-open trip, so the color and
  // drift keep moving the same direction through the middle instead of
  // reversing when it opens back up.
  const phase = dir === "in" ? p : 2 - p;
  const hueBase = (phase * 140) % 360;

  // A soft, thin tint everywhere, thickening as the cloud grows, so by the
  // time it has spread it can fully hide the scene underneath.
  ctx.fillStyle = `rgba(10,10,14,${Math.min(0.85, p * 0.85)})`;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < GAS_WISPS; i++) {
    const s1 = seed(i, 1);
    const s2 = seed(i, 2);
    const s3 = seed(i, 3);
    const s4 = seed(i, 4);
    const s5 = seed(i, 5);

    // Two mismatched wobbles per wisp instead of one clean orbit, so each
    // one drifts on its own loose, wandering path. Spread widely and sized
    // to overlap heavily with its neighbors, so it reads as one shifting
    // cloud instead of separate circles with gaps between them.
    const angle =
      (i / GAS_WISPS) * Math.PI * 2 +
      s1 * Math.PI * 0.6 +
      phase * (1.1 + s2 * 0.8) * Math.PI +
      Math.sin(phase * (3 + s3 * 2) + s1 * 6.28) * 0.5;
    const distFactor = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(phase * (2 + s2 * 1.5) + s4 * 6.28));
    const dist = radius * distFactor;
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;

    // Stretched into an ellipse and rotated along its direction of drift,
    // like a curling tendril of smoke, instead of a round spotlight.
    const rFactor = 0.4 + 0.16 * (0.5 + 0.5 * Math.sin(phase * (2.7 + s1 * 2) + s3 * 6.28));
    const longR = Math.max(1, radius * rFactor);
    const shortR = longR * (0.35 + 0.15 * s5);
    const tendrilAngle = angle + Math.PI / 2 + Math.sin(phase * 2 + s2 * 6.28) * 0.6;
    const hue = (hueBase + (i * 360) / GAS_WISPS + Math.sin(phase * 1.3 + s4 * 6.28) * 20) % 360;

    // Scale the whole draw (not just the ellipse) so a plain circular
    // gradient stretches with it — that way the fade reaches all the way
    // to zero right at the ellipse's edge in every direction, instead of
    // getting cut off early along the short axis and leaving a visible rim.
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(tendrilAngle);
    ctx.scale(1, shortR / longR);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, longR);
    grad.addColorStop(0, `hsla(${hue}, 60%, 42%, 0.28)`);
    grad.addColorStop(0.55, `hsla(${hue}, 60%, 40%, 0.14)`);
    grad.addColorStop(1, `hsla(${hue}, 60%, 38%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, longR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Finish smoothly into solid black, same as the drain swirl.
  if (p > 0.88) {
    ctx.globalAlpha = (p - 0.88) / 0.12;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

const OIL_ARMS = 6;
const OIL_STEPS = 34;
const OIL_TURNS = 1.0;
const OIL_CURL = Math.PI * 2.2;

/**
 * Rainbow oil-in-water. Same grow-from-the-middle idea as the gas cloud,
 * but the color rides on thin ribbons instead of soft round blobs — like a
 * few drops of colored oil stirred into water. Each ribbon's path and width
 * wave as they go, instead of tracing a perfectly smooth spiral, so it
 * looks hand-stirred rather than a clean pinwheel. "Screen" blending
 * instead of "lighter" keeps it from glowing like gas; it looks more like
 * a marbled, streaky sheen.
 */
function drawOil(ctx, w, h, p, dir) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.hypot(cx, cy) * 1.15;
  const growth = Math.pow(p, 0.6);
  const radius = R * growth;

  const phase = dir === "in" ? p : 2 - p;
  const hueBase = (phase * 110) % 360;
  const spin = phase * OIL_TURNS * Math.PI * 2;
  const halfWidth = (Math.PI / OIL_ARMS) * 0.95;

  // Dark water tint underneath, thickening as it spreads.
  ctx.fillStyle = `rgba(8,10,14,${Math.min(0.88, p * 0.88)})`;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let k = 0; k < OIL_ARMS; k++) {
    const s1 = seed(k, 11);
    const s2 = seed(k, 12);
    const s3 = seed(k, 13);
    const base = (k * Math.PI * 2) / OIL_ARMS + spin + s1 * 0.4;
    const hue = (hueBase + (k * 360) / OIL_ARMS) % 360;

    // How far the path wanders off a clean spiral, and how the ribbon's
    // width breathes along its length — both driven by the same wobble
    // so the streak looks like it is actually being stirred, not just spun.
    const wander = rho => Math.sin(rho * (5 + s2 * 3) + phase * (2 + s3 * 2) + s1 * 6.28) * 0.18 * (1 - rho * 0.3);
    const width = rho => halfWidth * (1 - rho * 0.55) * (0.85 + 0.3 * Math.sin(rho * 7 + phase * 3 + s2 * 6.28));

    ctx.beginPath();
    for (let i = 0; i <= OIL_STEPS; i++) {
      const rho = i / OIL_STEPS;
      const a = base + OIL_CURL * rho + wander(rho);
      const taper = width(rho);
      const x = cx + Math.cos(a - taper) * radius * rho;
      const y = cy + Math.sin(a - taper) * radius * rho;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = OIL_STEPS; i >= 0; i--) {
      const rho = i / OIL_STEPS;
      const a = base + OIL_CURL * rho + wander(rho);
      const taper = width(rho);
      ctx.lineTo(cx + Math.cos(a + taper) * radius * rho, cy + Math.sin(a + taper) * radius * rho);
    }
    ctx.closePath();

    const tip = { x: cx + Math.cos(base + OIL_CURL) * radius, y: cy + Math.sin(base + OIL_CURL) * radius };
    const grad = ctx.createLinearGradient(cx, cy, tip.x, tip.y);
    grad.addColorStop(0, `hsla(${hue}, 90%, 55%, 0.12)`);
    grad.addColorStop(0.5, `hsla(${(hue + 35) % 360}, 90%, 60%, 0.45)`);
    grad.addColorStop(1, `hsla(${(hue + 75) % 360}, 90%, 55%, 0.08)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();

  // Finish smoothly into solid black, same as the other effects.
  if (p > 0.88) {
    ctx.globalAlpha = (p - 0.88) / 0.12;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
