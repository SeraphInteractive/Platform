export enum ErrorCode {
    BadRequest = "BAD_REQUEST",
    ValidationFailed = "VALIDATION_FAILED",
    Unauthorized = "UNAUTHORIZED",
    Forbidden = "FORBIDDEN",
    InsufficientRole = "INSUFFICIENT_ROLE",
    UserBlacklisted = "USER_BLACKLISTED",
    NotFound = "NOT_FOUND",
    RouteNotFound = "ROUTE_NOT_FOUND",
    Conflict = "CONFLICT",
    RoundNotOpen = "ROUND_NOT_OPEN",
    RoundNotClosed = "ROUND_NOT_CLOSED",
    RoundFinalized = "ROUND_FINALIZED",
    InvalidStatusTransition = "INVALID_STATUS_TRANSITION",
    BallotRejected = "BALLOT_REJECTED",
    EntryHasBallots = "ENTRY_HAS_BALLOTS",
    ActiveClaimExists = "ACTIVE_CLAIM_EXISTS",
    ShotUnavailable = "SHOT_UNAVAILABLE",
    SeniorPriorityLock = "SENIOR_PRIORITY_LOCK",
    SubmissionNotPending = "SUBMISSION_NOT_PENDING",
    UploadMissing = "UPLOAD_MISSING",
    InvalidLoginCode = "INVALID_LOGIN_CODE",
    TermsNotAccepted = "TERMS_NOT_ACCEPTED",
    VerificationRequired = "VERIFICATION_REQUIRED",
    VerificationFailed = "VERIFICATION_FAILED",
    AccountNotLinked = "ACCOUNT_NOT_LINKED",
    PayloadTooLarge = "PAYLOAD_TOO_LARGE",
    UnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE",
    TooManyRequests = "TOO_MANY_REQUESTS",
    ServiceUnavailable = "SERVICE_UNAVAILABLE",
    InternalError = "INTERNAL_ERROR"
}

export interface ErrorDetail {
    readonly path?: string;
    readonly code?: string;
    readonly message: string;
}

export class ApplicationError extends Error {
    public constructor(
        public readonly statusCode: number,
        public readonly code: ErrorCode,
        message: string,
        public readonly details: readonly ErrorDetail[] = [],
        public readonly headers: Readonly<Record<string, string>> = {}
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class BadRequestError extends ApplicationError {
    public constructor(message: string, code: ErrorCode = ErrorCode.BadRequest, details: readonly ErrorDetail[] = []) {
        super(400, code, message, details);
    }
}

export class UnauthorizedError extends ApplicationError {
    public constructor(message = "Authentication is required.") {
        super(401, ErrorCode.Unauthorized, message, [], { "WWW-Authenticate": "Bearer" });
    }
}

export class ForbiddenError extends ApplicationError {
    public constructor(message = "You are not allowed to perform this action.", code: ErrorCode = ErrorCode.Forbidden) {
        super(403, code, message);
    }
}

export class NotFoundError extends ApplicationError {
    public constructor(resource: string) {
        super(404, ErrorCode.NotFound, `${resource} was not found.`);
    }
}

export class ConflictError extends ApplicationError {
    public constructor(message: string, code: ErrorCode = ErrorCode.Conflict, details: readonly ErrorDetail[] = []) {
        super(409, code, message, details);
    }
}

export class UnprocessableError extends ApplicationError {
    public constructor(message: string, code: ErrorCode, details: readonly ErrorDetail[] = []) {
        super(422, code, message, details);
    }
}

export class ServiceUnavailableError extends ApplicationError {
    public constructor(message: string) {
        super(503, ErrorCode.ServiceUnavailable, message);
    }
}
