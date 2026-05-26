import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRackCardWithPlacid } from "@/lib/createRackCard";
import {
  createPartnerWithReferralLink,
  updatePartnerProcessingStatus,
  updateReferralResourcesAtomic,
} from "../../../lib/partners";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitedResponse,
} from "@/lib/rateLimit";
import { sendReferralNotificationEmail } from "@/lib/sendReferralNotificationEmail";
import type { PartnerStatus, ReportingGroup, SegmentCode } from "@/types/db";

const API_KEY_HEADER = "x-alerta-api-key";
const REFERRAL_ID_REGEX = /^[A-Z]{2,20}-[A-Z0-9]{4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+().\-\s]{7,30}$/;
const ALLOWED_STATUSES = [
  "active",
  "inactive",
] as const satisfies readonly PartnerStatus[];
const ALLOWED_SEGMENTS = [
  "share-awareness",
  "conversion-only",
] as const satisfies readonly SegmentCode[];
const ALLOWED_REPORTING_GROUPS = [
  "marketing",
  "operation",
] as const satisfies readonly ReportingGroup[];

function getExpectedApiKey() {
  const envName =
    process.env.NODE_ENV === "production"
      ? "ALERTA_API_KEY_PROD"
      : "ALERTA_API_KEY_DEV";

  return {
    envName,
    apiKey: process.env[envName]?.trim(),
  };
}

function isValidApiKey(providedApiKey: string | null, expectedApiKey: string) {
  if (!providedApiKey) {
    return false;
  }

  const providedBuffer = Buffer.from(providedApiKey.trim());
  const expectedBuffer = Buffer.from(expectedApiKey);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function getStringField(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
) {
  const value = body[field];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue.length > maxLength) {
    return undefined;
  }

  return trimmedValue;
}

function getOptionalStringField(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
) {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.length <= maxLength ? trimmedValue : undefined;
}

function isOneOf<T extends readonly string[]>(
  value: string | undefined,
  allowedValues: T,
): value is T[number] {
  return !!value && allowedValues.includes(value);
}

function normalizeConsent(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();

  if (normalizedValue === "yes") return "Yes";
  if (normalizedValue === "no") return "No";

  return undefined;
}

function isValidIsoDate(value: string) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString();
}

function getReferralPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      error: "Request body must be a JSON object",
    } as const;
  }

  const payload = body as Record<string, unknown>;
  const firstName = getStringField(payload, "first_name", 100);
  const lastName = getStringField(payload, "last_name", 100);
  const email = getStringField(payload, "email", 254)?.toLowerCase();
  const referralId = getStringField(payload, "referral_id", 25)?.toUpperCase();
  const phone = getStringField(payload, "phone", 30);
  const rawStatus =
    getOptionalStringField(payload, "status", 30)?.toLowerCase() || "active";
  const segment =
    getOptionalStringField(payload, "segment", 50)?.toLowerCase() ||
    "share-awareness";
  const reportingGroup =
    getOptionalStringField(payload, "reporting_group", 50)?.toLowerCase() ||
    "marketing";
  const organizationName = getOptionalStringField(
    payload,
    "organization_name",
    200,
  );
  const notes = getOptionalStringField(payload, "notes", 2000) || "";
  const consent = normalizeConsent(getStringField(payload, "consent", 10));
  const createdAt =
    getOptionalStringField(payload, "created_at", 40) || new Date().toISOString();

  const missingFields = [
    ["first_name", firstName],
    ["last_name", lastName],
    ["email", email],
    ["referral_id", referralId],
    ["phone", phone],
    ["consent", consent],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing or invalid required fields: ${missingFields.join(", ")}`,
      referralId,
    } as const;
  }

  if (!EMAIL_REGEX.test(email!)) {
    return { valid: false, error: "Invalid email format", referralId } as const;
  }

  if (!REFERRAL_ID_REGEX.test(referralId!)) {
    return { valid: false, error: "Invalid referral ID format", referralId } as const;
  }

  if (!PHONE_REGEX.test(phone!)) {
    return { valid: false, error: "Invalid phone format", referralId } as const;
  }

  if (!isOneOf(rawStatus, ALLOWED_STATUSES)) {
    return { valid: false, error: "Invalid referral status", referralId } as const;
  }

  if (!isOneOf(segment, ALLOWED_SEGMENTS)) {
    return { valid: false, error: "Invalid segment", referralId } as const;
  }

  if (!isOneOf(reportingGroup, ALLOWED_REPORTING_GROUPS)) {
    return { valid: false, error: "Invalid reporting group", referralId } as const;
  }

  if (!isValidIsoDate(createdAt)) {
    return { valid: false, error: "Invalid created_at format", referralId } as const;
  }

  return {
    valid: true,
    data: {
      firstName: firstName!,
      lastName: lastName!,
      email: email!,
      referralId: referralId!,
      phone: phone!,
      status: rawStatus,
      segment,
      reportingGroup,
      organizationName,
      notes,
      consent: consent!,
      createdAt,
      contactName: `${firstName} ${lastName}`,
    },
  } as const;
}

/**
 * POST /api/referrals
 *
 * Receives new referral applicant data from Google Sheets webhook.
 *
 * Flow:
 * 1. Receive referral data from Google Apps Script
 * 2. Validate required fields
 * 3. Normalize data
 * 4. TODO: Save referral applicant to DB
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key for authentication
    const { apiKey: expectedApiKey, envName } = getExpectedApiKey();

    if (!expectedApiKey) {
      console.error(`Missing ${envName} environment variable.`);
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 },
      );
    }

    const providedApiKey = request.headers.get(API_KEY_HEADER);
    const rateLimit = checkRateLimit({
      key: getRateLimitKey(request, "referrals", providedApiKey),
      limit: 30,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit.retryAfterSeconds);
    }

    if (!isValidApiKey(providedApiKey, expectedApiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const validation = getReferralPayload(body);

    if (!validation.valid) {
      console.warn("Referral webhook validation failed:", {
        referralId: validation.referralId,
        error: validation.error,
      });

      return NextResponse.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const {
      firstName,
      lastName,
      email,
      referralId,
      phone,
      status,
      segment,
      reportingGroup,
      organizationName,
      notes,
      consent,
      createdAt,
      contactName,
    } = validation.data;

    // Create partner and referral link in a single DynamoDB transaction.
    const { referralLink } = await createPartnerWithReferralLink(
      {
        partner_id: referralId,
        partner_first_name: firstName,
        partner_last_name: lastName,
        contact_email: email,
        contact_phone: phone,
        organization_name: organizationName,
        contact_name: contactName,
        segment_code: segment,
        reporting_group: reportingGroup,
        status: status,
        notes: notes,
        consent: consent,
        created_at: createdAt,
      },
      {
        partner_id: referralId,
      },
      organizationName
        ? {
            partner_id: referralId,
            location_name: organizationName,
          }
        : undefined,
    );

    // Generate referral resources (QR code, rack card).
    const referralUrl = referralLink.full_url;
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(
      referralUrl,
    )}&size=400`;
    let rackCardUrl: string;

    try {
      const rackCardData = await createRackCardWithPlacid({
        organizationName: organizationName || "",
        referralUrl,
        qrCodeUrl,
        referralId,
      });

      if (!rackCardData.pdf_url) {
        throw new Error("Rack card PDF URL was not returned by Placid.");
      }

      rackCardUrl = rackCardData.pdf_url;
    } catch (error) {
      await updatePartnerProcessingStatus(referralId, {
        resource_generation_status: "failed",
      });

      console.error("Referral resource generation failed:", {
        referralId,
        error,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "Referral applicant saved, but referral resources were not generated.",
          partner_id: referralId,
          resource_generation_status: "failed",
          email_status: "pending",
        },
        { status: 202 },
      );
    }

    // Update partner and referral link tables with referral resources.
    await updateReferralResourcesAtomic(
      referralId,
      status,
      qrCodeUrl,
      rackCardUrl,
      new Date().toISOString(),
    );

    // Send notification email to referral applicant with their referral resources.
    try {
      await sendReferralNotificationEmail({
        toEmail: email,
        partnerName: firstName,
        locationName: organizationName || "",
        referralId,
        referralUrl,
        qrCodeUrl,
        rackCardUrl,
      });

      await updatePartnerProcessingStatus(referralId, {
        email_status: "sent",
      });
    } catch (error) {
      await updatePartnerProcessingStatus(referralId, {
        email_status: "failed",
      });

      console.error("Referral notification email failed:", {
        referralId,
        error,
      });

      return NextResponse.json(
        {
          success: true,
          message:
            "Referral applicant and resources saved, but notification email failed.",
          partner_id: referralId,
          resource_generation_status: "completed",
          email_status: "failed",
          qr_code_url: qrCodeUrl,
          rack_card_url: rackCardUrl,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Referral applicant and referral PDF resources saved successfully",
      partner_id: referralId,
      resource_generation_status: "completed",
      email_status: "sent",
      qr_code_url: qrCodeUrl,
      rack_card_url: rackCardUrl,
    });
  } catch (error) {
    console.error("Referral webhook error:", error);

    return NextResponse.json(
      { error: "Failed to process referral webhook" },
      { status: 500 },
    );
  }
}
