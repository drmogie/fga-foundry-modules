import { SECTION_TYPES, LINE_VISIBILITY } from "./constants.js";
import { StagingView } from "./staging-view.js";
import { CaptionBar } from "./caption-bar.js";
import { SpeechBubble } from "./speech-bubble.js";
import { BackgroundEffect } from "./background-effect.js";
import { broadcastSection, broadcastClearAll } from "./sync.js";
import { subjectKey, resolveSubject, mergeCharacterSection, makeSection, getDefaultImageSource } from "./scene-data.js";

/** Targeting only makes sense for a real placed token on the board (there's a Token
 *  placeable to call setTarget on) — a no-op for a "loose" actor-only character with no
 *  token here, same as if targeting were simply unavailable for it. */
async function targetToken(tokenDoc) {
  const token = tokenDoc?.object;
  if (!token) return;
  token.setTarget(true, { user: game.user, releaseOthers: true });
}

async function postChatLine(tokenDoc, actor, text) {
  const speaker = tokenDoc
    ? ChatMessage.getSpeaker({ token: tokenDoc.object ?? tokenDoc })
    : ChatMessage.getSpeaker({ actor });
  await ChatMessage.create({ speaker, content: text });
}

/** Which image a Character section's staged portrait actually shows — the token's own art
 *  (its map icon, `texture.src`) or the actor's profile/portrait art (`actor.img`), per that
 *  section's own "Image source" choice. Falls back to whichever of the two is actually set if
 *  the preferred one is missing, then to Foundry's default mystery-man icon. */
function resolveImageSrc(section, tokenDoc, actor) {
  const tokenImg = tokenDoc?.texture?.src;
  const profileImg = actor?.img;
  if (section.imageSource === "token") return tokenImg || profileImg || "icons/svg/mystery-man.svg";
  return profileImg || tokenImg || "icons/svg/mystery-man.svg";
}

/** A Private line's visual: either the closed-caption bar, or — if this line has its own
 *  "Bubble" checkbox on — the fixed speech bubble, with its tail pointed toward whichever
 *  third of the screen the speaking character is currently staged in. Only one of the two is
 *  ever showing at once; switching modes (or firing a new line) clears whichever was up. */
function showLineVisual(section, actor) {
  if (section.bubbleEnabled) {
    CaptionBar.clear();
    SpeechBubble.show(actor.name, section.text ?? "", StagingView.getTailBucket(subjectKey(section)));
  } else {
    SpeechBubble.clear();
    CaptionBar.show(actor.name, section.text ?? "");
  }
}

/**
 * The purely visual side of a section: staged portraits, caption text, background effect.
 * Safe to replay on every client. Targeting and chat posting are deliberately NOT part of
 * this — those are real Foundry operations (Token#setTarget, ChatMessage.create) that
 * already broadcast to every connected client on their own, so redoing them here would
 * double them up. Used both for the GM's own local render and, via the socket, to mirror
 * the same visual on every player's screen.
 */
