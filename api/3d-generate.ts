import type { VercelRequest, VercelResponse } from "@vercel/node";

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


type GlbJson = {
  accessors?: Array<any>;
  bufferViews?: Array<any>;
  meshes?: Array<any>;
};

function mirrorVisibleSideInGlb(input: Buffer): { buffer: Buffer; applied: boolean; mirroredVertices: number; axis?: number } {
  try {
    if (input.length < 20 || input.readUInt32LE(0) !== 0x46546c67) return { buffer: input, applied: false, mirroredVertices: 0 };
    const out = Buffer.from(input);
    let offset = 12;
    let json: GlbJson | null = null;
    let binOffset = -1;

    while (offset + 8 <= out.length) {
      const chunkLength = out.readUInt32LE(offset);
      const chunkType = out.readUInt32LE(offset + 4);
      const chunkData = offset + 8;
      if (chunkData + chunkLength > out.length) break;
      if (chunkType === 0x4e4f534a) {
        const raw = out.subarray(chunkData, chunkData + chunkLength).toString("utf8").replace(/\u0000/g, "").trim();
        json = JSON.parse(raw);
      } else if (chunkType === 0x004e4942) {
        binOffset = chunkData;
      }
      offset = chunkData + chunkLength;
    }

    if (!json || binOffset < 0 || !json.accessors || !json.bufferViews || !json.meshes) {
      return { buffer: input, applied: false, mirroredVertices: 0 };
    }

    const componentBytes = (componentType: number) =>
      componentType === 5120 || componentType === 5121 ? 1 :
      componentType === 5122 || componentType === 5123 ? 2 :
      componentType === 5125 || componentType === 5126 ? 4 : 0;
    const typeCount = (type: string) => type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : type === "VEC4" ? 4 : 0;

    const accessorInfo = (accessorIndex: number) => {
      const accessor = json!.accessors![accessorIndex];
      if (!accessor || accessor.sparse) return null;
      const view = json!.bufferViews![accessor.bufferView];
      if (!view) return null;
      const bytes = componentBytes(accessor.componentType);
      const comps = typeCount(accessor.type);
      if (!bytes || !comps) return null;
      const stride = view.byteStride || bytes * comps;
      const start = binOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      return { accessor, view, bytes, comps, stride, start };
    };

    const readFloat3 = (info: any, i: number): [number, number, number] | null => {
      if (!info || info.accessor.componentType !== 5126 || info.comps < 3) return null;
      const p = info.start + i * info.stride;
      return [out.readFloatLE(p), out.readFloatLE(p + 4), out.readFloatLE(p + 8)];
    };

    const writeFloat3 = (info: any, i: number, v: [number, number, number]) => {
      const p = info.start + i * info.stride;
      out.writeFloatLE(v[0], p); out.writeFloatLE(v[1], p + 4); out.writeFloatLE(v[2], p + 8);
    };

    const copyAccessorElement = (info: any, from: number, to: number) => {
      if (!info) return;
      const byteLength = info.bytes * info.comps;
      const source = Buffer.from(out.subarray(info.start + from * info.stride, info.start + from * info.stride + byteLength));
      source.copy(out, info.start + to * info.stride);
    };

    let totalMirrored = 0;
    let selectedAxis: number | undefined;

    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives || []) {
        const posIndex = primitive.attributes?.POSITION;
        if (typeof posIndex !== "number") continue;
        const pos = accessorInfo(posIndex);
        if (!pos || pos.accessor.componentType !== 5126 || pos.comps !== 3) continue;
        const count = Number(pos.accessor.count || 0);
        if (!count) continue;

        const points: Array<[number, number, number]> = [];
        const mins = [Infinity, Infinity, Infinity];
        const maxs = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i++) {
          const v = readFloat3(pos, i);
          if (!v) continue;
          points.push(v);
          for (let a = 0; a < 3; a++) { mins[a] = Math.min(mins[a], v[a]); maxs[a] = Math.max(maxs[a], v[a]); }
        }
        if (points.length !== count) continue;

        const extents = [maxs[0]-mins[0], maxs[1]-mins[1], maxs[2]-mins[2]];
        const axis = extents.indexOf(Math.min(...extents));
        selectedAxis = axis;
        const center = (mins[axis] + maxs[axis]) / 2;
        const other = [0,1,2].filter((a) => a !== axis);
        const span = Math.max(extents[other[0]], extents[other[1]], 1e-5);
        const cell = span / 120;

        const visible: number[] = [];
        const hidden: number[] = [];
        for (let i = 0; i < count; i++) {
          if (points[i][axis] >= center) visible.push(i); else hidden.push(i);
        }
        if (!visible.length || !hidden.length) continue;

        const hash = new Map<string, number[]>();
        const keyFor = (v: [number,number,number], dx=0, dy=0) => {
          const q1 = Math.floor((v[other[0]] - mins[other[0]]) / cell) + dx;
          const q2 = Math.floor((v[other[1]] - mins[other[1]]) / cell) + dy;
          return q1 + ":" + q2;
        };
        for (const i of visible) {
          const k = keyFor(points[i]);
          const bucket = hash.get(k);
          if (bucket) bucket.push(i); else hash.set(k, [i]);
        }

        const normalIndex = primitive.attributes?.NORMAL;
        const uvIndex = primitive.attributes?.TEXCOORD_0;
        const normal = typeof normalIndex === "number" ? accessorInfo(normalIndex) : null;
        const uv = typeof uvIndex === "number" ? accessorInfo(uvIndex) : null;

        for (const hi of hidden) {
          const hv = points[hi];
          let best = -1;
          let bestD = Infinity;
          for (let radius = 0; radius <= 4 && best < 0; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dy = -radius; dy <= radius; dy++) {
                if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const bucket = hash.get(keyFor(hv, dx, dy));
                if (!bucket) continue;
                for (const vi of bucket) {
                  const vv = points[vi];
                  const d1 = vv[other[0]] - hv[other[0]];
                  const d2 = vv[other[1]] - hv[other[1]];
                  const d = d1*d1 + d2*d2;
                  if (d < bestD) { bestD = d; best = vi; }
                }
              }
            }
          }
          if (best < 0) continue;

          const src = points[best];
          const mirrored: [number,number,number] = [src[0], src[1], src[2]];
          mirrored[axis] = 2 * center - src[axis];
          writeFloat3(pos, hi, mirrored);

          if (normal && normal.accessor.componentType === 5126 && normal.comps >= 3) {
            const nv = readFloat3(normal, best);
            if (nv) {
              nv[axis] = -nv[axis];
              writeFloat3(normal, hi, nv);
            }
          }
          if (uv) copyAccessorElement(uv, best, hi);
          totalMirrored++;
        }
      }
    }

    return { buffer: totalMirrored ? out : input, applied: totalMirrored > 0, mirroredVertices: totalMirrored, axis: selectedAxis };
  } catch (error) {
    console.error("[3D WORKSHOP] mirror post-process failed", error);
    return { buffer: input, applied: false, mirroredVertices: 0 };
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

  let glb = Buffer.from(await upstream.arrayBuffer());
  if (!glb.length) {
    return res.status(502).json({ error: "empty_model", message: "The 3D service returned an empty model." });
  }

  const hiddenSideMode = String(req.body?.hiddenSideMode || "infer");
  if (hiddenSideMode === "mirror") {
    const mirrored = mirrorVisibleSideInGlb(glb);
    glb = mirrored.buffer;
    res.setHeader("X-NovelIdeas-Mirror", mirrored.applied ? "applied" : "skipped");
    res.setHeader("X-NovelIdeas-Mirrored-Vertices", String(mirrored.mirroredVertices));
    if (typeof mirrored.axis === "number") res.setHeader("X-NovelIdeas-Mirror-Axis", String(mirrored.axis));
    console.log("[3D WORKSHOP] mirror post-process", {
      applied: mirrored.applied,
      mirroredVertices: mirrored.mirroredVertices,
      axis: mirrored.axis,
    });
  }

  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Content-Disposition", 'inline; filename="novelideas-model.glb"');
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(glb);
}
