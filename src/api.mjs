// Client for the Dungeon Master Guru API. No Foundry globals, so it can be tested in Node.

export const DEFAULT_BASE_URL = "https://dungeonmaster.guru";

export class DmGuruApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 when the request never reached the server
   * @param {string|null} code e.g. "premium_required"
   * @param {string[]} fields the fields a 422 says are wrong, e.g. ["target_level"]
   */
  constructor(message, status, code = null, fields = []) {
    super(message);
    this.name = "DmGuruApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  get unauthorized() {
    return this.status === 401;
  }

  get premiumRequired() {
    return this.code === "premium_required";
  }
}

export class DmGuruApi {
  /**
   * @param {{ baseUrl?: string, token: string, fetchImpl?: typeof fetch }} options
   */
  constructor({ baseUrl = DEFAULT_BASE_URL, token, fetchImpl = globalThis.fetch.bind(globalThis) }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  /** The account the token belongs to: { user, premium, patreon } */
  me() {
    return this.#request("GET", "/v1/foundry/me");
  }

  /**
   * Creates a campaign from the setup guide (free, unlike sync):
   * { uuid, name, slug, mode, status, syncVersion, url, party }
   */
  createCampaign(body) {
    return this.#request("POST", "/v1/foundry/campaigns", body);
  }

  /**
   * Sends a campaign planned in Foundry, with all its records (see send.mjs):
   * the new campaign, plus ids: { [Foundry id]: new uuid }
   */
  importCampaign(body) {
    return this.#request("POST", "/v1/foundry/campaigns/import", body);
  }

  /** The DM's campaigns: [{ uuid, name, slug, mode, status, syncVersion }] */
  campaigns() {
    return this.#request("GET", "/v1/foundry/campaigns");
  }

  /** Everything that changed since `since`: { cursor, full, campaign, records, tombstones } */
  changes(campaignUuid, since = 0) {
    const query = new URLSearchParams({ since: String(since) });
    return this.#request("GET", `/v1/foundry/campaigns/${encodeURIComponent(campaignUuid)}/changes?${query}`);
  }

  /** Sends table-side changes: { applied, conflicts, errors, cursor } */
  push(campaignUuid, changes) {
    return this.#request("POST", `/v1/foundry/campaigns/${encodeURIComponent(campaignUuid)}/changes`, { changes });
  }

  /** Replaces this world's player characters: { count, skipped } */
  sendCharacters(world, characters) {
    return this.#request("POST", "/v1/foundry/characters", { world, characters });
  }

  /** The scene thumbnails Dungeon Master Guru has from this world: { scenes: { [uuid]: { version, thumbnailUrl } } } */
  sceneStatus(worldId) {
    const query = new URLSearchParams({ world: worldId });
    return this.#request("GET", `/v1/foundry/scenes?${query}`);
  }

  /**
   * Saves a scene's thumbnail, sent as a data URL: { uuid, name, version, thumbnailUrl }
   * @param {{ id: string, title: string }} world
   * @param {{ uuid: string, name: string, version: string, thumbnail: string }} scene
   */
  sendScene(world, scene) {
    return this.#request("POST", "/v1/foundry/scenes", { world, scene });
  }

  /** Removes a scene that's gone from the world, with its thumbnail */
  deleteScene(worldId, uuid) {
    const query = new URLSearchParams({ world: worldId, uuid });
    return this.#request("DELETE", `/v1/foundry/scenes?${query}`);
  }

  /** The compendium packs Dungeon Master Guru has: { packs: { [packId]: { version, count } } } */
  compendiumStatus() {
    return this.#request("GET", "/v1/foundry/compendium");
  }

  /** Replaces one pack's index: { pack, count, skipped } */
  sendCompendiumPack(pack, version, entries) {
    return this.#request("POST", "/v1/foundry/compendium", { pack, version, entries });
  }

  async #request(method, path, body) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new DmGuruApiError(`Could not reach Dungeon Master Guru (${error.message})`, 0);
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = Array.isArray(data?.errors) ? data.errors.join(", ") : `Request failed (${response.status})`;
      const fields = Array.isArray(data?.fields) ? data.fields : [];
      throw new DmGuruApiError(message, response.status, data?.code ?? null, fields);
    }
    return data;
  }
}
