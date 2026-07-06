import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import type { Express } from 'express';

export type ApiResponse<T = any> = {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: T;
  text: string;
  redirectUrl?: string;
  cookies?: Record<string, unknown>;
};

export function apiRequest<T = any>(
  app: Express,
  options: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    const req = httpMocks.createRequest({
      method: options.method,
      url: options.path,
      path: options.path,
      query: options.query,
      headers,
      body: options.body,
      ip: '127.0.0.1',
    });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => {
      const text = res._getData();
      let body: T;
      try {
        body = res._getJSONData() as T;
      } catch {
        body = text as T;
      }
      resolve({
        status: res.statusCode,
        headers: res._getHeaders(),
        body,
        text: String(text ?? ''),
        redirectUrl: typeof res._getRedirectUrl === 'function' ? res._getRedirectUrl() : undefined,
        cookies: typeof res._getCookies === 'function' ? res._getCookies() : undefined,
      });
    });
    res.on('error', reject);
    app.handle(req, res, reject);
  });
}
