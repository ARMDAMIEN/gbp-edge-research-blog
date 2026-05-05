import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { GEMINI_API_KEY, GEMINI_IMAGE_MODEL } from "../config.js";

export interface GenerateBlogImageParams {
  prompt: string;
  output_path: string;
  width?: number;
  quality?: number;
}

export interface GenerateBlogImageResult {
  ok: boolean;
  path?: string;
  bytes?: number;
  width?: number;
  height?: number;
  error?: string;
}

export async function generateBlogImage(
  p: GenerateBlogImageParams
): Promise<GenerateBlogImageResult> {
  if (!GEMINI_API_KEY) return { ok: false, error: "GEMINI_API_KEY not set" };
  if (!p.output_path.endsWith(".webp"))
    return { ok: false, error: "output_path must end in .webp" };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: p.prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return { ok: false, error: `Gemini fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Gemini ${res.status}: ${text.slice(0, 500)}` };
  }

  const data: any = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((x: any) => x?.inlineData?.data);
  if (!imgPart)
    return { ok: false, error: "Gemini returned no inlineData image part" };

  const pngBuf = Buffer.from(imgPart.inlineData.data, "base64");

  let webpBuf: Buffer;
  let meta: { width?: number; height?: number };
  try {
    webpBuf = await sharp(pngBuf)
      .resize({ width: p.width ?? 1200, withoutEnlargement: true })
      .webp({ quality: p.quality ?? 82 })
      .toBuffer();
    meta = await sharp(webpBuf).metadata();
  } catch (err) {
    return { ok: false, error: `sharp conversion failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    mkdirSync(dirname(p.output_path), { recursive: true });
    writeFileSync(p.output_path, webpBuf);
  } catch (err) {
    return { ok: false, error: `write failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return {
    ok: true,
    path: p.output_path,
    bytes: webpBuf.byteLength,
    width: meta.width,
    height: meta.height,
  };
}
