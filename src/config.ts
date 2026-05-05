import "dotenv/config";

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export const NOTION_API_KEY = process.env.NOTION_API_KEY ?? "";
export const NOTION_CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID ?? "";
export const NOTION_RESEARCH_DB_ID = process.env.NOTION_RESEARCH_DB_ID ?? "";

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
export const GIT_USER_NAME = process.env.GIT_USER_NAME ?? "gbp-edge-bot";
export const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL ?? "bot@gbp-edge.com";

export const GSC_CLIENT_ID = process.env.GSC_CLIENT_ID ?? "";
export const GSC_CLIENT_SECRET = process.env.GSC_CLIENT_SECRET ?? "";
export const GSC_REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN ?? "";

export const TELEGRAM_BOT_API_KEY = process.env.TELEGRAM_BOT_API_KEY ?? "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-6";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
export const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY ?? "";
export const WORKDIR_ROOT = process.env.WORKDIR_ROOT ?? "/tmp/gbp-edge-blog-runs";

export const DATA_DIR = new URL("../data/", import.meta.url).pathname;
export const RUN_LOG_PATH = `${DATA_DIR}run-log.json`;
