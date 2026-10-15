// Client for the Dungeon Master Guru API. No Foundry globals, so it can be tested in Node.

export const DEFAULT_BASE_URL = "https://dungeonmaster.guru";

export class DmGuruApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 when the request never reached the server
   * @param {string|null} code e.g. "premium_required"
   */
  constructor(message, status, code = null) {
    super(message);
    this.name = "DmGuruApiError";
    this.status = status;
    this.code = code;
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
      throw new DmGuruApiError(message, response.status, data?.code ?? null);
    }
    return data;
  }
}
