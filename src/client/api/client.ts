const baseUrl = import.meta.env.VITE_API_URL ?? '';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  return payload.data as T;
}
