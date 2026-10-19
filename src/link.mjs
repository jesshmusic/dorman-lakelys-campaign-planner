// Linking with a code: Foundry shows a short code, the DM enters it on
// Dungeon Master Guru, and Foundry receives an API token. No Foundry globals,
// so it can be tested in Node.

/**
 * What to do after a poll that didn't return a token yet, from the reason in
 * the error: wait (seconds) and ask again, or stop.
 * @returns {{ wait: number } | { stop: "expired"|"denied"|"error" }}
 */
export function nextPoll(code, interval = 5) {
  switch (code) {
    case "authorization_pending":
      return { wait: interval };
    case "slow_down":
      return { wait: interval + 5 };
    case "expired_token":
      return { stop: "expired" };
    case "access_denied":
      return { stop: "denied" };
    default:
      return { stop: "error" };
  }
}

/** Minutes and seconds left on the code, e.g. "9:05" */
export function timeLeft(expiresAt, now = Date.now()) {
  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
