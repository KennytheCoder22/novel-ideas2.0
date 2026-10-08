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
    if (input.length < 20 || input.readUInt32LE(0) !== 0x46546c67) {
      return { buffer: input, applied: false, mirroredVertices: 0 };
    }

    let offset = 12;
    let json: any = null;
    let bin = Buffer.alloc(0);

    while (offset + 8 <= input.length) {
      const chunkLength = input.readUInt32LE(offset);
      const chunkType = input.readUInt32LE(offset + 4);
      const chunkData = offset + 8;
      if (chunkData + chunkLength > input.length) break;

      if (chunkType === 0x4e4f534a) {
        const raw = input.subarray(chunkData, chunkData + chunkLength).toString("utf8").replace(/\u0000/g, "").trim();
        json = JSON.parse(raw);
      } else if (chunkType === 0x004e4942) {
        bin = Buffer.from(input.subarray(chunkData, chunkData + chunkLength));
      }
      offset = chunkData + chunkLength;
    }

    if (!json?.accessors || !json?.bufferViews || !json?.meshes || !bin.length) {
      return { buffer: input, applied: false, mirroredVertices: 0 };
    }

    const componentBytes = (componentType: number) =>
      componentType === 5120 || componentType === 5121 ? 1 :
      componentType === 5122 || componentType === 5123 ? 2 :
      componentType === 5125 || componentType === 5126 ? 4 : 0;

    const typeCount = (type: string) =>
      type === "SCALAR" ? 1 :
      type === "VEC2" ? 2 :
      type === "VEC3" ? 3 :
      type === "VEC4" ? 4 : 0;

    const accessorInfo = (accessorIndex: number) => {
      const accessor = json.accessors[accessorIndex];
      if (!accessor || accessor.sparse || typeof accessor.bufferView !== "number") return null;
      const view = json.bufferViews[accessor.bufferView];
      if (!view || (view.buffer ?? 0) !== 0) return null;
      const bytes = componentBytes(accessor.componentType);
      const comps = typeCount(accessor.type);
      if (!bytes || !comps) return null;
      const stride = view.byteStride || bytes * comps;
      const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
      return { accessor, view, bytes, comps, stride, start };
    };

    const readComponent = (componentType: number, at: number) => {
      switch (componentType) {
        case 5120: return bin.readInt8(at);
        case 5121: return bin.readUInt8(at);
        case 5122: return bin.readInt16LE(at);
        case 5123: return bin.readUInt16LE(at);
        case 5125: return bin.readUInt32LE(at);
        case 5126: return bin.readFloatLE(at);
        default: return 0;
      }
    };

    const readVector = (info: any, index: number): number[] => {
      const at = info.start + index * info.stride;
      const values: number[] = [];
      for (let c = 0; c < info.comps; c++) {
        values.push(readComponent(info.accessor.componentType, at + c * info.bytes));
      }
      return values;
    };

    const readIndices = (primitive: any, vertexCount: number): number[] | null => {
      if (primitive.mode !== undefined && primitive.mode !== 4) return null;
      if (typeof primitive.indices !== "number") {
        return Array.from({ length: vertexCount }, (_, i) => i);
      }
      const info = accessorInfo(primitive.indices);
      if (!info || info.comps !== 1) return null;
      const result: number[] = [];
      for (let i = 0; i < info.accessor.count; i++) result.push(readVector(info, i)[0]);
      return result;
    };

    type ClipVertex = { p: number[]; n?: number[]; uv?: number[] };

    const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
    const normalize3 = (v?: number[]) => {
      if (!v || v.length < 3) return v;
      const length = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / length, v[1] / length, v[2] / length];
    };

    const clipTriangle = (triangle: ClipVertex[], axis: number, center: number): ClipVertex[] => {
      const result: ClipVertex[] = [];
      for (let i = 0; i < triangle.length; i++) {
        const current = triangle[i];
        const next = triangle[(i + 1) % triangle.length];
        const dc = current.p[axis] - center;
        const dn = next.p[axis] - center;
        // Stable Fast 3D places the camera-visible surface on the negative side
        // of the thin reconstruction axis. Keep that side and mirror it across
        // the center plane; keeping the positive side duplicates SF3D's inferred
        // (and often smeared) hidden surface.
        const currentInside = dc <= 1e-7;
        const nextInside = dn <= 1e-7;

        if (currentInside) result.push(current);
        if (currentInside !== nextInside) {
          const denominator = dc - dn;
          const t = Math.abs(denominator) < 1e-12 ? 0 : dc / denominator;
          const p = lerp(current.p, next.p, t);
          p[axis] = center;
          const n = current.n && next.n ? normalize3(lerp(current.n, next.n, t)) : undefined;
          const uv = current.uv && next.uv ? lerp(current.uv, next.uv, t) : undefined;
          result.push({ p, n, uv });
        }
      }
      return result;
    };

    const floatBuffer = (values: number[]) => {
      const buffer = Buffer.allocUnsafe(values.length * 4);
      values.forEach((value, i) => buffer.writeFloatLE(value, i * 4));
      return buffer;
    };

    const binParts: Buffer[] = [bin];
    let binLength = bin.length;

    const align4 = () => {
      const pad = (4 - (binLength % 4)) % 4;
      if (pad) {
        binParts.push(Buffer.alloc(pad));
        binLength += pad;
      }
    };

    const addBufferView = (data: Buffer, target?: number) => {
      align4();
      const byteOffset = binLength;
      binParts.push(data);
      binLength += data.length;
      const view: any = { buffer: 0, byteOffset, byteLength: data.length };
      if (target) view.target = target;
      json.bufferViews.push(view);
      return json.bufferViews.length - 1;
    };

    const addFloatAccessor = (values: number[], type: "VEC2" | "VEC3", target: number, includeBounds = false) => {
      const comps = type === "VEC2" ? 2 : 3;
      const viewIndex = addBufferView(floatBuffer(values), target);
      const count = values.length / comps;
      const accessor: any = {
        bufferView: viewIndex,
        byteOffset: 0,
        componentType: 5126,
        count,
        type,
      };
      if (includeBounds && count) {
        const min = Array(comps).fill(Infinity);
        const max = Array(comps).fill(-Infinity);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < comps; c++) {
            const value = values[i * comps + c];
            min[c] = Math.min(min[c], value);
            max[c] = Math.max(max[c], value);
          }
        }
        accessor.min = min;
        accessor.max = max;
      }
      json.accessors.push(accessor);
      return json.accessors.length - 1;
    };

    let mirroredVertices = 0;
    let selectedAxis: number | undefined;
    let processedPrimitives = 0;

    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives || []) {
        const positionIndex = primitive.attributes?.POSITION;
        if (typeof positionIndex !== "number") continue;

        const positionInfo = accessorInfo(positionIndex);
        if (!positionInfo || positionInfo.accessor.componentType !== 5126 || positionInfo.comps !== 3) continue;

        const vertexCount = Number(positionInfo.accessor.count || 0);
        if (!vertexCount) continue;

        const indices = readIndices(primitive, vertexCount);
        if (!indices || indices.length < 3 || indices.length % 3 !== 0) continue;

        const normalInfo =
          typeof primitive.attributes?.NORMAL === "number" ? accessorInfo(primitive.attributes.NORMAL) : null;
        const uvInfo =
          typeof primitive.attributes?.TEXCOORD_0 === "number" ? accessorInfo(primitive.attributes.TEXCOORD_0) : null;
        const canUseNormals = !!normalInfo && normalInfo.accessor.componentType === 5126 && normalInfo.comps >= 3;
        const canUseUvs = !!uvInfo && uvInfo.accessor.componentType === 5126 && uvInfo.comps >= 2;

        const sourcePositions: number[][] = [];
        const mins = [Infinity, Infinity, Infinity];
        const maxs = [-Infinity, -Infinity, -Infinity];

        for (let i = 0; i < vertexCount; i++) {
          const p = readVector(positionInfo, i).slice(0, 3);
          sourcePositions.push(p);
          for (let a = 0; a < 3; a++) {
            mins[a] = Math.min(mins[a], p[a]);
            maxs[a] = Math.max(maxs[a], p[a]);
          }
        }

        const extents = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
        const axis = extents.indexOf(Math.min(...extents));
        if (selectedAxis === undefined) selectedAxis = axis;
        const center = (mins[axis] + maxs[axis]) / 2;

        // The mirror plane handles left/right depth. Do not mirror the extreme
        // ends of the object's longest axis: those regions often contain a
        // single centerline feature (for example a head, nose, handle, spout,
        // tail, or tip). Mirroring those whole regions can create a second
        // head/feature instead of a symmetric hidden side.
        const otherAxes = [0, 1, 2].filter((candidate) => candidate !== axis);
        const longitudinalAxis = otherAxes.reduce((best, candidate) =>
          extents[candidate] > extents[best] ? candidate : best
        );
        const longitudinalExtent = Math.max(extents[longitudinalAxis], 1e-9);
        const endGuard = longitudinalExtent * 0.20;
        const guardedMin = mins[longitudinalAxis] + endGuard;
        const guardedMax = maxs[longitudinalAxis] - endGuard;

        const frontTriangles: ClipVertex[][] = [];
        const preservedEndTriangles: ClipVertex[][] = [];

        for (let i = 0; i < indices.length; i += 3) {
          const ids = [indices[i], indices[i + 1], indices[i + 2]];
          if (ids.some((id) => id < 0 || id >= vertexCount)) continue;

          const tri: ClipVertex[] = ids.map((id) => ({
            p: sourcePositions[id].slice(),
            n: canUseNormals ? readVector(normalInfo, id).slice(0, 3) : undefined,
            uv: canUseUvs ? readVector(uvInfo, id).slice(0, 2) : undefined,
          }));

          const centroidLongitudinal =
            (tri[0].p[longitudinalAxis] + tri[1].p[longitudinalAxis] + tri[2].p[longitudinalAxis]) / 3;

          if (centroidLongitudinal < guardedMin || centroidLongitudinal > guardedMax) {
            // Preserve Stability's original geometry at the longitudinal ends.
            // This keeps singular centerline structures singular instead of
            // cloning them across the symmetry plane.
            preservedEndTriangles.push(tri);
            continue;
          }

          const clipped = clipTriangle(tri, axis, center);
          if (clipped.length < 3) continue;

          for (let fan = 1; fan < clipped.length - 1; fan++) {
            frontTriangles.push([clipped[0], clipped[fan], clipped[fan + 1]]);
          }
        }

        if (!frontTriangles.length && !preservedEndTriangles.length) continue;

        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];

        const emit = (v: ClipVertex) => {
          positions.push(v.p[0], v.p[1], v.p[2]);
          if (canUseNormals) {
            const n = normalize3(v.n) || [0, 1, 0];
            normals.push(n[0], n[1], n[2]);
          }
          if (canUseUvs) {
            const uv = v.uv || [0, 0];
            uvs.push(uv[0], uv[1]);
          }
        };

        for (const tri of preservedEndTriangles) {
          emit(tri[0]);
          emit(tri[1]);
          emit(tri[2]);
        }

        for (const tri of frontTriangles) {
          emit(tri[0]);
          emit(tri[1]);
          emit(tri[2]);

          const mirrored = [tri[0], tri[2], tri[1]].map((source) => {
            const p = source.p.slice();
            p[axis] = 2 * center - p[axis];
            const n = source.n ? source.n.slice() : undefined;
            if (n) n[axis] = -n[axis];
            return { p, n, uv: source.uv ? source.uv.slice() : undefined };
          });

          emit(mirrored[0]);
          emit(mirrored[1]);
          emit(mirrored[2]);
          mirroredVertices += 3;
        }

        const attributes: any = {};
        attributes.POSITION = addFloatAccessor(positions, "VEC3", 34962, true);
        if (canUseNormals) attributes.NORMAL = addFloatAccessor(normals, "VEC3", 34962);
        if (canUseUvs) attributes.TEXCOORD_0 = addFloatAccessor(uvs, "VEC2", 34962);

        primitive.attributes = attributes;
        delete primitive.indices;
        delete primitive.targets;
        primitive.mode = 4;
        processedPrimitives++;
      }
    }

    if (!processedPrimitives || !mirroredVertices) {
      return { buffer: input, applied: false, mirroredVertices: 0, axis: selectedAxis };
    }

    align4();
    const newBin = Buffer.concat(binParts, binLength);
    json.buffers = json.buffers || [{ byteLength: newBin.length }];
    json.buffers[0] = { ...(json.buffers[0] || {}), byteLength: newBin.length };

    let jsonChunk = Buffer.from(JSON.stringify(json), "utf8");
    const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
    if (jsonPad) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(jsonPad, 0x20)]);

    const binPad = (4 - (newBin.length % 4)) % 4;
    const binChunk = binPad ? Buffer.concat([newBin, Buffer.alloc(binPad)]) : newBin;

    const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const output = Buffer.allocUnsafe(totalLength);
    let outOffset = 0;

    output.writeUInt32LE(0x46546c67, outOffset); outOffset += 4;
    output.writeUInt32LE(2, outOffset); outOffset += 4;
    output.writeUInt32LE(totalLength, outOffset); outOffset += 4;

    output.writeUInt32LE(jsonChunk.length, outOffset); outOffset += 4;
    output.writeUInt32LE(0x4e4f534a, outOffset); outOffset += 4;
    jsonChunk.copy(output, outOffset); outOffset += jsonChunk.length;

    output.writeUInt32LE(binChunk.length, outOffset); outOffset += 4;
    output.writeUInt32LE(0x004e4942, outOffset); outOffset += 4;
    binChunk.copy(output, outOffset);

    return { buffer: output, applied: true, mirroredVertices, axis: selectedAxis };
  } catch (error) {
    console.error("[3D WORKSHOP] mirror geometry rebuild failed", error);
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
