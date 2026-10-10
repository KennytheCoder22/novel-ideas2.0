import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processNormalSymmetry } from "../lib/3d/load-normal.cjs";

const STABILITY_ENDPOINT = "https://api.stability.ai/v2beta/3d/stable-fast-3d";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function requestOriginMatchesHost(req: VercelRequest): boolean {
  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers.host || "").trim();
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}


function decodeBase64Image(value: unknown): Buffer | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const comma = trimmed.indexOf(",");
  const payload = trimmed.startsWith("data:") && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!requestOriginMatchesHost(req)) {
    return res.status(403).json({ error: "origin_rejected" });
  }

  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "stability_api_key_missing",
      message: "3D Workshop is installed, but STABILITY_API_KEY is not configured on the server.",
    });
  }

  const mimeType = String(req.body?.mimeType || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: "unsupported_image_type", message: "Use a PNG, JPEG, or WebP image." });
  }

  const imageBytes = decodeBase64Image(req.body?.imageBase64);
  if (!imageBytes?.length) {
    return res.status(400).json({ error: "invalid_image", message: "No readable image was supplied." });
  }
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      error: "image_too_large",
      message: "For this first version, use an image smaller than 3 MB.",
    });
  }

  const textureResolution = ["512", "1024", "2048"].includes(String(req.body?.textureResolution))
    ? String(req.body.textureResolution)
    : "1024";
  const foregroundRatioRaw = Number(req.body?.foregroundRatio);
  const foregroundRatio = Number.isFinite(foregroundRatioRaw)
    ? Math.min(1, Math.max(0.1, foregroundRatioRaw))
    : 0.85;
  const remesh = ["none", "triangle", "quad"].includes(String(req.body?.remesh))
    ? String(req.body.remesh)
    : "none";
  const vertexCountRaw = Number(req.body?.vertexCount);
  const vertexCount = Number.isFinite(vertexCountRaw)
    ? Math.min(20000, Math.max(-1, Math.round(vertexCountRaw)))
    : -1;

  const form = new FormData();
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  form.append(
    "image",
    new Blob([new Uint8Array(imageBytes)], { type: mimeType }),
    `novelideas-input.${extension}`
  );
  form.append("texture_resolution", textureResolution);
  form.append("foreground_ratio", String(foregroundRatio));
  form.append("remesh", remesh);
  form.append("vertex_count", String(vertexCount));

  let upstream: Response;
  const upstreamController = new AbortController();
  const upstreamTimeout = setTimeout(() => upstreamController.abort(), 70000);
  try {
    upstream = await fetch(STABILITY_ENDPOINT, {
      method: "POST",
      signal: upstreamController.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "model/gltf-binary",
        "stability-client-id": "NovelIdeas-3D-Workshop",
        "stability-client-version": "1.0.0",
      },
      body: form,
    });
  } catch (error: any) {
    console.error("[3D WORKSHOP] upstream request failed", error);
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "generator_timeout",
        message: "Stability took too long to return the 3D model. Please try again.",
      });
    }
    return res.status(502).json({
      error: "generator_unreachable",
      message: "NovelIdeas could not reach Stability's 3D service. Please try again.",
    });
  } finally {
    clearTimeout(upstreamTimeout);
  }

  if (!upstream.ok) {
    const contentType = upstream.headers.get("content-type") || "";
    let detail = "";
    let upstreamJson: any = null;
    try {
      if (contentType.includes("application/json")) {
        upstreamJson = await upstream.json();
        detail = JSON.stringify(upstreamJson);
      } else {
        detail = await upstream.text();
      }
    } catch {
      detail = "";
    }

    console.error("[3D WORKSHOP] Stability API error", upstream.status, detail.slice(0, 1200));

    const upstreamErrors = Array.isArray(upstreamJson?.errors)
      ? upstreamJson.errors.filter((value: unknown) => typeof value === "string").join(" ")
      : "";
    const upstreamMessage =
      typeof upstreamJson?.message === "string" ? upstreamJson.message :
      typeof upstreamJson?.error === "string" ? upstreamJson.error :
      upstreamErrors;

    const publicMessage =
      upstream.status === 400 && upstreamMessage ? `Stability rejected the generation settings: ${upstreamMessage}` :
      upstream.status === 401 ? "The configured Stability API key was rejected." :
      upstream.status === 402 ? "The Stability account does not have enough credits for another 3D generation." :
      upstream.status === 403 ? "The image was rejected by Stability's content moderation system." :
      upstream.status === 413 ? "The image is too large for the 3D service." :
      upstream.status === 429 ? "The 3D service is rate-limited. Try again shortly." :
      upstream.status === 500 ? "Stability's 3D service returned an internal error. Try again." :
      upstreamMessage ? `The 3D service could not generate this model: ${upstreamMessage}` :
      `The 3D service could not generate this model (HTTP ${upstream.status}).`;

    return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
      error: "generation_failed",
      status: upstream.status,
      message: publicMessage,
    });
  }

  let glb: Buffer = Buffer.from(await upstream.arrayBuffer());
  if (!glb.length) {
    return res.status(502).json({ error: "empty_model", message: "The 3D service returned an empty model." });
  }

  const hiddenSideMode = String(req.body?.hiddenSideMode || "infer");
  if (hiddenSideMode === "mirror") {
    const result = await processNormalSymmetry(glb);
    glb = result.buffer;
    res.setHeader("X-NovelIdeas-Symmetry-Action", result.action);
    res.setHeader("X-NovelIdeas-Symmetry-Stages", result.stages.join(","));
  }

  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Content-Disposition", 'inline; filename="novelideas-model.glb"');
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(glb);
}
