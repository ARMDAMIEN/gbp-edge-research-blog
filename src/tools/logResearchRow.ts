import { Client } from "@notionhq/client";
import { NOTION_API_KEY, NOTION_RESEARCH_DB_ID } from "../config.js";

export interface ResearchRow {
  date: string;
  client: string;
  keyword: string;
  reddit_post_title: string;
  reddit_url: string;
  suggested_blog_topic: string;
  score: number;
}

function clip(s: string, n = 1900): string {
  return (s ?? "").slice(0, n);
}

export async function logResearchRow(row: ResearchRow): Promise<{ ok: boolean; page_id?: string; error?: string }> {
  if (!NOTION_API_KEY || !NOTION_RESEARCH_DB_ID) {
    return { ok: false, error: "NOTION_API_KEY or NOTION_RESEARCH_DB_ID not set" };
  }
  const notion = new Client({ auth: NOTION_API_KEY });

  try {
    const page: any = await notion.pages.create({
      parent: { database_id: NOTION_RESEARCH_DB_ID },
      properties: {
        Client: {
          title: [{ text: { content: clip(row.client, 200) } }],
        },
        Date: {
          date: { start: row.date },
        },
        Keyword: {
          rich_text: [{ text: { content: clip(row.keyword) } }],
        },
        "Reddit Post Title": {
          rich_text: [{ text: { content: clip(row.reddit_post_title) } }],
        },
        "Reddit URL": {
          url: row.reddit_url || null,
        },
        "Suggested Blog Topic": {
          rich_text: [{ text: { content: clip(row.suggested_blog_topic) } }],
        },
        Score: {
          number: row.score,
        },
      },
    });
    return { ok: true, page_id: page.id };
  } catch (err) {
    return {
      ok: false,
      error: `Notion create failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
