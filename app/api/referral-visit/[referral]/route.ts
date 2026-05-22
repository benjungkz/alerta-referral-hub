import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "@/lib/dynamodb";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitedResponse,
} from "@/lib/rateLimit";
import { getUnconvertedSessionExpiresAt } from "@/lib/referralTtl";
import { getShopifyHomeUrl } from "@/lib/urlConfig";

const TABLE_NAME =
  process.env.DYNAMODB_REFERRAL_SESSIONS_TABLE || "referral_sessions";
const REFERRAL_LINKS_TABLE =
  process.env.DYNAMODB_REFERRAL_LINKS_TABLE || "referral_links";
const REFERRAL_LINKS_PARTNER_ID_INDEX =
  process.env.DYNAMODB_REFERRAL_LINKS_PARTNER_ID_INDEX || "partner_id-GSI";
const REFERRAL_REGEX = /^[A-Z]{2,20}-[A-Z0-9]{4}$/;

async function getReferralLinkData(partnerId: string) {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: REFERRAL_LINKS_TABLE,
      IndexName: REFERRAL_LINKS_PARTNER_ID_INDEX,
      KeyConditionExpression: "partner_id = :partner_id",
      ExpressionAttributeValues: {
        ":partner_id": partnerId,
      },
      ProjectionExpression: "referral_link_id, utm",
      Limit: 1,
    }),
  );

  return result.Items?.[0] as
    | { referral_link_id?: string; utm?: Record<string, string> }
    | undefined;
}

function appendUtmParams(url: URL, utm?: Record<string, string> | null) {
  if (!utm) return;

  Object.entries(utm).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(`utm_${key}`, value);
    }
  });
}

function getDeviceType(userAgent: string) {
  const agent = userAgent.toLowerCase();

  if (/tablet|ipad|playbook|silk|kindle/.test(agent)) {
    return "tablet";
  }

  if (
    /mobile|iphone|android|blackberry|opera mini|iemobile|windows phone/.test(
      agent,
    )
  ) {
    return "mobile";
  }

  if (/windows|macintosh|linux|cros|x11/.test(agent)) {
    return "desktop";
  }

  return "unknown";
}

function getGeoDataFromHeaders(request: NextRequest) {
  const getDecodedHeader = (name: string) => {
    const value = request.headers.get(name);

    if (!value) return "";

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const countryCode =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("cloudfront-viewer-country") ||
    request.headers.get("x-vercel-ip-country") ||
    "";
  const region =
    request.headers.get("cloudfront-viewer-country-region") ||
    getDecodedHeader("cloudfront-viewer-country-region-name") ||
    request.headers.get("x-vercel-ip-country-region") ||
    "";

  if (!countryCode && !region) return undefined;

  return {
    country_code: countryCode,
    region,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ referral: string }> },
) {
  const rateLimit = checkRateLimit({
    key: getRateLimitKey(request, "referral-visit"),
    limit: 120,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const { referral } = await context.params;
  const referralId = referral?.trim().toUpperCase();

  // validate referral ID format - it should be in the format ABCDE-1234 (2-20 uppercase letters, a dash, and 4 alphanumeric characters)
  if (!referralId || !REFERRAL_REGEX.test(referralId)) {
    return NextResponse.json(
      { success: false, error: "Invalid referral ID format." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const referrer = String(
    body.referrer || request.headers.get("referer") || "",
  );
  const userAgent = request.headers.get("user-agent") || "";
  const deviceType = getDeviceType(userAgent);
  const geo = getGeoDataFromHeaders(request);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const sessionId = randomUUID();
  const redirectUrl = getShopifyHomeUrl();

  // validate referral ID by checking if it exists in the referral_links table
  const referralLinkData = await getReferralLinkData(referralId);

  if (!referralLinkData) {
    console.warn("Invalid referral ID attempted:", { referralId });

    return NextResponse.json(
      { success: false, error: "Invalid referral ID. ID is not found." },
      { status: 404 },
    );
  }

  const referralLinkId = referralLinkData.referral_link_id || referralId;
  const referralUtm = referralLinkData.utm;

  // set param for tracking in Shopify analytics - this will be used to attribute the visit to the referral link
  redirectUrl.searchParams.set("ref", referralId);
  appendUtmParams(redirectUrl, referralUtm);
  redirectUrl.searchParams.set("session_id", sessionId);

  // Save referral session data to DynamoDB for analytics and tracking purposes
  const sessionItem = {
    session_id: sessionId,
    partner_id: referralId,
    referral_link_id: referralLinkId,
    landing_url: redirectUrl.toString(),
    referrer_url: referrer,
    first_seen_at: now,
    last_seen_at: now,
    device_type: deviceType,
    conversion_status: "unconverted",
    expires_at: getUnconvertedSessionExpiresAt(nowDate),
    geo,
    utm: referralUtm,
  };

  console.info("Saving referral session:", {
    referralId,
    deviceType,
    hasGeo: !!geo,
    hasReferrer: !!referrer,
  });

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: sessionItem,
      }),
    );
  } catch (error) {
    console.error("Failed to save referral session:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save referral session.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    redirectUrl: redirectUrl.toString(),
  });
}
