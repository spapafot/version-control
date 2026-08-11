import { API_BASE } from "./auth-config";
import type { ProgressBlob } from "./progress-merge";
import type { Certificate } from "./certificate";

/**
 * Typed error for non-2xx API responses. `code` carries the backend's
 * machine-readable reason (e.g. "incomplete", "display_name_required").
 */
export class ApiError extends Error {
  status: number;
  code: string;
  /** for code "incomplete": slugs still missing server-side */
  missing?: string[];

  constructor(status: number, code: string, message?: string, missing?: string[]) {
    super(message ?? `${status} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.missing = missing;
  }
}

export interface MeResponse {
  profile: { email: string; displayName: string | null };
  progress: ProgressBlob | null;
  certificate: Certificate | null;
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Bearer token; required for the authenticated endpoints. */
  token?: string;
}

/**
 * Fetch against the certification API. Never throws anything but ApiError
 * (network failures become ApiError with status 0 / code "network").
 */
export async function apiFetch<T>(path: string, { method = "GET", body, token }: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "The certification service is unreachable.");
  }

  if (!res.ok) {
    let code = "http_error";
    let message: string | undefined;
    let missing: string[] | undefined;
    try {
      const raw = (await res.json()) as Record<string, unknown>;
      // FastAPI nests HTTPException payloads under "detail"; accept both shapes.
      const data = (typeof raw.detail === "object" && raw.detail !== null ? raw.detail : raw) as Record<string, unknown>;
      if (typeof data.code === "string") code = data.code;
      if (typeof data.message === "string") message = data.message;
      else if (typeof raw.detail === "string") message = raw.detail;
      if (Array.isArray(data.missing)) missing = data.missing.filter((m): m is string => typeof m === "string");
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiError(res.status, code, message, missing);
  }

  return (await res.json()) as T;
}
