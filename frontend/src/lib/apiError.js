/**
 * Normalize axios / network errors into a stable shape the UI can render.
 * @param {unknown} err
 * @returns {{message: string, code: string, status: number|null, details: any}}
 */
export function toApiError(err) {
  const res = err?.response;
  if (res) {
    const d = res.data ?? {};
    return {
      message: d.message || 'Something went wrong. Please try again.',
      code: d.code || 'UNKNOWN',
      status: res.status,
      details: d.details,
    };
  }
  if (err?.code === 'ECONNABORTED') {
    return {
      message: 'The request timed out. Please try again.',
      code: 'TIMEOUT',
      status: null,
      details: null,
    };
  }
  return {
    message: err?.request
      ? 'Cannot reach the server. Check your connection.'
      : (err?.message ?? 'Unexpected error'),
    code: 'NETWORK',
    status: null,
    details: null,
  };
}

/** First field-level message for a path, from the API's `details` array. */
export const fieldError = (details, path) =>
  Array.isArray(details) ? details.find((d) => d.path === path)?.message : undefined;
