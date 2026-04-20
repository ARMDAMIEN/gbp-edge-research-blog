import { TELEGRAM_BOT_API_KEY, TELEGRAM_CHAT_ID } from "../config.js";

export interface ClientResult {
  name: string;
  city: string;
  decision: "PUBLISHED" | "SKIPPED" | "FAILED";
  topic: string | null;
  title: string | null;
  url: string | null;
  commit_sha: string | null;
  gsc_ok: boolean | null;
  gsc_error: string | null;
  notes: string | null;
}

export interface TelegramReportInput {
  published: number;
  skipped: number;
  failed: number;
  clients: ClientResult[];
  summary?: string;
}

function escHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatReport(input: TelegramReportInput): string {
  const lines: string[] = [];
  lines.push(
    `<b>[gbp-edge-blog] ${input.published} published, ${input.skipped} skipped, ${input.failed} failed</b>`
  );

  for (const c of input.clients) {
    const icon = c.decision === "PUBLISHED" ? "✅" : c.decision === "SKIPPED" ? "⏭" : "❌";
    lines.push("");
    lines.push(`${icon} <b>${escHtml(c.name)}</b> (${escHtml(c.city)}) — ${c.decision}`);
    lines.push(`  Topic: ${escHtml(c.topic ?? "-")}`);
    lines.push(`  Title: ${escHtml(c.title ?? "-")}`);
    lines.push(`  URL: ${escHtml(c.url ?? "-")}`);
    lines.push(`  Commit: ${escHtml(c.commit_sha ?? "-")}`);
    const gsc =
      c.gsc_ok == null
        ? "-"
        : c.gsc_ok
        ? "ok"
        : `error: ${escHtml((c.gsc_error ?? "unknown").slice(0, 200))}`;
    lines.push(`  GSC: ${gsc}`);
    lines.push(`  Notes: ${escHtml(c.notes ?? "ok")}`);
  }

  if (input.summary) {
    lines.push("");
    lines.push(`<i>${escHtml(input.summary)}</i>`);
  }

  return lines.join("\n");
}

async function postOnce(text: string): Promise<{ ok: boolean; message_id: number | null; error?: string }> {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_API_KEY}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      message_id: null,
      error: `Telegram API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }
  return { ok: true, message_id: data.result?.message_id ?? null };
}

export async function sendTelegramReport(
  input: TelegramReportInput
): Promise<{ ok: boolean; message_id: number | null; error?: string }> {
  if (!TELEGRAM_BOT_API_KEY || !TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      message_id: null,
      error: "TELEGRAM_BOT_API_KEY or TELEGRAM_CHAT_ID not set",
    };
  }
  const text = formatReport(input);
  const first = await postOnce(text);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return postOnce(text);
}
