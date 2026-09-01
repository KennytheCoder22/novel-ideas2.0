import type { VercelRequest, VercelResponse } from "@vercel/node";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  adminPinProtectionState,
  hasAuthorizedAdminSession,
} from "../lib/adminAuthorizationServer";
import {
  loadSharedLibraryCollectionPayload,
  loadSharedLibraryCollectionResult,
  saveSharedLibraryCollection,
} from "../lib/librarySharing/storage";
import { normalizeHostedLibraryId } from "../lib/savedLibraries";

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

const MAX_COMPRESSED_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_DECOMPRESSED_ARTIFACT_BYTES = 32 * 1024 * 1024;

function readCollectionArtifact(body: Record<string, unknown>): Record<string, unknown> {
  const artifact = body.artifact;
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    return artifact as Record<string, unknown>;
  }
  if (body.artifactEncoding !== "gzip-base64" || typeof body.artifactGzipBase64 !== "string") {
    throw new Error("missing_artifact");
  }

  const compressed = Buffer.from(body.artifactGzipBase64, "base64");
  if (!compressed.length || compressed.length > MAX_COMPRESSED_ARTIFACT_BYTES) {
    throw new Error("compressed_artifact_size_invalid");
  }
  let decoded: unknown;
  try {
    const json = gunzipSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_ARTIFACT_BYTES }).toString("utf8");
    decoded = JSON.parse(json);
  } catch {
    throw new Error("compressed_artifact_invalid");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("compressed_artifact_invalid");
  }
  return decoded as Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const libraryId = normalizeHostedLibraryId(readLibraryId(req));
  if (!libraryId) {
    return res.status(400).json({ error: "missing_library_id" });
  }

  if (req.method === "GET") {
    try {
      if (String(req.query.compressed || "") === "1") {
        const artifact = await loadSharedLibraryCollectionPayload(libraryId);
        const payload = gzipSync(JSON.stringify({ artifact: artifact ?? null, artifactUrl: null }));
        if (payload.length > MAX_COMPRESSED_ARTIFACT_BYTES) {
          return res.status(413).json({ error: "compressed_collection_response_too_large" });
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(payload);
      }
      if (String(req.query.inline || "") === "1") {
        const artifact = await loadSharedLibraryCollectionPayload(libraryId);
        return res.status(200).json({ artifact: artifact ?? null, artifactUrl: null });
      }
      const result = await loadSharedLibraryCollectionResult(libraryId);
      return res.status(200).json({
        artifact: result.artifact ?? null,
        artifactUrl: result.artifactUrl ?? null,
      });
    } catch (error) {
      console.error("local-collection GET error:", error);
      return res.status(500).json({ error: "internal_server_error" });
    }
  }

  try {
    const protection = await adminPinProtectionState(libraryId);
    if (protection.pinEnabled && !hasAuthorizedAdminSession(req, libraryId)) {
      return res.status(403).json({ error: "unauthorized" });
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    let artifact: Record<string, unknown>;
    try {
      artifact = readCollectionArtifact(body);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "invalid_artifact" });
    }
    await saveSharedLibraryCollection(libraryId, artifact);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("local-collection POST error:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}
