import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRackCardWithPlacid } from "@/lib/createRackCard";
import {
  getReferralLinkForPartner,
  updatePartnerFromGoogleSheet,
  updatePartnerProcessingStatus,
  updatePartnerRackCardUrl,
} from "@/lib/partners";
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
    process.env.ALERTA_ENV === "prod"
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

function getOptionalStringField(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
  allowEmpty = false,
) {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue && !allowEmpty) {
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

function hasField(body: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function getSheetReferralPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      error: "Request body must be a JSON object",
    } as const;
  }

  const payload = body as Record<string, unknown>;
  const referralId = getOptionalStringField(
    payload,
    "referral_id",
    25,
  )?.toUpperCase();

  if (!referralId || !REFERRAL_ID_REGEX.test(referralId)) {
    return {
      valid: false,
      error: "Missing or invalid referral_id",
      referralId,
    } as const;
  }

  const updates: Parameters<typeof updatePartnerFromGoogleSheet>[1] = {};
  const firstName = getOptionalStringField(payload, "first_name", 100);
  const lastName = getOptionalStringField(payload, "last_name", 100);
  const email = getOptionalStringField(payload, "email", 254)?.toLowerCase();
  const phone = getOptionalStringField(payload, "phone", 30);
  const organizationName = getOptionalStringField(
    payload,
    "organization_name",
    200,
    true,
  );
  const notes = getOptionalStringField(payload, "notes", 2000, true);
  const status = getOptionalStringField(payload, "status", 30)?.toLowerCase();
  const segment = getOptionalStringField(payload, "segment", 50)?.toLowerCase();
  const reportingGroup = getOptionalStringField(
    payload,
    "reporting_group",
    50,
  )?.toLowerCase();
  const consent = normalizeConsent(
    getOptionalStringField(payload, "consent", 10),
  );

  if (hasField(payload, "first_name")) {
    if (!firstName) {
      return { valid: false, error: "Invalid first_name", referralId } as const;
    }

    updates.partner_first_name = firstName;
  }

  if (hasField(payload, "last_name")) {
    if (!lastName) {
      return { valid: false, error: "Invalid last_name", referralId } as const;
    }

    updates.partner_last_name = lastName;
  }

  if (hasField(payload, "email")) {
    if (!email || !EMAIL_REGEX.test(email)) {
      return { valid: false, error: "Invalid email", referralId } as const;
    }

    updates.contact_email = email;
  }

  if (hasField(payload, "phone")) {
    if (!phone || !PHONE_REGEX.test(phone)) {
      return { valid: false, error: "Invalid phone", referralId } as const;
    }

    updates.contact_phone = phone;
  }

  if (hasField(payload, "organization_name")) {
    if (organizationName === undefined) {
      return {
        valid: false,
        error: "Invalid organization_name",
        referralId,
      } as const;
    }

    updates.organization_name = organizationName;
  }

  if (hasField(payload, "notes")) {
    if (notes === undefined) {
      return { valid: false, error: "Invalid notes", referralId } as const;
    }

    updates.notes = notes;
  }

  if (hasField(payload, "status")) {
    if (!isOneOf(status, ALLOWED_STATUSES)) {
      return { valid: false, error: "Invalid status", referralId } as const;
    }

    updates.status = status;
  }

  if (hasField(payload, "segment")) {
    if (!isOneOf(segment, ALLOWED_SEGMENTS)) {
      return { valid: false, error: "Invalid segment", referralId } as const;
    }

    updates.segment_code = segment;
  }

  if (hasField(payload, "reporting_group")) {
    if (!isOneOf(reportingGroup, ALLOWED_REPORTING_GROUPS)) {
      return {
        valid: false,
        error: "Invalid reporting_group",
        referralId,
      } as const;
    }

    updates.reporting_group = reportingGroup;
  }

  if (hasField(payload, "consent")) {
    if (!consent) {
      return { valid: false, error: "Invalid consent", referralId } as const;
    }

    updates.consent = consent;
  }

  if (Object.keys(updates).length === 0) {
    return {
      valid: false,
      error: "No editable referral fields were provided",
      referralId,
    } as const;
  }

  return {
    valid: true,
    data: {
      referralId,
      updates,
    },
  } as const;
}