function applyVisual(section, sceneId) {
  switch (section.type) {
    case SECTION_TYPES.CHARACTER: {
      const { tokenDoc, actor } = resolveSubject(section);
      if (!actor) return;
      // "Character Control": only this section's explicitly-touched fields actually change
      // anything when the subject is already on stage — everything else keeps showing
      // whatever it's already showing (see scene-data.js's mergeCharacterSection). This is
      // also what a "reveal" is now: just a Character Control fire that touches `obscured`
      // (see StagingView.showCharacter's filter-transition logic for the animated part) —
      // there's no separate Reveal Character section type anymore.
      const key = subjectKey(section);
      const prior = StagingView.getAppliedSection(key);
      const effective = mergeCharacterSection(prior, section);
      StagingView.showCharacter(sceneId, effective, actor, resolveImageSrc(effective, tokenDoc, actor));
      return;
    }
    case SECTION_TYPES.CHARACTER_CONTROL: {
      // Re-adjusts an already on-stage character (flip/rotation/movement-transition/lock
      // recall) — OR, as of v2026.09.24.4, actually ORIGINATES a subject's real first
      // appearance, but only for one Stage Character has already warmed up (StagingView's
      // #preloaded — see preloadCharacter/isPreloaded). Firing this for a subject that's
      // neither already staged NOR preloaded is still a no-op: skip entirely rather than
      // falling through to a full snapshot apply for someone nobody prepared at all. When
      // there IS a prior, mergeCharacterSection only applies this section's own touched fields
      // (everything else keeps showing whatever it already looked like); when there's no
      // prior but the subject was preloaded, mergeCharacterSection's own "no prior" branch
      // returns this section's fields as-is — a genuine first appearance, using THIS section's
      // own position/look instead of Stage Character's bare defaults.
      const { tokenDoc, actor } = resolveSubject(section);
      if (!actor) return;
      const key = subjectKey(section);
      const prior = key ? StagingView.getAppliedSection(key) : null;
      if (!prior && !StagingView.isPreloaded(key)) return;
      const effective = mergeCharacterSection(prior, section);
      StagingView.showCharacter(sceneId, effective, actor, resolveImageSrc(effective, tokenDoc, actor));
      return;
    }
    case SECTION_TYPES.STAGE_CHARACTER: {
      // As of v2026.09.24.4, firing this card never itself makes anyone appear — per Mogie:
      // "Stage is there to preload the character but the character shouldn't need fired."
      // For each checked key: if it's already on stage (prior exists), there's nothing to do —
      // it's already showing whatever it already looked like, exactly as before. If it's not
      // on stage yet, this only warms up its art in the browser's image cache and marks it
      // "preloaded" (see StagingView.preloadCharacter) — no portrait is created, nothing is
      // broadcast, nobody sees anything change. That subject's actual first appearance now has
      // to come from a Character Control section firing for it later (see this file's own
      // CHARACTER_CONTROL case, which originates a fresh look for a preloaded-but-not-yet-shown
      // subject instead of no-op'ing) — Stage Character by itself is purely prep work now, so a
      // Stage Character card with no Character Control after it for a given subject will never
      // actually show that subject. A selected key that no longer resolves to a real actor (its
      // token/actor was deleted since it was checked) is skipped, not an error — the rest of
      // the batch still preloads normally.
      const keys = Array.isArray(section.selectedKeys) ? section.selectedKeys : [];
      for (const key of keys) {
        if (StagingView.getAppliedSection(key)) continue; // already on stage — nothing to do
        const pseudo = key.startsWith("t:")
          ? makeSection(SECTION_TYPES.CHARACTER, { tokenId: key.slice(2) })
          : makeSection(SECTION_TYPES.CHARACTER, { actorId: key.slice(2) });
        const { tokenDoc, actor } = resolveSubject(pseudo);
        if (!actor) continue;
        // Best-effort guess at which art to warm up — the disposition-based default (see
        // getDefaultImageSource's own comment). The Character Control that eventually gives
        // this subject its real first appearance is free to pick a different Image Source than
        // this; preloading the "usual" one just means the common case has nothing to fetch.
        pseudo.imageSource = getDefaultImageSource(tokenDoc, actor);
        StagingView.preloadCharacter(key, resolveImageSrc(pseudo, tokenDoc, actor));
      }
      return;
    }
    case SECTION_TYPES.LINE: {
      // Public lines hand the visual off to chat (and, if installed, FGA Character Popup
      // reacting to that chat message on its own — Scene Director doesn't need to know it's
      // there) instead of showing Scene Director's own caption. Private lines are the
      // reverse: no chat post, so Scene Director's caption is the only visual. See
      // runLine() below for the GM-side half of this (the actual chat post).
      if (section.visibility === LINE_VISIBILITY.PUBLIC) return;
      const { actor } = resolveSubject(section);
      if (!actor) return;
      showLineVisual(section, actor);
      return;
    }
    case SECTION_TYPES.CLEAR_CHARACTER:
      StagingView.clearCharacter(section);
      return;
    case SECTION_TYPES.CLEAR_TEXT:
      CaptionBar.clear();
      SpeechBubble.clear();
      return;
    case SECTION_TYPES.BACKGROUND_EFFECT:
      BackgroundEffect.apply(section);
      return;
    case SECTION_TYPES.CLEAR_BACKGROUND_EFFECT:
      BackgroundEffect.clear(section.durationMs);
      return;
    case SECTION_TYPES.CLEAR_SCENE:
      // Same full reset as the standalone "Clear Scene" button (mirrorClearAll below),
      // just reachable as a timeline step — dispatched here so it flows through the same
      // per-section broadcast every other section already uses (playSection/fireLineSection
      // -> broadcastSection -> every other client's mirrorSection -> applyVisual, right back
      // to this same case), rather than needing its own special socket message.
      mirrorClearAll();
      return;
    case SECTION_TYPES.PAUSE:
      // A pure Auto Play control marker — no visual/playback effect. Manually stepping past
      // it (Next, or its own Fire button) is a deliberate no-op; only Auto Play's own step
      // loop (scene-editor.js's #autoStep) treats reaching one specially, by halting instead
      // of calling playSection/applyVisual on it at all. Broadcasting this no-op to other
      // clients (playSection's own broadcastSection call, below applyVisual) is harmless.
      return;
    default:
      console.warn("FGA Scene Director | Unknown section type in playback:", section.type);
  }
}

