export class HahaApiError extends Error {
  constructor(message, {code, status, response} = {}) {
    super(message);
    this.name = 'HahaApiError';
    this.code = code;
    this.status = status;
    this.response = response;
  }
}

export const getErrorMessage = error => {
  if (error instanceof HahaApiError) {
    return error.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};
