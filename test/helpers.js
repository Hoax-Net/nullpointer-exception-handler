export class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key);
  }

  async put(keyOrEntries, value) {
    if (typeof keyOrEntries === "string") {
      this.values.set(keyOrEntries, structuredClone(value));
      return;
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) {
      this.values.set(key, structuredClone(entry));
    }
  }

  async list({ prefix = "" } = {}) {
    return new Map(
      [...this.values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, structuredClone(value)]),
    );
  }

  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;
    for (const key of list) deleted += this.values.delete(key) ? 1 : 0;
    return deleted;
  }
}

export function createContext(storage = new MemoryStorage()) {
  const pending = [];
  return {
    storage,
    pending,
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };
}

export function baseEnv() {
  return {
    APPLICATION_ID: "1306605317676859392",
    DISCORD_PUBLIC_KEY: "8d73db035b5e4536ac649148ff88891e0c82de52a4143ee8fdf6f91bb3db7112",
    DISCORD_TOKEN: "test-token-not-real",
    GUILD_ID: "1138548626491199519",
    GENERAL_CHANNEL_ID: "1138548628282150995",
    STAFF_LOG_CHANNEL_ID: "1173184485039276052",
    SITE_URL: "https://example.test/",
    QUIZ_DURATION_MINUTES: "10",
    QUIZ_MIN_INTERVAL_MINUTES: "240",
    QUIZ_MAX_INTERVAL_MINUTES: "480",
    INITIAL_QUIZ_DELAY_MINUTES: "30",
    ANSWER_RETENTION_DAYS: "30",
    ADMIN_USER_IDS: "",
  };
}

