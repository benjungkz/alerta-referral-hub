type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  event: string;
  message?: string;
  request_id?: string;
  partner_id?: string;
  error_code?: string;
  field?: string;
  metadata?: Record<string, unknown>;
}

function log(level: LogLevel, payload: LogPayload) {
  const logData = {
    level,
    timestamp: new Date().toISOString(),
    service: "alerta-referral-api",
    environment: process.env.NODE_ENV,
    ...payload,
  };

  console[level](JSON.stringify(logData));
}

export const logger = {
  info: (payload: LogPayload) => log("info", payload),
  warn: (payload: LogPayload) => log("warn", payload),
  error: (payload: LogPayload) => log("error", payload),
};

// CREATE_PARTNER_REQUEST_RECEIVED;
// CREATE_PARTNER_VALIDATION_FAILED;
// CREATE_PARTNER_DUPLICATE_EMAIL;
// CREATE_PARTNER_DB_PUT_STARTED;
// CREATE_PARTNER_SUCCESS;
// CREATE_PARTNER_DB_ERROR;
