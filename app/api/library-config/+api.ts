import { ExpoRequest, ExpoResponse } from "expo-server";
import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  loadSharedLibraryConfigPayload,
  saveSharedLibraryConfig,
} from "../../../lib/librarySharing/storage";

function isAdminSession(request: ExpoRequest): boolean {
  try {
    const cookies = request.headers.get("cookie") || "";
    return cookies.includes(`${ADMIN_SESSION_COOKIE_NAME}=1`);
  } catch {
    return false;
  }
}

export async function GET(request: ExpoRequest): Promise<ExpoResponse> {
  try {
    const url = new URL(request.url);
    const libraryId = url.searchParams.get("libraryId");

    if (!libraryId || !String(libraryId).trim()) {
      return new ExpoResponse(
        JSON.stringify({ error: "missing_library_id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const config = await loadSharedLibraryConfigPayload(libraryId);
    if (!config) {
      return new ExpoResponse(JSON.stringify({ config: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new ExpoResponse(JSON.stringify({ config }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("library-config GET error:", error);
    return new ExpoResponse(
      JSON.stringify({ error: "internal_server_error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function POST(request: ExpoRequest): Promise<ExpoResponse> {
  try {
    // Only admin sessions can write shared config
    if (!isAdminSession(request)) {
      return new ExpoResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new ExpoResponse(
        JSON.stringify({ error: "invalid_request_body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const libraryId = body.libraryId;
    if (!libraryId || !String(libraryId).trim()) {
      return new ExpoResponse(
        JSON.stringify({ error: "missing_library_id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const config = body.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return new ExpoResponse(
        JSON.stringify({ error: "missing_or_invalid_config" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await saveSharedLibraryConfig(libraryId, config);
    return new ExpoResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("library-config POST error:", error);
    return new ExpoResponse(
      JSON.stringify({ error: "internal_server_error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
