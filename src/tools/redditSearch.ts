import { SERPAPI_API_KEY } from "../config.js";

export interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  subreddit: string;
  selftext_preview: string;
  created_utc: number;
}

export interface RedditSearchResult {
  keyword: string;
  posts: RedditPost[];
  error?: string;
}

const TIME_TO_QDR: Record<string, string> = {
  hour: "h",
  day: "d",
  week: "w",
  month: "m",
  year: "y",
};

// Reddit's public JSON API blocks cloud-provider IPs (Fly egress → 403).
// We route through SerpApi's Google engine with `site:reddit.com`. This
// loses the upvote count (Google doesn't expose it) but preserves title,
// snippet, comment count, subreddit, and link — enough for ICP research.
export async function redditSearch(params: {
  keyword: string;
  time_filter?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
}): Promise<RedditSearchResult> {
  if (!SERPAPI_API_KEY) {
    return { keyword: params.keyword, posts: [], error: "SERPAPI_API_KEY not set" };
  }

  const query = new URLSearchParams({
    engine: "google",
    q: `site:reddit.com ${params.keyword}`,
    num: String(Math.min(params.limit ?? 10, 100)),
    api_key: SERPAPI_API_KEY,
  });
  const qdr = TIME_TO_QDR[params.time_filter ?? "month"];
  if (qdr) query.set("tbs", `qdr:${qdr}`);

  try {
    const res = await fetch(`https://serpapi.com/search.json?${query}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return { keyword: params.keyword, posts: [], error: `SerpApi returned ${res.status}` };
    }
    const data: any = await res.json();
    if (data.error) {
      return { keyword: params.keyword, posts: [], error: `SerpApi: ${data.error}` };
    }
    const organic = data?.organic_results ?? [];
    const posts: RedditPost[] = organic.map((r: any) => parseOrganicResult(r));
    return { keyword: params.keyword, posts };
  } catch (err) {
    return {
      keyword: params.keyword,
      posts: [],
      error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function parseOrganicResult(r: any): RedditPost {
  const link = String(r.link ?? "");
  // "Reddit · r/Expats_In_France" → "Expats_In_France"
  const subMatch = String(r.source ?? "").match(/r\/([\w]+)/);
  // "30+ comments · 5 months ago" → 30, "5 months ago"
  const dl = String(r.displayed_link ?? "");
  const commentsMatch = dl.match(/(\d+)\+?\s+comments?/i);
  const ageMatch = dl.match(/(\d+)\s+(hour|day|week|month|year)s?\s+ago/i);
  // Strip " : r/<sub>" suffix Google appends to Reddit titles.
  const title = String(r.title ?? "").replace(/\s*:\s*r\/[\w]+\s*$/, "").trim();
  // permalink: the path portion only, matching Reddit's JSON API shape.
  const permalink = link.replace(/^https?:\/\/(www\.)?reddit\.com/, "");
  return {
    title,
    url: link,
    permalink,
    score: 0, // Google doesn't expose Reddit upvotes — agent ranks by num_comments.
    num_comments: commentsMatch ? parseInt(commentsMatch[1], 10) : 0,
    subreddit: subMatch ? subMatch[1] : "",
    selftext_preview: String(r.snippet ?? "").slice(0, 500),
    created_utc: ageMatch ? approxUnixTsFromAge(parseInt(ageMatch[1], 10), ageMatch[2]) : 0,
  };
}

function approxUnixTsFromAge(n: number, unit: string): number {
  const sec: Record<string, number> = {
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  return Math.floor(Date.now() / 1000) - n * (sec[unit] ?? 0);
}
