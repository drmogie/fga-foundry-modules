import { MODULE_ID, SETTINGS, FLAGS, MAP_FOLDER_NAME, BUNDLED_MAPS_PATH } from "./constants.js";
import { isMapFile, isVideoFile, parseMapName } from "./logic.js";
import { stageScene, bringToFront } from "./battle.js";

function picker() {
  return foundry.applications.apps.FilePicker.implementation;
}

function defaultGrid() {
  return game.settings.get(MODULE_ID, SETTINGS.DEFAULT_GRID) || 100;
}

/* ---------- helpers ---------- */

function loadDimensions(src) {
  return new Promise((resolve, reject) => {
    if (isVideoFile(src)) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error(`Could not read the video ${src}`));
      video.src = src;
    } else {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error(`Could not read the image ${src}`));
      img.src = src;
    }
  });
}

async function getMapFolder() {
  let folder = game.folders.find(f => f.type === "Scene" && f.name === MAP_FOLDER_NAME);
  if (!folder) folder = await Folder.create({ name: MAP_FOLDER_NAME, type: "Scene" });
  return folder;
}

/* ---------- create one battlefield ---------- */

export async function createBattleScene(src, { name, grid }) {
  const existing = game.scenes.find(s => s.getFlag(MODULE_ID, FLAGS.SOURCE) === src);
  if (existing) {
    await stageScene(existing.id);
    return { scene: existing, created: false };
  }

  const { width, height } = await loadDimensions(src);
  const folder = await getMapFolder();
  const scene = await Scene.create({
    name,
    folder: folder.id,
    background: { src },
    width,
    height,
    padding: 0,
    navigation: false,
    grid: { size: grid, distance: 5, units: "ft" },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: src } }
  });

  try {
    const thumb = await scene.createThumbnail({ img: src });
    if (thumb?.thumb) await scene.update({ thumb: thumb.thumb });
  } catch (err) {
    console.warn(`${MODULE_ID} | thumbnail failed for ${name}`, err);
  }

  await stageScene(scene.id);
  return { scene, created: true };
}

/* ---------- 1. Pick one image ---------- */

export function makeFromImage() {
  return new Promise(resolve => {
    new (picker())({
      type: "image",
      callback: async path => {
        const guess = parseMapName(path, defaultGrid());
        const answer = await foundry.applications.api.DialogV2.prompt({
          window: { title: "New battlefield" },
          content: `
            <div class="form-group"><label>Name</label>
              <input type="text" name="mapName" value="${foundry.utils.escapeHTML(guess.name)}"></div>
            <div class="form-group"><label>Grid size (px per square)</label>
              <input type="number" name="mapGrid" min="50" max="1000" value="${guess.grid}"></div>`,
          ok: {
            label: "Create battlefield",
            callback: (event, button) => ({
              name: button.form.elements.mapName.value.trim(),
              grid: Number(button.form.elements.mapGrid.value)
            })
          },
          rejectClose: false
        });
        if (!answer?.name) return resolve(null);
        try {
          const grid = Math.min(1000, Math.max(50, Math.round(answer.grid || guess.grid)));
          const result = await createBattleScene(path, { name: answer.name, grid });
          await bringToFront([result.scene.id]);
          ui.notifications.info(
            result.created ? `Battlefield ${answer.name} created and staged.` : `${answer.name} was already there. Staged it.`
          );
          resolve(result);
        } catch (err) {
          console.error(`${MODULE_ID} | make from image failed`, err);
          ui.notifications.error(`FGA Battle Director: ${err.message}`);
          resolve(null);
        }
      }
    }).render(true);
  });
}

/* ---------- 2 and 3. A whole folder ---------- */

async function importFiles(files) {
  const maps = files.filter(isMapFile);
  if (!maps.length) {
    ui.notifications.warn("No map images found in that folder.");
    return { made: 0, skipped: 0, failed: 0 };
  }
  let made = 0;
  let skipped = 0;
  let failed = 0;
  const loadedIds = [];
  ui.notifications.info(`Importing ${maps.length} map(s)...`);
  for (const src of maps) {
    const { name, grid } = parseMapName(src, defaultGrid());
    try {
      const result = await createBattleScene(src, { name, grid });
      if (result.created) made++;
      else skipped++;
      loadedIds.push(result.scene.id);
    } catch (err) {
      failed++;
      console.error(`${MODULE_ID} | import failed for ${src}`, err);
    }
  }
  if (loadedIds.length) await bringToFront(loadedIds);
  ui.notifications.info(
    `Maps done. ${made} new, ${skipped} already there${failed ? `, ${failed} failed (see console)` : ""}.`
  );
  return { made, skipped, failed };
}

export function importFolder() {
  return new Promise(resolve => {
    new (picker())({
      type: "folder",
      callback: async (path, fp) => {
        try {
          const source = fp?.activeSource ?? "data";
          const listing = await picker().browse(source, path);
          resolve(await importFiles(listing.files ?? []));
        } catch (err) {
          console.error(`${MODULE_ID} | folder import failed`, err);
          ui.notifications.error(`FGA Battle Director: ${err.message}`);
          resolve(null);
        }
      }
    }).render(true);
  });
}

export async function loadBundled() {
  try {
    const listing = await picker().browse("data", BUNDLED_MAPS_PATH);
    return await importFiles(listing.files ?? []);
  } catch (err) {
    console.error(`${MODULE_ID} | bundled maps failed`, err);
    ui.notifications.warn(`No bundled maps yet. Drop images into ${BUNDLED_MAPS_PATH} and try again.`);
    return null;
  }
}
