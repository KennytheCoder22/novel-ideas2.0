import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasAuthorizedAdminSession } from "../lib/adminAuthorizationServer";
import {
  loadSharedLibraryConfigPayload,
  loadSharedLibraryCollectionPayload,
  loadSharedLibraryCollectionRejectedRecordsPage,
  saveSharedLibraryCollectionRejectedRecordsPage,
} from "../lib/librarySharing/storage";
import type { LocalCollectionRejectedRecordsPage } from "../lib/localCollection/rejectedRecords";
import { normalizeHostedLibraryId } from "../lib/savedLibraries";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const libraryId = normalizeHostedLibraryId(String(req.query.libraryId || ""));
  if (!libraryId) return res.status(400).json({ error: "missing_library_id" });
  try {
    const config = await loadSharedLibraryConfigPayload(libraryId);
    if (!config) return res.status(503).json({ error: "library_config_unavailable" });
    const adminConfig = config.admin && typeof config.admin === "object" && !Array.isArray(config.admin)
      ? config.admin as Record<string, unknown>
      : {};
    if (adminConfig.pinEnabled === true && !hasAuthorizedAdminSession(req, libraryId)) {
      return res.status(403).json({ error: "unauthorized" });
    }
    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const page = body.reportPage;
      if (!page || typeof page !== "object" || Array.isArray(page)) {
        return res.status(400).json({ error: "missing_rejected_records_page" });
      }
      await saveSharedLibraryCollectionRejectedRecordsPage(
        libraryId,
        page as LocalCollectionRejectedRecordsPage,
      );
      return res.status(200).json({ success: true });
    }
    const collection = await loadSharedLibraryCollectionPayload(libraryId);
    const version = collection?.collectionVersion;
    const artifactId = version && typeof version === "object" && !Array.isArray(version)
      ? String((version as Record<string, unknown>).artifactId || "")
      : "";
    if (!artifactId) return res.status(200).json({ report: null });
    const requestedOffset = Number(req.query.offset || 0);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const report = await loadSharedLibraryCollectionRejectedRecordsPage(libraryId, artifactId, offset);
    if (!report) return res.status(200).json({ report: null });
    return res.status(200).json({
      report,
      offset,
      returned: report.records.length,
    });
  } catch (error) {
    console.error("local-collection-diagnostics GET error:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}
