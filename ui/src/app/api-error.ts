// Shared classification of analytics-API failures so the UI can show the *real*
// reason (e.g. "Fabric capacity is paused") and what to do about it - instead of
// a generic "Failed to fetch" - which matters most during a live demo.

export interface ApiErrorInfo {
  title: string;        // headline reason
  remediation: string;  // concrete next step
  detail: string;       // technical detail (collapsible)
  category: string;     // capacity_paused | auth | timeout | unreachable | circuit_open | config | query_error
  status: number;       // HTTP status (0 = network/abort)
}

export class ApiError extends Error {
  readonly info: ApiErrorInfo;
  constructor(info: ApiErrorInfo) {
    super(info.title);
    this.name = 'ApiError';
    this.info = info;
  }
}

export function configApiError(): ApiError {
  return new ApiError({
    title: 'The analytics API is not configured yet.',
    remediation: 'Publish runtime-config.json with the API base URL (and sign in). Until then the app cannot reach live telemetry.',
    detail: 'apiBaseUrl is empty in runtime-config.json.',
    category: 'config',
    status: 0,
  });
}

const _STATUS_FALLBACK: Record<number, { title: string; remediation: string; category: string }> = {
  401: { title: 'Sign-in is required to reach the analytics API.', remediation: 'Click "Sign in", then retry.', category: 'auth' },
  403: { title: 'Not authorized to reach the analytics API.', remediation: 'Confirm your account has access, then retry.', category: 'auth' },
  429: { title: 'The gateway is rate-limiting requests.', remediation: 'Wait a few seconds and retry.', category: 'timeout' },
  502: { title: 'The analytics API could not reach Microsoft Fabric.', remediation: 'The Fabric capacity may be paused - resume it (Azure portal -> Fabric capacity -> Resume) and retry.', category: 'query_error' },
  503: { title: 'The analytics service is temporarily unavailable.', remediation: 'It auto-recovers in a few seconds - retry. If it persists, resume the Fabric capacity.', category: 'unreachable' },
  504: { title: 'The analytics query timed out.', remediation: 'The Fabric capacity may be resuming. Wait a few seconds and retry.', category: 'timeout' },
};

/** Build an ApiError from a non-OK Response, preferring the API's structured reason. */
export async function toApiError(response: Response): Promise<ApiError> {
  let reason = '';
  let remediation = '';
  let detail = '';
  let category = '';
  try {
    const body = await response.clone().json();
    const d = body?.detail;
    if (d && typeof d === 'object') {
      reason = d.reason ?? '';
      remediation = d.remediation ?? '';
      detail = d.detail ?? '';
      category = d.category ?? '';
    } else if (typeof d === 'string') {
      detail = d;
    }
  } catch {
    // Non-JSON body (e.g. an SPA HTML page when the API base URL is wrong).
    detail = 'The response was not valid JSON - the API base URL may be pointing at the web host instead of the analytics API.';
  }
  if (!reason) {
    const fb = _STATUS_FALLBACK[response.status] ?? {
      title: `The analytics API returned HTTP ${response.status}.`,
      remediation: 'Retry, or confirm the API is reachable.',
      category: 'query_error',
    };
    reason = fb.title;
    remediation = fb.remediation;
    category = fb.category;
  }
  return new ApiError({ title: reason, remediation, detail: detail || `HTTP ${response.status}`, category, status: response.status });
}

/** Build an ApiError from a thrown network/abort error. */
export function networkApiError(error: unknown): ApiError {
  const isAbort = error instanceof DOMException && error.name === 'AbortError';
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError({
    title: isAbort ? 'The analytics API did not respond in time.' : 'Cannot reach the analytics API.',
    remediation: isAbort
      ? 'The API or the Fabric capacity may be starting up. Wait a few seconds and retry.'
      : 'Confirm the API is running and reachable (network / VNet), then retry.',
    detail: message,
    category: isAbort ? 'timeout' : 'unreachable',
    status: 0,
  });
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return networkApiError(error);
}
