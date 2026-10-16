import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignSceneUuids, hasThumbnail, sceneVersion } from "../scripts/scenes.mjs";

const PASS = "Scene.QdI6Ix83ypmPq4lc";
const MAP = "Scene.WVPcqI82sGV2YrXq";

const level = (src) => ({
  _id: "defaultLevel0000",
  name: "Ground",
  background: { color: "#aed2f4", src, tint: "#ffffff" },
  foreground: { src: null, tint: "#ffffff" },
  flags: {},
});

const scene = (overrides = {}) => ({
  name: "Mountain Pass",
  _id: "QdI6Ix83ypmPq4lc",
  active: false,
  navigation: true,
  width: 4000,
  height: 3000,
  padding: 0.25,
  shiftX: 0,
  shiftY: 0,
  initialLevel: "defaultLevel0000",
  levels: [level("worlds/dev/maps/pass.webp")],
  tiles: [{ _id: "t1", x: 100, y: 100, texture: { src: "tiles/tree.webp" }, hidden: false, locked: false, flags: {} }],
  tokens: [{ _id: "k1", x: 0, y: 0 }],
  walls: [],
  flags: {},
  _stats: { modifiedTime: 1 },
  ...overrides,
});

test("lists the scenes a campaign uses, once each", () => {
  const uuids = campaignSceneUuids({
    locations: [{ foundrySceneUuid: PASS }, { foundrySceneUuid: null }, { foundrySceneUuid: "JournalEntry.abc" }],
    sessions: [{ foundryScenes: [{ uuid: MAP }, { uuid: PASS }] }, { foundryScenes: [] }, {}],
  });

  assert.deepEqual(uuids, [PASS, MAP]);
});

test("lists nothing for a campaign without maps", () => {
  assert.deepEqual(campaignSceneUuids({}), []);
});

test("makes thumbnails of scenes with a map image", () => {
  assert.equal(hasThumbnail(scene()), true);
  assert.equal(hasThumbnail(scene({ levels: [{ ...level(null), foreground: { src: "roof.webp" } }] })), true);
});

test("skips scenes without a map image, and 3D Canvas scenes", () => {
  assert.equal(hasThumbnail(scene({ levels: [level(null)] })), false);
  assert.equal(hasThumbnail(scene({ levels: [] })), false);
  assert.equal(hasThumbnail(scene({ flags: { "levels-3d-preview": { enablePlayers: true } } })), false);
  assert.equal(hasThumbnail(scene({ flags: { "levels-3d-preview": { enablePlayers: false } } })), true);
});

test("the version changes with what the thumbnail shows", () => {
  const version = sceneVersion(scene());

  assert.match(version, /^1-[0-9a-f]+$/);
  assert.notEqual(sceneVersion(scene({ levels: [level("worlds/dev/maps/pass-night.webp")] })), version);
  assert.notEqual(sceneVersion(scene({ tiles: [] })), version);
  assert.notEqual(sceneVersion(scene({ width: 5000 })), version);
  assert.notEqual(sceneVersion(scene({ name: "The Pass" })), version);
});

test("the version stays the same through play", () => {
  const version = sceneVersion(scene());

  assert.equal(sceneVersion(scene({ active: true, navigation: false })), version);
  assert.equal(sceneVersion(scene({ tokens: [{ _id: "k1", x: 500, y: 500 }], walls: [{ _id: "w1" }] })), version);
  assert.equal(sceneVersion(scene({ _stats: { modifiedTime: 2 } })), version);
  assert.equal(
    sceneVersion(scene({ tiles: [{ ...scene().tiles[0], locked: true, flags: { other: 1 }, _stats: { modifiedTime: 3 } }] })),
    version,
  );
});
