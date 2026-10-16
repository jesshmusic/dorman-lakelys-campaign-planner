// Scene thumbnails sent to Dungeon Master Guru, so a campaign's maps show
// there while Foundry is closed. No Foundry globals, so it can be tested in Node.

// What Scene#createThumbnail makes: about 30-70 KB a scene
export const THUMBNAIL = { width: 640, height: 360, format: "image/webp", quality: 0.8 };

// Bump to send every thumbnail again, e.g. after changing THUMBNAIL
const THUMBNAIL_FORMAT = 1;

const SCENE_UUID = /^Scene\.[A-Za-z0-9]{16}$/;

/**
 * The scenes a campaign uses: each place's map and each session's maps, once each.
 * @param {{ locations?: object[], sessions?: object[] }} records
 * @returns {string[]} scene UUIDs
 */
export function campaignSceneUuids({ locations = [], sessions = [] }) {
  const uuids = [
    ...locations.map((location) => location.foundrySceneUuid),
    ...sessions.flatMap((session) => (session.foundryScenes ?? []).map((scene) => scene.uuid)),
  ];
  return [...new Set(uuids.filter((uuid) => SCENE_UUID.test(uuid ?? "")))];
}

/**
 * Whether the scene gets a thumbnail: it needs a map image, and isn't a 3D
 * Canvas scene, whose map a flat thumbnail doesn't show.
 * @param {object} source the scene's data, from scene.toObject()
 */
export function hasThumbnail(source) {
  if (source.flags?.["levels-3d-preview"]?.enablePlayers) return false;
  return (source.levels ?? []).some((level) => level.background?.src || level.foreground?.src);
}

// Leaves out what a thumbnail doesn't show
const shown = ({ _stats, flags, locked, ...rest }) => rest;

/**
 * Changes when anything the scene's thumbnail shows changes: its size, levels
 * and tiles, but not tokens, walls, lights or which scene is active.
 * @param {object} source the scene's data, from scene.toObject()
 */
export function sceneVersion(source) {
  const fingerprint = JSON.stringify({
    name: source.name,
    width: source.width,
    height: source.height,
    padding: source.padding,
    shiftX: source.shiftX,
    shiftY: source.shiftY,
    initialLevel: source.initialLevel,
    levels: (source.levels ?? []).map(shown),
    tiles: (source.tiles ?? []).map(shown),
  });
  return `${THUMBNAIL_FORMAT}-${hash(fingerprint)}`;
}

// A fast 53-bit string hash (cyrb53), as hex
function hash(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
