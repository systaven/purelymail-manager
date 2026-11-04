// Browser-side calls to the server's /api. Errors keep the server's code so the
// UI can show them in the viewer's language (see useErrorText).

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code?: string, public params?: Record<string, string | number>) {
    super(message);
  }
}

// Set by the session provider when someone is signed in with Clerk.
let getToken: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (fn: typeof getToken) => {
  getToken = fn;
};

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken ? await getToken().catch(() => null) : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError('Network error', 0, 'network_error');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(data?.error || `Request failed (${response.status})`, response.status, data?.code, data?.params);
  }
  return data as T;
}
