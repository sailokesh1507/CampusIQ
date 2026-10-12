import type { Request, Response } from 'express';
import app from '../src/index.js';

function routeFromRewrite(request: Request): string {
  const route = request.query.__route;
  if (typeof route === 'string' && route.startsWith('/')) return route;
  return request.path === '/api/index' ? '/api' : request.path;
}

export default function handler(request: Request, response: Response): void {
  const route = routeFromRewrite(request);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query)) {
    if (key === '__route') continue;
    if (Array.isArray(value)) for (const item of value) query.append(key, String(item));
    else if (value !== undefined) query.set(key, String(value));
  }
  request.url = `${route}${query.toString() ? `?${query.toString()}` : ''}`;
  app(request, response);
}
