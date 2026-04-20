import "dotenv/config";
import { google } from "googleapis";
import http from "node:http";
import { AddressInfo } from "node:net";

// One-shot helper to obtain a Google OAuth2 refresh token with the
// `indexing` scope for the Google Search Console Indexing API.
//
// Uses the localhost-loopback redirect flow. Google deprecated the
// copy-paste OOB flow (urn:ietf:wg:oauth:2.0:oob) in 2022.
//
// Prereqs:
//   1. Google Cloud Console → APIs & Services → enable "Web Search
//      Indexing API".
//   2. OAuth consent screen → Scopes → add
//      https://www.googleapis.com/auth/indexing
//   3. Credentials → Create Credentials → OAuth client ID →
//      Application type: Desktop app  (Desktop clients auto-allow
//      http://127.0.0.1 and http://localhost on any port.)
//   4. Put client_id / client_secret in .env as GSC_CLIENT_ID /
//      GSC_CLIENT_SECRET.
//   5. Run: npm run gsc:token
//   6. A browser tab opens; approve. Script captures the code,
//      exchanges it, prints the refresh token.
//   7. Copy the printed refresh_token into .env as
//      GSC_REFRESH_TOKEN.
//
// Note: if you've authorized this OAuth client before, REVOKE it at
// https://myaccount.google.com/permissions first, otherwise Google
// skips the consent screen and keeps your old scope set.

const SCOPES = ["https://www.googleapis.com/auth/indexing"];

async function main() {
  const clientId = process.env.GSC_CLIENT_ID;
  const clientSecret = process.env.GSC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GSC_CLIENT_ID and GSC_CLIENT_SECRET must be set in .env first.");
  }

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1) Open this URL in your browser and approve:\n");
  console.log(authUrl);
  console.log("\n2) Waiting for Google to redirect back to the loopback server...\n");

  const code: string = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for OAuth callback (5 min).")), 300000);
    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url ?? "/", redirectUri);
        const got = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        res.writeHead(200, { "Content-Type": "text/plain" });
        if (err) {
          res.end(`OAuth error: ${err}. You can close this tab.`);
          clearTimeout(timeout);
          reject(new Error(`OAuth error: ${err}`));
          return;
        }
        if (got) {
          res.end("✅ Got it. You can close this tab and return to the terminal.");
          clearTimeout(timeout);
          resolve(got);
        } else {
          res.end("Waiting...");
        }
      } catch (e) {
        reject(e as Error);
      }
    });
  });

  server.close();

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke this app at https://myaccount.google.com/permissions and run again — Google only issues a refresh_token the first time you consent."
    );
  }
  console.log("\n✅ Success. Add this to your .env:\n");
  console.log(`GSC_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`\n(Scopes granted: ${tokens.scope ?? "(unknown)"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
