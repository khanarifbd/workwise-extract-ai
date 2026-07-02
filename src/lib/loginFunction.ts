const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type LoginFunctionOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
};

export type LoginFunctionResult<T> = {
  data: T | null;
  error: Error | null;
  status: number | null;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isTransientStatus = (status: number | null) => {
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return fallback;
};

export async function callLoginFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: LoginFunctionOptions = {},
): Promise<LoginFunctionResult<T>> {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 15000;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      data: null,
      error: new Error('Login service is not configured. Please refresh and try again.'),
      status: null,
    };
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${functionName}`;
  let last: LoginFunctionResult<T> = { data: null, error: new Error('Login service could not be reached.'), status: null };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          'x-client-info': 'genie-login-stable-fetch',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { error: text };
        }
      }

      if (response.ok) {
        return { data: payload as T, error: null, status: response.status };
      }

      last = {
        data: payload as T,
        error: new Error(getErrorMessage(payload, response.status === 401 ? 'Login details were not accepted.' : 'Login service is temporarily unavailable.')),
        status: response.status,
      };

      if (!isTransientStatus(response.status) || attempt === maxAttempts - 1) return last;
    } catch (err) {
      last = {
        data: null,
        error: err instanceof DOMException && err.name === 'AbortError'
          ? new Error('Login took too long. Please check your connection and try again.')
          : err instanceof Error
            ? err
            : new Error('Login service could not be reached.'),
        status: null,
      };

      if (attempt === maxAttempts - 1) return last;
    } finally {
      window.clearTimeout(timeout);
    }

    await wait(350 * (attempt + 1));
  }

  return last;
}