/** Called on every OTHER connected client when the GM broadcasts a section over the socket. */
export function mirrorSection(section, sceneId) {
  applyVisual(section, sceneId);
}

/** Called on every other client when the GM broadcasts a full scene/live-staging reset. */
export function mirrorClearAll() {
  StagingView.clearAll();
  CaptionBar.clear();
  SpeechBubble.clear();
  BackgroundEffect.clear(0);
}

async function runLine(section) {
  const { tokenDoc, actor } = resolveSubject(section);
  if (!actor) {
    ui.notifications?.warn("FGA Scene Director | This line has no character selected.");
    return;
  }
  // A no-op for a loose (token-less) character — see targetToken's own comment.
  if (section.autoTarget !== false) await targetToken(tokenDoc);
  if (section.visibility === LINE_VISIBILITY.PUBLIC) {
    // Public: post to chat and step out of the way — this is the hand-off point for FGA
    // Character Popup, if it's installed and its own GM Rules pick this message up. Scene
    // Director never checks whether that module exists; if it's not installed, or its
    // rules don't match, the plain chat message is simply what the players see.
    await postChatLine(tokenDoc, actor, section.text ?? "");
  } else {
    // Private: no chat post, so Scene Director's own caption/bubble is the (only) visual.
    showLineVisual(section, actor);
  }
}

/** Dispatch a single timeline section during Next-button playback (GM side only): runs
 *  targeting/chat for a line, applies the visual locally, then broadcasts the visual to
 *  every other connected client. */
export async function playSection(section, sceneId) {
  if (section.type === SECTION_TYPES.LINE) {
    await runLine(section);
  } else {
    applyVisual(section, sceneId);
  }
  broadcastSection(section, sceneId);
}

/** The manual "fire now" button on a line — same effect as playing it via Next,
 *  usable standalone/out of order for quick reuse. */
export async function fireLineSection(section, sceneId) {
  if (section.type !== SECTION_TYPES.LINE) return playSection(section, sceneId);
  await runLine(section);
  broadcastSection(section, sceneId);
}

/** GM's "Clear Scene" button: wipes the LIVE staged portraits/caption/background effect
 *  (not just the saved timeline data) on this client and every connected client. */
export function resetLiveScene() {
  mirrorClearAll();
  broadcastClearAll();
}

/** GM utility ("Show All Characters"): stages every character that appears anywhere in this
 *  scene's timeline, all at once, using each token's most recently-defined Add-character
 *  section (position/flip/rotate/obscure) — lets the GM preview the whole cast's look
 *  without stepping through the timeline one section at a time. Broadcasts each portrait to
 *  every connected client, same as Next/Fire. Ignores Clear Character sections entirely —
 *  the point is to show everyone who's ever staged in this scene, not simulate the final
 *  state after every clear. */
export function showAllCharacters(scene, sceneId) {
  const latestBySubject = new Map();
  for (const s of scene.sections) {
    const key = s.type === SECTION_TYPES.CHARACTER ? subjectKey(s) : null;
    if (key) latestBySubject.set(key, s);
  }
  for (const section of latestBySubject.values()) {
    applyVisual(section, sceneId);
    broadcastSection(section, sceneId);
  }
}