export async function PATCH(request: NextRequest) {
  try {
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
      key: getRateLimitKey(request, "google-sheets-referrals", providedApiKey),
      limit: 60,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit.retryAfterSeconds);
    }

    if (!isValidApiKey(providedApiKey, expectedApiKey)) {
      console.warn("Google Sheets referral API key validation failed:", {
        alertaEnv: process.env.ALERTA_ENV || "",
        selectedEnvName: envName,
        hasExpectedApiKey: !!expectedApiKey,
        hasProvidedApiKey: !!providedApiKey,
      });

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const validation = getSheetReferralPayload(body);

    if (!validation.valid) {
      console.warn("Google Sheets referral sync validation failed:", {
        referralId: validation.referralId,
        error: validation.error,
      });

      return NextResponse.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const partner = await updatePartnerFromGoogleSheet(
      validation.data.referralId,
      validation.data.updates,
    );

    if (validation.data.updates.organization_name !== undefined) {
      const referralLink = await getReferralLinkForPartner(
        validation.data.referralId,
      );
      const partnerData = partner as
        | {
            partner_first_name?: string;
            contact_email?: string;
            qr_code_asset_url?: string;
          }
        | undefined;
      const referralUrl = referralLink?.full_url;
      const qrCodeUrl =
        partnerData?.qr_code_asset_url || referralLink?.qr_code_asset_url;

      if (!partnerData?.contact_email || !referralUrl || !qrCodeUrl) {
        return NextResponse.json(
          {
            success: true,
            message:
              "Referral updated, but rack card regeneration was skipped because referral resources were incomplete.",
            partner,
            rack_card_status: "skipped",
            email_status: "skipped",
          },
          { status: 202 },
        );
      }

      let rackCardUrl: string;

      try {
        const rackCardData = await createRackCardWithPlacid({
          organizationName: validation.data.updates.organization_name,
          referralUrl,
          qrCodeUrl,
          referralId: validation.data.referralId,
        });

        if (!rackCardData.pdf_url) {
          throw new Error("Rack card PDF URL was not returned by Placid.");
        }

        rackCardUrl = rackCardData.pdf_url;
      } catch (error) {
        await updatePartnerProcessingStatus(validation.data.referralId, {
          resource_generation_status: "failed",
        });

        console.error("Google Sheets rack card regeneration failed:", {
          referralId: validation.data.referralId,
          error,
        });

        return NextResponse.json(
          {
            success: true,
            message:
              "Referral updated, but rack card regeneration failed.",
            partner,
            rack_card_status: "failed",
            email_status: "skipped",
          },
          { status: 202 },
        );
      }

      const updatedPartner = await updatePartnerRackCardUrl(
        validation.data.referralId,
        rackCardUrl,
      );

      try {
        await sendReferralNotificationEmail({
          toEmail: partnerData.contact_email,
          partnerName: partnerData.partner_first_name || "",
          locationName: validation.data.updates.organization_name,
          referralId: validation.data.referralId,
          referralUrl,
          qrCodeUrl,
          rackCardUrl,
        });

        await updatePartnerProcessingStatus(validation.data.referralId, {
          email_status: "sent",
        });
      } catch (error) {
        await updatePartnerProcessingStatus(validation.data.referralId, {
          email_status: "failed",
        });

        console.error("Google Sheets referral notification resend failed:", {
          referralId: validation.data.referralId,
          error,
        });

        return NextResponse.json(
          {
            success: true,
            message:
              "Referral updated and rack card regenerated, but notification email failed.",
            partner: updatedPartner,
            rack_card_status: "completed",
            email_status: "failed",
            rack_card_url: rackCardUrl,
          },
          { status: 202 },
        );
      }

      return NextResponse.json({
        success: true,
        message:
          "Referral updated, rack card regenerated, and notification email resent successfully",
        partner: updatedPartner,
        rack_card_status: "completed",
        email_status: "sent",
        rack_card_url: rackCardUrl,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Referral updated successfully from Google Sheets",
      partner,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return NextResponse.json(
        { error: "Referral ID was not found" },
        { status: 404 },
      );
    }

    console.error("Google Sheets referral sync error:", error);

    return NextResponse.json(
      { error: "Failed to sync referral from Google Sheets" },
      { status: 500 },
    );
  }
}
