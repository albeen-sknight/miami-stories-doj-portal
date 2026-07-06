import type { ApiErrorResponse } from "@shotta-doj/shared";

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers
    }
  });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { location }
  });
}

export function errorJson(code: string, message: string, status = 500): Response {
  const payload: ApiErrorResponse = { error: { code, message } };
  return json(payload, { status });
}

export function notFound(): Response {
  return errorJson("NOT_FOUND", "The requested API route does not exist.", 404);
}
