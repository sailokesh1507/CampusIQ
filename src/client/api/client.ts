const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const apiUrl = (path: string) => `${baseUrl}${path}`;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), { ...options, headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  return payload.data as T;
}
