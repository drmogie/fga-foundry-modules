import { MODULE_ID, SETTINGS, OBSCURE_STYLES, TRANSITION_TYPES, DEFAULT_TRANSITION_MS, DEFAULT_FADE_MS } from "./constants.js";
import * as SceneData from "./scene-data.js";
import { broadcastSection } from "./sync.js";

const NUDGE_STEP = 0.5; // percent of viewport per arrow-key press
const PORTRAIT_DROP_SHADOW = "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.65))";

/** Portrait's image filter for a given character section: the normal drop-shadow, or that
 *  drop-shadow plus a blur/silhouette when the section's Obscure style is Blur/Shadow
 *  (secret-informant / reveal-sequence use case). Fade and Teleport (added v2026.09.23.13)
 *  don't touch this at all — they hide the WHOLE portrait via opacity/clip-path instead (see
 *  portraitConcealment below), so their filter is just the plain drop-shadow, same as None.
 *  As of v2026.09.23.9 there's no separate "Start obscured" checkbox — obscureStyle "none" IS
 *  off, every other value is both on and that look. A section saved before that version may
 *  still carry the old `obscured` boolean in its data (nothing strips it); when that's
 *  explicitly `false` (the box was unchecked), it overrides obscureStyle to "none" so an old,
 *  deliberately-off section doesn't suddenly render blurred just because its (previously
 *  irrelevant) style field defaulted to "blur". */
function portraitFilter(section) {
  const style = section.obscured === false ? OBSCURE_STYLES.NONE : (section.obscureStyle ?? OBSCURE_STYLES.NONE);
  if (style === OBSCURE_STYLES.SHADOW) return `brightness(0) opacity(90%) ${PORTRAIT_DROP_SHADOW}`;
  if (style === OBSCURE_STYLES.BLUR) {
    const px = Math.max(0, Number(section.obscureBlurAmount) || 0);
    return px > 0 ? `blur(${px}px) ${PORTRAIT_DROP_SHADOW}` : PORTRAIT_DROP_SHADOW;
  }
  return PORTRAIT_DROP_SHADOW; // none, fade, teleport
}

/** Fade Out/Teleport Out rest fully HIDDEN; Fade In/Teleport In rest fully VISIBLE (same as
 *  None) — see OBSCURE_STYLES' own comment in constants.js for why these are directional
 *  one-shot effects rather than a persistent look like Blur/Shadow. Returned as
 *  { opacity, clipPercent }. clipPercent is how much of the image is clipped away from the
 *  TOP via CSS clip-path (see clipPathFor below): 0 = fully visible, 100 = fully hidden.
 *  Teleport's directional look (vanishing top-to-bottom as it conceals, materializing
 *  bottom-to-top as it reveals) falls straight out of animating this one percentage with a
 *  plain CSS transition — the same clip-path formula just runs forward or backward depending
 *  which way obscureStyle changed. `fade`/`teleport` (the bare, non-directional values
 *  v2026.09.23.13 briefly shipped, before this In/Out split) are honored as the equivalent
 *  "Out" — the one direction that version actually worked correctly — purely so a scene saved
 *  in that short window doesn't render wrong. Also reused as-is by #playMovementTransition
 *  below, which shares this exact visual language for the Movement subsection's Fade
 *  Movement/Teleport Movement transition types (a different setting — see TRANSITION_TYPES in
 *  constants.js — for MOVING an already-staged character, not obscuring/revealing one in
 *  place), so a character's resting obscured look and how it looks mid-move never fight. */
function portraitConcealment(section) {
  const style = section.obscured === false ? OBSCURE_STYLES.NONE : (section.obscureStyle ?? OBSCURE_STYLES.NONE);
  if (style === OBSCURE_STYLES.FADE_OUT || style === "fade") return { opacity: 0, clipPercent: 0 };
  if (style === OBSCURE_STYLES.TELEPORT_OUT || style === "teleport") return { opacity: 1, clipPercent: 100 };
  return { opacity: 1, clipPercent: 0 }; // none, blur, shadow, fadeIn, teleportIn
}

/** Whether this section's Obscure style is an ENTRANCE effect (Fade In/Teleport In) — the one
 *  case where a brand-new portrait's first appearance actually animates instead of popping in
 *  already in its resting look (see showCharacter's new-portrait branch). Exists as its own
 *  helper mainly so that check reads the same in showCharacter as it does conceptually here. */
