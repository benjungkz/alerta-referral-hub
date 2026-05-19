import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, RateLimitBucket>();

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function getRateLimitKey(
  request: NextRequest,
  namespace: string,
  identity?: string | null,
) {
  const keyIdentity = identity?.trim() || getClientIp(request);

  return `${namespace}:${hashValue(keyIdentity)}`;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const existingBucket = buckets.get(key);

  if (!existingBucket || existingBucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (existingBucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existingBucket.resetAt - now) / 1000),
    };
  }

  existingBucket.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
