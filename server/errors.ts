// An error with an HTTP status and a stable code the web app translates.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public params?: Record<string, string | number>
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request', params?: Record<string, string | number>) =>
  new ApiError(message, 400, code, params);
