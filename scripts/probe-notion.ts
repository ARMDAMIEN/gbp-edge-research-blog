import "dotenv/config";
import { Client } from "@notionhq/client";

const key = process.env.NOTION_API_KEY;
const clientsDb = process.env.NOTION_CLIENTS_DB_ID;
const researchDb = process.env.NOTION_RESEARCH_DB_ID;

if (!key || !clientsDb) {
  console.error("Set NOTION_API_KEY and NOTION_CLIENTS_DB_ID first.");
  process.exit(1);
}

const notion = new Client({ auth: key });

async function dumpSchema(label: string, dbId: string | undefined) {
  if (!dbId) {
    console.log(`\n— ${label}: <no ID set>`);
    return;
  }
  console.log(`\n— ${label} (${dbId})`);
  try {
    const db: any = await notion.databases.retrieve({ database_id: dbId });
    console.log(`  title: ${db.title?.map((t: any) => t.plain_text).join("")}`);
    console.log(`  properties:`);
    for (const [name, prop] of Object.entries<any>(db.properties)) {
      console.log(`    • ${name} (${prop.type})`);
    }
  } catch (err) {
    console.error(`  ERROR: ${err}`);
  }
}

async function dumpFirstFewRows() {
  console.log(`\n— Clients DB: first 3 rows (redacted property types only)`);
  const res: any = await notion.databases.query({ database_id: clientsDb!, page_size: 3 });
  for (const page of res.results) {
    const props = Object.entries<any>(page.properties).map(([n, p]) => `${n}=${p.type}`).join(", ");
    console.log(`  ${page.id} | ${props}`);
  }
}

(async () => {
  await dumpSchema("Clients DB", clientsDb);
  await dumpSchema("Reddit Research DB", researchDb);
  await dumpFirstFewRows();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
