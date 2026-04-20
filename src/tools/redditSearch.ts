import { REDDIT_UA } from "../config.js";

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

export async function redditSearch(params: {
  keyword: string;
  time_filter?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
}): Promise<RedditSearchResult> {
  const query = new URLSearchParams({
    q: params.keyword,
    sort: "relevance",
    t: params.time_filter ?? "month",
    limit: String(Math.min(params.limit ?? 10, 100)),
    restrict_sr: "off",
  });
  const url = `https://www.reddit.com/r/all/search.json?${query}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        keyword: params.keyword,
        posts: [],
        error: `Reddit API returned ${res.status}`,
      };
    }
    const data: any = await res.json();
    const children = data?.data?.children ?? [];
    const posts: RedditPost[] = children.map((c: any) => {
      const p = c.data ?? {};
      return {
        title: p.title ?? "",
        url: `https://reddit.com${p.permalink ?? ""}`,
        permalink: p.permalink ?? "",
        score: typeof p.score === "number" ? p.score : 0,
        num_comments: typeof p.num_comments === "number" ? p.num_comments : 0,
        subreddit: p.subreddit ?? "",
        selftext_preview: String(p.selftext ?? "").slice(0, 500),
        created_utc: typeof p.created_utc === "number" ? p.created_utc : 0,
      };
    });
    return { keyword: params.keyword, posts };
  } catch (err) {
    return {
      keyword: params.keyword,
      posts: [],
      error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
