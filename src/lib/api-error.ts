export function apiError(err: unknown, context = 'api'): Response {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  console.error(`[${context}]`, msg, err)
  return Response.json({ error: msg }, { status: 500 })
}

export function wrapHandler<T extends (req: Request) => Promise<Response>>(
  handler: T,
  context: string,
): (req: Request) => Promise<Response> {
  return (req) => handler(req).catch((e) => apiError(e, context))
}

export function wrapHandlerNoArgs(
  handler: () => Promise<Response>,
  context: string,
): () => Promise<Response> {
  return () => handler().catch((e) => apiError(e, context))
}