function isEntranceObscureStyle(section) {
  const style = section.obscured === false ? OBSCURE_STYLES.NONE : (section.obscureStyle ?? OBSCURE_STYLES.NONE);
  return style === OBSCURE_STYLES.FADE_IN || style === OBSCURE_STYLES.TELEPORT_IN;
}

function clipPathFor(clipPercent) {
  return `inset(${clipPercent}% 0 0 0)`;
}

/** A section's own "Transition (ms)" Movement-subsection field, with a backward-compat
 *  fallback: a section saved before v2026.09.23.13 has no transitionMs field at all, and
 *  treating that as 0 would make every pre-existing Slide section suddenly snap instantly
 *  instead of animating at its original DEFAULT_TRANSITION_MS speed — so only an entirely
 *  missing field falls back; a deliberately-typed 0 (present, just zero) is honored as-is. */
function resolveTransitionMs(section) {
  const raw = section.transitionMs;
  const num = Number(raw);
  if (raw == null || !Number.isFinite(num)) return DEFAULT_TRANSITION_MS;
  return Math.max(0, num);
}

/**
 * The freeform on-screen staging layer. Portraits are keyed by each section's subjectKey
 * (see scene-data.js) — either a specific placed token or, for a "loose" character with no
 * token on this scene at all (a Group member staged straight off its actor's profile art),
 * the actor itself — so two tokens of the same actor, or a token-based and loose reference
 * to the same actor, all stage as independent portraits. Re-running an "Add character"
 * section for a subject that's already staged updates that same portrait in place
 * (position/flip/rotate/obscure state) instead of stacking a duplicate — an instant snap by
 * default, or an animated slide to the new spot when that character's own Position
 * Transitions toggle (Movement subsection, per Character section) is on (see showCharacter
 * below). Manual dragging is always an instant snap regardless of that setting.
 *
 * Only the GM can drag/select/edit a portrait (flip/rotate menu, keyboard nudge) — this
 * layer is broadcast to every connected client over the socket (see sync.js/playback.js),
 * so on a player's screen it's a plain, non-interactive display.
 */
class StagingViewImpl {
  #layer = null;
  #portraits = new Map(); // subjectKey -> { el, img, sceneId, section }
  // Subjects Stage Character has warmed up (see preloadCharacter below) but that have never
  // actually been shown yet — no entry in #portraits for them at all. Purely a "this subject
  // is ready, a Character Control may now originate its real first appearance" marker; carries
  // no position/look data of its own (that's the whole point — Stage Character never decides
  // what a character's first real appearance looks like anymore, Character Control does).
  // Cleared for a key the moment showCharacter actually creates that key's portrait.
  #preloaded = new Set();
  #selectedKey = null;
  #editorToolsVisible = true;
  #nudgeBroadcastTimer = null;
  #keydownBound = false;

  #ensureLayer() {
    if (this.#layer) return this.#layer;
    const el = document.createElement("div");
    el.id = "fga-sd-staging-layer";
    document.body.appendChild(el);
    this.#layer = el;
    this.#bindGlobalKeydown();
    return el;
  }

  setEditorToolsVisible(visible) {
    this.#editorToolsVisible = visible;
    this.#layer?.classList.toggle("tools-hidden", !visible);
  }

