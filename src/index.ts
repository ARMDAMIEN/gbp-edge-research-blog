import "dotenv/config";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  CLAUDE_MODEL,
  GIT_USER_EMAIL,
  GIT_USER_NAME,
  WORKDIR_ROOT,
} from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { getActiveClients } from "./tools/getActiveClients.js";
import { redditSearch } from "./tools/redditSearch.js";
import { logResearchRow } from "./tools/logResearchRow.js";
import { generateBlogImage } from "./tools/generateBlogImage.js";
import { requestGscIndexation } from "./tools/requestGscIndexation.js";
import { sendTelegramReport } from "./tools/sendTelegramReport.js";

// ─── Git + workdir bootstrap ────────────────────────────────────────────────

mkdirSync(WORKDIR_ROOT, { recursive: true });
try {
  execSync(`git config --global user.name "${GIT_USER_NAME}"`, { stdio: "ignore" });
  execSync(`git config --global user.email "${GIT_USER_EMAIL}"`, { stdio: "ignore" });
  // Long Reddit-derived titles can contain UTF-8; make sure git handles them.
  execSync(`git config --global core.quotepath false`, { stdio: "ignore" });
} catch (err) {
  console.warn(`[warn] git config failed: ${err}`);
}

// ─── Tool definitions ───────────────────────────────────────────────────────

const getActiveClientsTool = tool(
  "get_active_clients",
  "Load the Clients database from Notion and return only rows with Status='actif'. Call once at the start of the run.",
  {},
  async () => {
    console.log(`  📒 get_active_clients`);
    try {
      const result = await getActiveClients();
      console.log(`    → ${result.clients.length} active client(s), ${result.skipped} skipped`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `get_active_clients failed: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const redditSearchTool = tool(
  "reddit_search",
  "Search Reddit's public JSON API for a single keyword. Returns up to `limit` posts sorted by relevance in the given time window.",
  {
    keyword: z.string().describe("Search query (French keywords are fine)"),
    time_filter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("month"),
    limit: z.number().int().min(1).max(100).default(10),
  },
  async (args) => {
    console.log(`  🔎 reddit_search: "${args.keyword}"`);
    try {
      const result = await redditSearch(args);
      console.log(`    → ${result.posts.length} post(s)${result.error ? ` (err: ${result.error})` : ""}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `reddit_search failed: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const logResearchRowTool = tool(
  "log_research_row",
  "Append one row to the Notion 'Reddit Research' database. Call once per client with the winning topic.",
  {
    date: z.string().describe("YYYY-MM-DD"),
    client: z.string(),
    keyword: z.string(),
    reddit_post_title: z.string(),
    reddit_url: z.string(),
    suggested_blog_topic: z.string(),
    score: z.number().int(),
  },
  async (args) => {
    console.log(`  📝 log_research_row: ${args.client} — "${args.suggested_blog_topic.slice(0, 60)}"`);
    try {
      const result = await logResearchRow(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `log_research_row failed: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

const generateBlogImageTool = tool(
  "generate_blog_image",
  "Generate a hero image with Gemini 2.5 Flash Image, convert to webp via sharp, and write it to the given absolute path inside the cloned client repo. Returns {ok, path, bytes, width, height} or {ok:false, error}. The image is saved directly to disk — do NOT pass it back through the agent.",
  {
    prompt: z.string().describe("Detailed image prompt in English. Describe subject, style, lighting, composition. Do not ask the model to render text."),
    output_path: z.string().describe("Absolute path ending in .webp, inside the cloned client repo (e.g. /tmp/gbp-edge-blog-runs/<slug>/blog/images/<post-slug>.webp)"),
    width: z.number().int().min(256).max(2048).optional(),
    quality: z.number().int().min(40).max(95).optional(),
  },
  async (args) => {
    console.log(`  🖼  generate_blog_image → ${args.output_path}`);
    try {
      const result = await generateBlogImage(args);
      console.log(
        result.ok
          ? `    → ${result.bytes} B, ${result.width}x${result.height}`
          : `    → FAILED: ${result.error}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `generate_blog_image failed: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

const requestGscIndexationTool = tool(
  "request_gsc_indexation",
  "POST a URL to the Google Search Console Indexing API (URL_UPDATED). Best-effort: failures are expected if the SA is not verified for the site; they are NON-fatal.",
  {
    url: z.string().url(),
  },
  async (args) => {
    console.log(`  🔔 request_gsc_indexation: ${args.url}`);
    try {
      const result = await requestGscIndexation(args);
      console.log(`    → ok=${result.ok}${result.error ? ` err="${result.error.slice(0, 80)}"` : ""}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `request_gsc_indexation failed: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

const sendTelegramReportTool = tool(
  "send_telegram_report",
  "Send the final run summary to Telegram. Call this EXACTLY ONCE as the very last step, even if zero clients were processed.",
  {
    published: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    clients: z.array(
      z.object({
        name: z.string(),
        city: z.string(),
        decision: z.enum(["PUBLISHED", "SKIPPED", "FAILED"]),
        topic: z.string().nullable(),
        title: z.string().nullable(),
        url: z.string().nullable(),
        commit_sha: z.string().nullable(),
        gsc_ok: z.boolean().nullable(),
        gsc_error: z.string().nullable(),
        notes: z.string().nullable(),
      })
    ),
    summary: z.string().optional(),
  },
  async (args) => {
    console.log(`  📡 send_telegram_report: ${args.published} published, ${args.skipped} skipped, ${args.failed} failed`);
    try {
      const result = await sendTelegramReport(args);
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Telegram failed: ${result.error}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: `Telegram sent (message_id=${result.message_id})` }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Telegram error: ${err}` }],
        isError: true,
      };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

// ─── MCP server ─────────────────────────────────────────────────────────────

const mcpServer = createSdkMcpServer({
  name: "gbp_edge_blog",
  version: "1.0.0",
  tools: [
    getActiveClientsTool,
    redditSearchTool,
    logResearchRowTool,
    generateBlogImageTool,
    requestGscIndexationTool,
    sendTelegramReportTool,
  ],
});

// ─── Task prompt ────────────────────────────────────────────────────────────

const taskPrompt = `Run the full gbp-edge-research-blog workflow now.

Start by calling get_active_clients. For every returned client, execute Step 1 (Reddit research + log_research_row) then Step 2 (clone repo, write blog, commit+push, request_gsc_indexation) before moving to the next client. Finish with exactly one call to send_telegram_report covering every client.`;

console.log(`\n🚀 gbp-edge-research-blog | workdir=${WORKDIR_ROOT}\n`);

async function main() {
  for await (const message of query({
    prompt: taskPrompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: CLAUDE_MODEL,
      mcpServers: { gbp_edge_blog: mcpServer },
      allowedTools: [
        "mcp__gbp_edge_blog__*",
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
      ],
      permissionMode: "bypassPermissions",
      maxTurns: 400,
      sandbox: { enabled: false, failIfUnavailable: false },
      stderr: (data: string) => process.stderr.write(`[cli-stderr] ${data}`),
    } as any,
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          console.log(`\n🤖 ${block.text.slice(0, 400)}`);
        }
        if (block.type === "tool_use") {
          console.log(`\n🔧 ${block.name}`);
        }
      }
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`\n✅ Done. Cost: $${message.total_cost_usd?.toFixed(4) ?? "?"}`);
      } else {
        console.error(`\n❌ Agent failed:`, (message as any).errors);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
