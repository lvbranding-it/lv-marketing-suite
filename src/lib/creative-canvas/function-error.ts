interface FunctionErrorPayload {
  error?: unknown;
  message?: unknown;
  code?: unknown;
}

/**
 * Supabase wraps every non-2xx Edge Function response in a generic
 * FunctionsHttpError. The useful JSON returned by our function remains on its
 * Response context, so unwrap it before anything reaches a toast or canvas
 * failure card.
 */
export async function creativeFunctionError(error: unknown) {
  const wrapped = error as { context?: unknown; message?: unknown } | null;
  let payload: FunctionErrorPayload | undefined;
  let status: number | undefined;

  if (wrapped?.context instanceof Response) {
    status = wrapped.context.status;
    payload = await wrapped.context.clone().json().catch(() => undefined) as FunctionErrorPayload | undefined;
  }

  const serverMessage = typeof payload?.error === "string" ? payload.error
    : typeof payload?.message === "string" ? payload.message
      : undefined;
  const fallback = error instanceof Error && error.message
    ? error.message
    : "Creative Canvas could not complete the request.";
  const result = new Error(serverMessage || fallback);
  Object.assign(result, { cause: error });

  if (typeof payload?.code === "string") Object.assign(result, { code: payload.code });
  if (status) Object.assign(result, { status });
  return result;
}
