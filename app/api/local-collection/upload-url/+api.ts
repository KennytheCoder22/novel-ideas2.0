/**
 * POST /api/local-collection/upload-url
 *
 * Handles both phases of the Vercel Blob client-upload protocol:
 *
 *   Phase 1 — generate-client-token
 *     The browser's upload() SDK call posts:
 *       { type: 'blob.generate-client-token', payload: { pathname, ... } }
 *     This endpoint validates the admin session, constrains the pathname to
 *     the expected collection path pattern, and returns a signed client token.
 *
 *   Phase 2 — upload-completed
 *     After the browser uploads directly to Vercel Blob, the upload() SDK
 *     posts back:
 *       { type: 'blob.upload-completed', payload: { blob, tokenPayload } }
 *     This endpoint stores the collection pointer so GET /api/local-collection
 *     can return the CDN URL to all devices.
 *
 * Only admin sessions (cookie: novelideas_admin_session_v1=1) may call this
 * endpoint. Unauthenticated requests are rejected with 403 in Phase 1 so no
 * upload token is ever issued.
 *
 * Collection payload size note:
 *   A 8,402-title collection with populated cover URLs can exceed 4.5 MB,
 *   which is Vercel's per-function request body limit. This client-upload
 *   design routes the collection payload directly from the browser to Vercel
 *   Blob storage, completely bypassing the Vercel Function. Only the small
 *   token-exchange and completion-notification messages pass through the
 *   function.
 */

import type { HandleUploadBody } from "@vercel/blob/client";
import { handleUpload } from "@vercel/blob/client";
import { ADMIN_SESSION_COOKIE_NAME } from "../../../../lib/adminSession";
import { collectionBlobPathname, recordSharedLibraryCollectionUrl } from "../../../../lib/librarySharing/storage";

/**
 * Collection pathname must match: libraries/{libraryId}/collection.json
 * Library ID is [a-z0-9_-]{1,128}.
 */
const COLLECTION_PATHNAME_RE = /^libraries\/[a-z0-9_-]{1,128}\/collection\.json$/;

function isAdminSession(request: Request): boolean {
  try {
    const cookies = request.headers.get("cookie") || "";
    return cookies.includes(`${ADMIN_SESSION_COOKIE_NAME}=1`);
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const isAdmin = isAdminSession(request);

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,

      onBeforeGenerateToken: async (pathname) => {
        // Reject unauthenticated requests before issuing any token
        if (!isAdmin) {
          throw new Error("unauthorized");
        }
        // Constrain to the expected collection pathname pattern
        if (!COLLECTION_PATHNAME_RE.test(pathname)) {
          throw new Error(`invalid_pathname: expected libraries/{libraryId}/collection.json, got: ${pathname}`);
        }
        // Extract libraryId from pathname for the completion callback
        const libraryId = pathname.split("/")[1] ?? "";
        return {
          allowedContentTypes: ["application/json"],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB ceiling (collections can be large)
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ libraryId }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by the browser SDK after the upload succeeds.
        // Store a tiny pointer blob so GET /api/local-collection can find the URL.
        try {
          const parsed = JSON.parse(tokenPayload ?? "{}") as { libraryId?: string };
          const libraryId = parsed.libraryId ?? "";
          if (!libraryId) throw new Error("missing libraryId in tokenPayload");
          // Sanity check: the uploaded path must still match expected pattern
          if (!COLLECTION_PATHNAME_RE.test(blob.pathname)) {
            throw new Error(`unexpected uploaded pathname: ${blob.pathname}`);
          }
          // Verify uploaded path matches the libraryId from the token
          const expectedPathname = collectionBlobPathname(libraryId);
          if (blob.pathname !== expectedPathname) {
            throw new Error(`pathname mismatch: token=${expectedPathname}, blob=${blob.pathname}`);
          }
          await recordSharedLibraryCollectionUrl(libraryId, blob.url);
        } catch (err) {
          console.error("local-collection upload-url onUploadCompleted error:", err);
          throw err;
        }
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "unauthorized") {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }
    if (msg.startsWith("invalid_pathname")) {
      return Response.json({ error: msg }, { status: 400 });
    }
    console.error("local-collection upload-url error:", error);
    return Response.json({ error: "upload_handler_failed", detail: msg }, { status: 400 });
  }
}
