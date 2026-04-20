import { Client } from "@notionhq/client";
import { NOTION_API_KEY, NOTION_CLIENTS_DB_ID } from "../config.js";

export interface ActiveClient {
  id: string;
  business_name: string;
  city: string;
  niche: string | null;
  icp: string | null;
  site_url: string | null;
  repo_url: string | null;
}

function plainText(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "title") return prop.title.map((t: any) => t.plain_text).join("").trim() || null;
  if (prop.type === "rich_text") return prop.rich_text.map((t: any) => t.plain_text).join("").trim() || null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "multi_select") return prop.multi_select.map((s: any) => s.name).join(", ") || null;
  if (prop.type === "email") return prop.email ?? null;
  if (prop.type === "url") return prop.url ?? null;
  if (prop.type === "phone_number") return prop.phone_number ?? null;
  if (prop.type === "status") return prop.status?.name ?? null;
  return null;
}

function pickProp(props: Record<string, any>, candidates: string[]): any {
  const keys = Object.keys(props);
  for (const c of candidates) {
    const exact = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (exact) return props[exact];
  }
  for (const c of candidates) {
    const sub = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (sub) return props[sub];
  }
  return null;
}

export async function getActiveClients(): Promise<{ clients: ActiveClient[]; skipped: number }> {
  if (!NOTION_API_KEY || !NOTION_CLIENTS_DB_ID) {
    throw new Error("NOTION_API_KEY or NOTION_CLIENTS_DB_ID not set");
  }
  const notion = new Client({ auth: NOTION_API_KEY });

  const pages: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: NOTION_CLIENTS_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const clients: ActiveClient[] = [];
  let skipped = 0;

  for (const page of pages) {
    const props = page.properties ?? {};

    const statusProp = pickProp(props, ["Status", "Statut", "State", "État"]);
    const status = (plainText(statusProp) ?? "").toLowerCase();
    if (!status.includes("actif") && !status.includes("active")) continue;

    const nameProp =
      pickProp(props, ["Name", "Nom", "Business", "Business Name", "Client", "Client Name"]) ??
      Object.values(props).find((p: any) => p?.type === "title");
    const business_name = plainText(nameProp) ?? "";
    if (!business_name) {
      skipped++;
      continue;
    }

    const city = plainText(pickProp(props, ["City", "Ville", "Location", "Localisation"]));
    if (!city) {
      skipped++;
      continue;
    }

    const niche = plainText(
      pickProp(props, [
        "Niche",
        "Industry",
        "Industrie",
        "Secteur",
        "Category",
        "Catégorie",
        "Activité",
        "Type d'activité",
      ])
    );
    const icp = plainText(pickProp(props, ["ICP", "Ideal Customer", "Client Idéal", "Audience"]));
    const site_url = plainText(pickProp(props, ["Site URL", "Site", "Website", "URL"]));
    const repo_url = plainText(
      pickProp(props, ["GitHub Repo URL", "GitHub Repo", "Repo URL", "Repository", "Repo"])
    );

    clients.push({
      id: page.id,
      business_name,
      city,
      niche,
      icp,
      site_url,
      repo_url,
    });
  }

  return { clients, skipped };
}
