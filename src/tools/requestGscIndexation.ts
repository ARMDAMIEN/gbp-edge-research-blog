import { google } from "googleapis";
import { GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN } from "../config.js";

export interface GscResult {
  ok: boolean;
  url: string;
  response?: unknown;
  error?: string;
}

function oauth2Client() {
  const client = new google.auth.OAuth2(GSC_CLIENT_ID, GSC_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GSC_REFRESH_TOKEN });
  return client;
}

export async function requestGscIndexation(params: { url: string }): Promise<GscResult> {
  if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
    return {
      ok: false,
      url: params.url,
      error: "GSC_CLIENT_ID / GSC_CLIENT_SECRET / GSC_REFRESH_TOKEN not set",
    };
  }

  try {
    const client = oauth2Client();
    const tokenRes = await client.getAccessToken();
    const token = typeof tokenRes === "string" ? tokenRes : tokenRes?.token;
    if (!token) {
      return { ok: false, url: params.url, error: "Failed to obtain GSC access token" };
    }

    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: params.url, type: "URL_UPDATED" }),
      signal: AbortSignal.timeout(20000),
    });

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        url: params.url,
        error: `Indexing API ${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
      };
    }
    return { ok: true, url: params.url, response: body };
  } catch (err) {
    return {
      ok: false,
      url: params.url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