  /** Places (or, if that token is already staged, updates in place) a character portrait.
   *  `imgSrc` is resolved by the caller (playback.js, per the section's own "Image source"
   *  choice — token art vs. actor profile art) rather than assumed here, so this layer stays
   *  a dumb renderer; `actor` is still passed for its name (drag/select/etc. don't need it).
   *  A freshly-placed portrait always just appears at its position (only its opacity fades
   *  in) — but an already-staged portrait moving to a new position (e.g. this section got
   *  re-fired after a Position Lock was recalled) animates smoothly to the new spot instead
   *  of snapping there instantly, when THIS section's own Position Transitions toggle is on
   *  (section.transitionEnabled — per character, not a single module-wide switch). Editor
   *  button clicks alone (Quick Position, Lock buttons) never call this — they only update
   *  saved section data — so this only ever animates a REAL fire/Next/Auto Play move. */
  /** Stage Character's whole effect on a subject it's never shown before: warms the browser's
   *  image cache for their resolved art (so the real reveal, whenever a Character Control
   *  later gives them an actual position/look, has no fetch/decode hitch) and marks them
   *  "ready" via #preloaded — nothing appears on anyone's screen, no portrait element is
   *  created, no socket broadcast happens. A no-op if this key is already staged (showing) or
   *  already preloaded, so re-firing Stage Character on the same subject costs nothing. */
  preloadCharacter(key, imgSrc) {
    if (!key || this.#portraits.has(key) || this.#preloaded.has(key)) return;
    if (imgSrc) {
      const img = new Image();
      img.src = imgSrc;
    }
    this.#preloaded.add(key);
  }

  /** Whether this subject has been warmed up via preloadCharacter and is still waiting on its
   *  actual first appearance (not yet in #portraits). This is what lets Character Control
   *  originate a subject's real first look — see playback.js's own CHARACTER_CONTROL case —
   *  instead of only ever being able to adjust someone Stage Character (or Character) already
   *  rendered. False once the subject is actually showing (or was never preloaded at all). */
  isPreloaded(key) {
    return !!key && this.#preloaded.has(key);
  }

  showCharacter(sceneId, section, actor, imgSrc) {
    const layer = this.#ensureLayer();
    const key = SceneData.subjectKey(section);
    if (!key) return;
    // This subject is about to actually appear (or, if already appearing, be updated) — Stage
    // Character's preload bookkeeping has done its job, whichever it was for.
    this.#preloaded.delete(key);
    const isGM = game.user?.isGM;
    const src = imgSrc || actor?.img || "icons/svg/mystery-man.svg";

    let entry = this.#portraits.get(key);
    const isExistingPortrait = !!entry;

    // Figure out up front whether this fire is actually going to MOVE an already-staged
    // portrait, and if so with which kind of animation — a plain Slide (still just a CSS
    // left/top transition, applied at the bottom of this method) or a Fade/Teleport Movement
    // (a scripted two-phase hide-move-reveal sequence, #playMovementTransition) — so the
    // Obscure/Reveal crossfade block below can get out of the way instead of fighting it for
    // the same img.style.opacity/clip-path this same call.
    const nextLeft = `${section.x}%`;
    const nextTop = `${section.y}%`;
    const positionChanged = isExistingPortrait && (entry.el.style.left !== nextLeft || entry.el.style.top !== nextTop);
    const transitionsOn = isExistingPortrait && positionChanged && section.transitionEnabled;
    const isMovementTransition = transitionsOn &&
      (section.transitionType === TRANSITION_TYPES.FADE || section.transitionType === TRANSITION_TYPES.TELEPORT);
    const transitionMs = resolveTransitionMs(section);

    if (!entry) {
      const el = document.createElement("div");
      el.className = "fga-sd-portrait";
      el.dataset.subjectKey = key;
      if (!isGM) el.classList.add("viewer-only");
      el.tabIndex = isGM ? 0 : -1;

      // The wrapper (`el`) only ever centers itself on its x/y position — it never rotates
      // or flips, so the GM-only editor menu (a sibling of the image below, not a child of
      // the image) stays upright and in place no matter how the character is rotated/flipped.
      // Only the <img> itself carries the flip/rotate transform.
      el.style.transform = "translate(-50%, -50%)";

      const img = document.createElement("img");
      img.src = src;
      img.style.filter = portraitFilter(section);
      const conceal = portraitConcealment(section);
      if (isEntranceObscureStyle(section)) {
        // Fade In/Teleport In are entrance EFFECTS, not a resting look — unlike every other
        // Obscure style (always instant on first appearance), this brand-new portrait should
        // actually PLAY that reveal now: start fully hidden, then animate to its resting
        // (fully visible) look over this section's own obscureDurationMs, using the same
        // double-rAF technique the wrapper's own fadeInMs entrance fade uses below (needed so
        // the browser paints the "hidden" starting frame before the transition begins,
        // otherwise it'd jump straight to visible with nothing to animate from).
        const isTeleport = section.obscureStyle === OBSCURE_STYLES.TELEPORT_IN;
        img.style.opacity = isTeleport ? "1" : "0";
        img.style.clipPath = isTeleport ? clipPathFor(100) : clipPathFor(0);
        const ms = Math.max(0, section.obscureDurationMs ?? DEFAULT_FADE_MS);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          img.style.transition = isTeleport ? `clip-path ${ms}ms ease` : `opacity ${ms}ms ease`;
          img.style.opacity = String(conceal.opacity);
          img.style.clipPath = clipPathFor(conceal.clipPercent);
        }));
      } else {
        // Every other Obscure style is always instant on a brand-new portrait's first
        // appearance — matches the same rule filter/obscureDurationMs already followed,
        // now also covering opacity/clip-path for Fade Out/Teleport Out.
        img.style.opacity = String(conceal.opacity);
        img.style.clipPath = clipPathFor(conceal.clipPercent);
      }
      img.dataset.fgaConcealOpacity = String(conceal.opacity);
      img.dataset.fgaConcealClip = String(conceal.clipPercent);
      el.appendChild(img);

