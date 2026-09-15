export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'ORDER_STATE_CONFLICT'
  | 'CONCURRENT_MODIFICATION'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'OTP_RATE_LIMITED'
  | 'INVITATION_CODE_INVALID'
  | 'CONTACT_REQUIRED'
  | 'MODEL_FILE_REQUIRED'
  | 'MODEL_FILE_EMPTY'
  | 'MODEL_FILE_TOO_LARGE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
