import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRackCardWithPlacid } from "@/lib/createRackCard";
import {
  createPartnerWithReferralLink,
  updateReferralResourcesAtomic,
} from "../../../lib/partners";
import { sendReferralNotificationEmail } from "@/lib/sendReferralNotificationEmail";

const API_KEY_HEADER = "x-alerta-api-key";

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

    if (!isValidApiKey(request.headers.get(API_KEY_HEADER), expectedApiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and normalize referral data from request body
    const body = await request.json();

    const firstName = body.first_name?.trim();
    const lastName = body.last_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const referralId = body.referral_id?.trim();
    const phone = body.phone?.trim();
    const status = body.status?.trim().toLowerCase() || "pending";
    const segment = body.segment?.trim();
    const reportingGroup = body.reporting_group?.trim();
    const organizationName = body.organization_name?.trim();
    const notes = body.notes?.trim() || "";
    const consent = body.consent?.trim();
    const createdAt = body.created_at?.trim();
    const contactName = `${firstName} ${lastName}`;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !referralId ||
      !phone ||
      !consent
    ) {
      console.error("Validation failed:", {
        referralId,
      });
      return NextResponse.json(
        { error: "Missing required referral fields" },
        { status: 400 },
      );
    }

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

    //Generate referral resources (QR code, rack card).
    const referralUrl = referralLink.full_url;
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(
      referralUrl,
    )}&size=400`;

    const rackCardData = await createRackCardWithPlacid({
      organizationName: organizationName || "",
      referralUrl,
      qrCodeUrl,
      referralId,
    });

    const rackCardUrl = rackCardData.pdf_url;

    if (!rackCardUrl) {
      throw new Error("Rack card PDF URL was not returned by Placid.");
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
    await sendReferralNotificationEmail({
      toEmail: email,
      partnerName: firstName,
      locationName: organizationName,
      referralId,
      referralUrl,
      qrCodeUrl,
      rackCardUrl,
    });

    return NextResponse.json({
      success: true,
      message:
        "Referral applicant and referral PDF resources saved successfully",
      partner_id: referralId,
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