      if (isGM) {
        const menu = this.#buildEditorMenu(key);
        el.appendChild(menu);
        this.#bindDrag(key, el);
        el.addEventListener("click", ev => {
          if (ev.target.closest(".fga-sd-portrait-menu")) return;
          this.#select(key);
        });
        // A freshly-staged character starts with the editor tools overlay OFF, even if it was
        // left on from adjusting an earlier one — keeps the stage clean by default (e.g. while
        // screen-sharing) instead of the flip/rotate/scale menu popping up on every new
        // portrait. The GM can still turn it back on any time via the header toggle button.
        // Only fires the sync hook on an actual on->off transition, not on every add.
        if (this.#editorToolsVisible) {
          this.#editorToolsVisible = false;
          Hooks.callAll("fgaSceneDirectorEditorToolsAutoDisabled");
        }
      }

      layer.appendChild(el);
      entry = { el, img };
      this.#portraits.set(key, entry);

      // fade in (new portrait only — updates to an already-staged portrait snap instantly, no transition)
      el.style.opacity = "0";
      el.style.transition = `opacity ${Math.max(0, section.fadeInMs ?? 0)}ms ease`;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = "1"; }));
    } else {
      // Already staged: update the existing portrait's art/effects/position in place —
      // no duplicate, "add/replace" behavior.
      if (entry.clearTimer) {
        // A Clear Character for this same token was still fading out (fadeOutMs hasn't
        // elapsed yet) when this Add Character fired again — e.g. looping back around via
        // Next and re-adding a character shortly after clearing it. Cancel that pending
        // removal so it doesn't yank this portrait back out from under us once its timer
        // fires, and snap the portrait fully back to visible now — without this, the
        // portrait would silently stay at opacity 0 (only a brand-new portrait fades in)
        // and then still get deleted out of the map when the old timer went off, even
        // though it had just been "revived."
        clearTimeout(entry.clearTimer);
        entry.clearTimer = null;
        entry.el.style.transition = "none";
        entry.el.style.opacity = "1";
      }
      if (entry.moveTransitionTimer) {
        // An earlier Fade/Teleport Movement was still mid-flight (its snap-and-reveal timer
        // hadn't fired yet) when this fire landed — e.g. Next clicked again quickly. Cancel
        // it so it can't snap/reveal on top of whatever THIS fire is about to do instead.
        clearTimeout(entry.moveTransitionTimer);
        entry.moveTransitionTimer = null;
      }
      if (entry.img.src !== new URL(src, window.location.href).href) {
        entry.img.src = src;
      }
      const nextFilter = portraitFilter(section);
      if (isMovementTransition) {
        // A Fade/Teleport Movement is about to run its own hide-move-reveal sequence on this
        // same <img> (see #playMovementTransition below) — let it own
        // opacity/clip-path for this fire instead of also crossfading here first, which would
        // just fight it (a one-frame flash, immediately overridden). Filter still applies
        // normally, just without its own transition — the movement sequence never touches
        // filter, only opacity/clip-path.
        entry.img.style.transition = "none";
        entry.img.style.filter = nextFilter;
      } else {
        // If this fire actually changed the obscure/reveal look (obscureStyle/
        // obscureBlurAmount — the only fields portraitFilter/portraitConcealment read),
        // animate the change over this section's own obscureDurationMs instead of a hard cut.
        // A fire that leaves those fields untouched (see mergeCharacterSection) always
        // computes the same filter/concealment it already had, so this naturally does nothing
        // extra the rest of the time — no separate "was obscured touched?" check needed. This
        // is what used to be the standalone "Reveal Character" section type's whole job, now
        // just an ordinary Character Control fire.
        const nextConceal = portraitConcealment(section);
        const filterChanged = nextFilter !== entry.img.style.filter;
        const concealChanged = String(nextConceal.opacity) !== entry.img.dataset.fgaConcealOpacity ||
          String(nextConceal.clipPercent) !== entry.img.dataset.fgaConcealClip;
        if (filterChanged || concealChanged) {
          const ms = Math.max(0, section.obscureDurationMs ?? DEFAULT_FADE_MS);
          entry.img.style.transition = `filter ${ms}ms ease, opacity ${ms}ms ease, clip-path ${ms}ms ease`;
        } else {
          entry.img.style.transition = "none";
        }
        entry.img.style.filter = nextFilter;
        entry.img.style.opacity = String(nextConceal.opacity);
        entry.img.style.clipPath = clipPathFor(nextConceal.clipPercent);
        entry.img.dataset.fgaConcealOpacity = String(nextConceal.opacity);
        entry.img.dataset.fgaConcealClip = String(nextConceal.clipPercent);
      }
    }

    entry.sceneId = sceneId;
    entry.section = section;
    this.#applyTransform(entry, section);

    // Per-CHARACTER, not a single module-wide switch — each Character section carries its own
    // transitionEnabled/transitionType/transitionMs (see scene-data.js's makeSection CHARACTER
    // case and the Movement subsection in scene-editor.hbs), seeded from Config Settings'
    // "default for new characters" versions when the section was first added.
    if (isMovementTransition) {
      // Fade Movement/Teleport Movement: hide at the OLD spot, snap position while hidden,
      // reveal at the NEW spot — see #playMovementTransition. left/top are never
      // CSS-transitioned for this type (unlike Slide below); all the visible motion comes
      // from the opacity/clip-path animation either side of an instant, invisible snap.
      entry.el.style.transition = "";
      this.#playMovementTransition(entry, section, nextLeft, nextTop, transitionMs);
    } else {
      if (transitionsOn) {
        // Slide is the only remaining animated type — an unrecognized/future transitionType
        // falls back to an instant snap rather than erroring.
        entry.el.style.transition = `left ${transitionMs}ms ease, top ${transitionMs}ms ease`;
      } else if (isExistingPortrait) {
        // No animated move this time (unchanged position, or the setting's off) — clear any
        // slide transition left over from an earlier move so this update, and any drag that
        // follows it, are instant again. Never touches a brand-new portrait's own opacity
        // fade-in transition (set at creation above, and not yet applied via rAF at this point).
        entry.el.style.transition = "";
      }
      entry.el.style.left = nextLeft;
      entry.el.style.top = nextTop;
    }
    entry.el.classList.toggle("tools-hidden", !this.#editorToolsVisible);
  }

  /** Fade Movement/Teleport Movement (Movement subsection "Movement type", added
   *  v2026.09.23.13) — unlike Slide, which just animates left/top directly, these move an
   *  already-staged character by hiding it at the OLD spot, snapping straight to the NEW spot
   *  while it's invisible, then revealing it there. Each of those two phases gets the FULL
   *  `ms` (the section's own "Transition (ms)" field), so the whole move takes 2x that value
   *  — the same setting Slide would take just 1x of for the same distance. Fade uses a plain
   *  opacity crossfade; Teleport reuses portraitConcealment's clip-path wipe (the same visual
   *  language as the Teleport Obscure style) for its directional "materializing" look instead.
   *  Ends by handing off to whatever the section's own resting Obscure style should actually
   *  look like (not assumed "fully visible") — so a character that's ALSO meant to arrive
   *  obscured (e.g. Obscure style Blur) still ends up looking right once this move settles. */
  #playMovementTransition(entry, section, nextLeft, nextTop, ms) {
    const img = entry.img;
    const isTeleport = section.transitionType === TRANSITION_TYPES.TELEPORT;
    const nextConceal = portraitConcealment(section);
    const animatedProp = isTeleport ? "clip-path" : "opacity";
    // Only the animated property needs to actually move each phase — the OTHER one (whichever
    // Fade/Teleport doesn't use) just sits at its already-settled value the whole time, so it
    // never needs touching here at all.
    const hide = () => { if (isTeleport) img.style.clipPath = clipPathFor(100); else img.style.opacity = "0"; };

    // Phase 1 — "out": hide at the OLD position (wherever el.style.left/top still are).
    img.style.transition = `${animatedProp} ${ms}ms ease`;
    void img.offsetWidth; // force the transition to register before the value change below
    hide();

    entry.moveTransitionTimer = setTimeout(() => {
      entry.moveTransitionTimer = null;

      // Snap to the NEW position while fully hidden, then start phase 2 — "in": reveal there.
      entry.el.style.transition = "";
      entry.el.style.left = nextLeft;
      entry.el.style.top = nextTop;
      img.style.transition = "none";
      hide();
      void img.offsetWidth; // force the "still hidden" state above to register before animating away from it

      img.style.transition = `${animatedProp} ${ms}ms ease`;
      img.style.clipPath = clipPathFor(nextConceal.clipPercent);
      img.style.opacity = String(nextConceal.opacity);
      img.dataset.fgaConcealOpacity = String(nextConceal.opacity);
      img.dataset.fgaConcealClip = String(nextConceal.clipPercent);
    }, ms);
  }

  /** The currently-applied EFFECTIVE section for a staged subject — the merged result of
   *  every Character Control fire so far for them (see scene-data.js's mergeCharacterSection),
   *  not necessarily any single section's raw saved data — or null if that subject isn't on
   *  stage at all right now. playback.js reads this as the merge base for the NEXT fire. */
  getAppliedSection(key) {
    return key ? (this.#portraits.get(key)?.section ?? null) : null;
  }

  /** "Clear Character" section: fades out and removes every currently-staged portrait the GM
   *  checked off (section.targetKeys — a list of subjectKeys, not a single character; see
   *  scene-data.js's makeSection CLEAR_CHARACTER case), each independently. A checked target
   *  that isn't actually staged right now (already cleared, or never added) is silently
   *  skipped — nothing to clear. */
  clearCharacter(section) {
    const keys = Array.isArray(section.targetKeys) ? section.targetKeys : [];
    for (const key of keys) {
      const entry = key ? this.#portraits.get(key) : null;
      if (!entry) continue;
      // Defensive: if this token was already mid-clear (double-fired Clear Character), cancel
      // the earlier pending removal before scheduling a new one, so only the latest one runs.
      if (entry.clearTimer) clearTimeout(entry.clearTimer);
      // Also cancel a still-running Fade/Teleport Movement (#playMovementTransition) — its
      // own timer would otherwise snap/reveal this portrait moments after we've already
      // started fading it out for removal.
      if (entry.moveTransitionTimer) {
        clearTimeout(entry.moveTransitionTimer);
        entry.moveTransitionTimer = null;
      }
      const fadeMs = Math.max(0, section.fadeOutMs ?? 0);
      entry.el.style.transition = `opacity ${fadeMs}ms ease`;
      entry.el.style.opacity = "0";
      entry.clearTimer = setTimeout(() => {
        // If this token got re-added (showCharacter) before this timer fired, that call
        // already cancelled us and cleared entry.clearTimer — this callback only runs when
        // the fade-out completed with nothing reviving it in the meantime, so it's still
        // safe to actually remove/delete here.
        entry.el.remove();
        this.#portraits.delete(key);
        if (this.#selectedKey === key) this.#selectedKey = null;
      }, fadeMs);
    }
  }

  clearAll() {
    for (const [, entry] of this.#portraits) entry.el.remove();
    this.#portraits.clear();
    this.#selectedKey = null;
  }

  /** Which third of the screen a staged portrait currently sits in ("left"/"center"/"right"),
   *  used by the speech bubble's tail to loosely point toward whoever's talking. Matches the
   *  same thirds the "Quick Position" buttons snap to (x=18/50/82). Defaults to "center" when
   *  that subject isn't currently staged at all. `key` is a subjectKey (see scene-data.js). */
  getTailBucket(key) {
    const entry = key ? this.#portraits.get(key) : null;
    const x = entry?.section?.x;
    if (x == null) return "center";
    if (x < 33.34) return "left";
    if (x > 66.66) return "right";
    return "center";
  }

  /** Applies flip/rotate to the portrait's <img> only — never to the wrapper `el` — so the
   *  GM-only editor menu (a sibling of the image, positioned relative to `el`) never inherits
   *  the rotation/flip and always reads upright, right side up, wherever it's anchored. */
  #applyTransform(entry, section) {
    const flipX = section.flipH ? -1 : 1;
    const flipY = section.flipV ? -1 : 1;
    const scale = Number(section.scale) || 1;
    entry.img.style.transform = `scale(${flipX * scale}, ${flipY * scale}) rotate(${section.rotation ?? 0}deg)`;
  }

  #select(key) {
    if (this.#selectedKey && this.#selectedKey !== key) {
      this.#portraits.get(this.#selectedKey)?.el.classList.remove("selected");
    }
    this.#selectedKey = key;
    const entry = this.#portraits.get(key);
    entry?.el.classList.add("selected");
    entry?.el.focus({ preventScroll: true });
  }

  /** GM-only flip/rotate menu. Always reads/writes the CURRENT section for this token (via
   *  the live portraits map) rather than a value captured at build time, so it keeps
   *  targeting the right timeline entry even after this portrait's been updated in place
   *  by a later "Add character" section for the same token. */
  #buildEditorMenu(key) {
    const menu = document.createElement("div");
    menu.className = "fga-sd-portrait-menu";
    menu.innerHTML = `
      <label title="Flip horizontal"><i class="fa-solid fa-arrows-left-right"></i>
        <input type="checkbox" data-fga-flip="h" />
      </label>
      <label title="Rotation"><i class="fa-solid fa-rotate"></i>
        <input type="number" step="1" data-fga-rotation />
      </label>
      <label title="Flip vertical"><i class="fa-solid fa-arrows-up-down"></i>
        <input type="checkbox" data-fga-flip="v" />
      </label>
      <label title="Scale"><i class="fa-solid fa-magnifying-glass"></i>
        <input type="range" min="0.25" max="3" step="0.05" data-fga-scale />
      </label>
    `;
    const syncInputsFromSection = () => {
      const section = this.#portraits.get(key)?.section;
      if (!section) return;
      menu.querySelector('[data-fga-flip="h"]').checked = !!section.flipH;
      menu.querySelector('[data-fga-flip="v"]').checked = !!section.flipV;
      menu.querySelector("[data-fga-rotation]").value = section.rotation ?? 0;
      menu.querySelector("[data-fga-scale]").value = Number(section.scale) || 1;
    };
    menu.addEventListener("pointerenter", syncInputsFromSection);
    syncInputsFromSection();

    menu.querySelector('[data-fga-flip="h"]').addEventListener("change", async ev => {
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      entry.section.flipH = ev.target.checked;
      this.#applyTransform(entry, entry.section);
      await SceneData.updateSection(entry.sceneId, entry.section.id, {
        flipH: entry.section.flipH,
        touchedFields: SceneData.withTouchedFields(entry.section, "flipH")
      });
      broadcastSection(entry.section, entry.sceneId);
    });
    menu.querySelector('[data-fga-flip="v"]').addEventListener("change", async ev => {
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      entry.section.flipV = ev.target.checked;
      this.#applyTransform(entry, entry.section);
      await SceneData.updateSection(entry.sceneId, entry.section.id, {
        flipV: entry.section.flipV,
        touchedFields: SceneData.withTouchedFields(entry.section, "flipV")
      });
      broadcastSection(entry.section, entry.sceneId);
    });
    menu.querySelector("[data-fga-rotation]").addEventListener("change", async ev => {
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      entry.section.rotation = Number(ev.target.value) || 0;
      this.#applyTransform(entry, entry.section);
      await SceneData.updateSection(entry.sceneId, entry.section.id, {
        rotation: entry.section.rotation,
        touchedFields: SceneData.withTouchedFields(entry.section, "rotation")
      });
      broadcastSection(entry.section, entry.sceneId);
    });
    // "input" fires continuously while dragging the slider — live preview only, no
    // persistence/broadcast spam. "change" fires once on release — that's when it's saved
    // and pushed to everyone else, same persist-on-release pattern used for drag/nudge.
    menu.querySelector("[data-fga-scale]").addEventListener("input", ev => {
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      entry.section.scale = Number(ev.target.value) || 1;
      this.#applyTransform(entry, entry.section);
    });
    menu.querySelector("[data-fga-scale]").addEventListener("change", async ev => {
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      entry.section.scale = Number(ev.target.value) || 1;
      this.#applyTransform(entry, entry.section);
      await SceneData.updateSection(entry.sceneId, entry.section.id, {
        scale: entry.section.scale,
        touchedFields: SceneData.withTouchedFields(entry.section, "scale")
      });
      broadcastSection(entry.section, entry.sceneId);
    });
    menu.addEventListener("pointerdown", ev => ev.stopPropagation()); // don't start a drag from the menu
    return menu;
  }

  #bindDrag(key, el) {
    let dragging = false;
    el.addEventListener("pointerdown", ev => {
      if (ev.target.closest(".fga-sd-portrait-menu")) return;
      dragging = true;
      this.#select(key);
      el.setPointerCapture(ev.pointerId);
      // Manual dragging is always an instant snap-to-cursor, never animated — clear any slide
      // transition a prior transitioned move (see showCharacter) left on this element, so it
      // doesn't lag behind the pointer here.
      el.style.transition = "";
    });
    el.addEventListener("pointermove", ev => {
      if (!dragging) return;
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      const xPct = (ev.clientX / window.innerWidth) * 100;
      const yPct = (ev.clientY / window.innerHeight) * 100;
      entry.section.x = Math.max(0, Math.min(100, xPct));
      entry.section.y = Math.max(0, Math.min(100, yPct));
      el.style.left = `${entry.section.x}%`;
      el.style.top = `${entry.section.y}%`;
    });
    const endDrag = async ev => {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(ev.pointerId); } catch (_e) { /* noop */ }
      const entry = this.#portraits.get(key);
      if (!entry?.section) return;
      await SceneData.updateSection(entry.sceneId, entry.section.id, {
        x: entry.section.x,
        y: entry.section.y,
        touchedFields: SceneData.withTouchedFields(entry.section, "x", "y")
      });
      // Only broadcast the final position, not every pointermove during the drag itself —
      // same reasoning as only persisting on release: continuous per-pixel socket traffic
      // would be excessive, and everyone else only needs to see where it ended up.
      broadcastSection(entry.section, entry.sceneId);
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }

  #bindGlobalKeydown() {
    if (this.#keydownBound) return;
    this.#keydownBound = true;
    window.addEventListener("keydown", ev => {
      if (!game.user?.isGM) return;
      if (!this.#selectedKey) return;
      if (!game.settings.get(MODULE_ID, SETTINGS.KEYBOARD_NUDGE_ENABLED)) return;
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrowKeys.includes(ev.key)) return;
      // Only hijack the key while a staged portrait is actively selected — otherwise let
      // Foundry's own canvas handler move tokens on the board as normal.
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const entry = this.#portraits.get(this.#selectedKey);
      if (!entry?.section) return;
      const section = entry.section;
      if (ev.key === "ArrowUp") section.y = Math.max(0, section.y - NUDGE_STEP);
      if (ev.key === "ArrowDown") section.y = Math.min(100, section.y + NUDGE_STEP);
      if (ev.key === "ArrowLeft") section.x = Math.max(0, section.x - NUDGE_STEP);
      if (ev.key === "ArrowRight") section.x = Math.min(100, section.x + NUDGE_STEP);
      entry.el.style.left = `${section.x}%`;
      entry.el.style.top = `${section.y}%`;
      SceneData.updateSection(entry.sceneId, section.id, {
        x: section.x,
        y: section.y,
        touchedFields: SceneData.withTouchedFields(section, "x", "y")
      });
      // Debounced rather than firing a broadcast on every single key repeat — holding an
      // arrow key down can fire this several times a second, and everyone else only needs
      // to see where the portrait lands once the GM stops nudging, not every intermediate step.
      clearTimeout(this.#nudgeBroadcastTimer);
      this.#nudgeBroadcastTimer = setTimeout(() => broadcastSection(section, entry.sceneId), 120);
    }, { capture: true });

    // Clicking empty space deselects.
    window.addEventListener("pointerdown", ev => {
      if (!ev.target.closest?.(".fga-sd-portrait")) {
        if (this.#selectedKey) {
          this.#portraits.get(this.#selectedKey)?.el.classList.remove("selected");
          this.#selectedKey = null;
        }
      }
    });
  }
}

export const StagingView = new StagingViewImpl();
