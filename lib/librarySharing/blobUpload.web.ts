/**
 * lib/librarySharing/blobUpload.web.ts — Web-only Vercel Blob upload.
 *
 * Metro uses this file ONLY for web builds (the .web.ts extension is
 * resolved over .ts on web). The native stub (blobUpload.ts) is used for
 * iOS/Android builds, ensuring @vercel/blob/client is never included in
 * the native bundle.
 *
 * DO NOT import this file from any module that is part of the Expo native
 * bundle. Only import from web-specific admin code (app/app_admin-web.tsx).
 */
import { upload } from "@vercel/blob/client";
import type { LocalCollectionArtifact } from "../localCollection/types";
import { buildRecommendationArtifact } from "../localCollection/storage";

/**
 * Upload the recommendation artifact for a library directly from the browser
 * to Vercel Blob, bypassing the 4.5 MB Vercel Function body limit.
 *
 * The browser SDK calls /api/local-collection/upload-url twice:
 *   1. To get a signed client token (admin session cookie verified server-side)
 *   2. To notify the server after upload completes (server writes the pointer)
 *
 * Returns true on success, false on any failure (token error, network error,
 * BLOB_READ_WRITE_TOKEN not configured in Vercel, etc.).
 *
 * When false is returned, the caller should fall back to the server-side POST
 * path via publishSharedLocalCollectionRecommendationArtifact, which works in
 * local_filesystem mode (local dev) but is rejected by the server in
 * vercel_blob mode if the payload exceeds 4.5 MB.
 */
export async function uploadCollectionToBlob(
  libraryId: string,
  artifact: LocalCollectionArtifact
): Promise<boolean> {
  const id = String(libraryId || "").trim();
  if (!id) return false;
  try {
    const recommendationArtifact = buildRecommendationArtifact(artifact);
    const json = JSON.stringify(recommendationArtifact);
    const blob = new Blob([json], { type: "application/json" });
    const handleUploadUrl = new URL(
      "/api/local-collection/upload-url",
      window.location.origin
    ).toString();
    await upload(`libraries/${id}/collection.json`, blob, {
      access: "public",
      handleUploadUrl,
    });
    return true;
  } catch {
    return false;
  }
}
