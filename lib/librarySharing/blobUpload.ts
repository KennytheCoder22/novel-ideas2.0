/**
 * lib/librarySharing/blobUpload.ts — Native stub.
 *
 * Metro uses this file when bundling for iOS/Android.
 * The real web implementation lives in blobUpload.web.ts and is only
 * bundled for web builds. This stub ensures no @vercel/blob dependencies
 * are included in the native bundle.
 */
import type { LocalCollectionArtifact } from "../localCollection/types";

export async function uploadCollectionToBlob(
  _libraryId: string,
  _artifact: LocalCollectionArtifact
): Promise<boolean> {
  return false; // Blob upload is web-only; not available in native builds.
}
