import { NextRequest, NextResponse } from "next/server";
import { createPartnerWithReferralLink } from "../../../lib/partners";

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
    await createPartnerWithReferralLink(
      {
        partner_id: referralId,
        partner_first_name: firstName,
        partner_last_name: lastName,
        contact_email: email,
        contact_phone: phone,
        organization_name: organizationName,
        contact_name: `${firstName} ${lastName}`,
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

    return NextResponse.json({
      success: true,
      message:
        "Referral applicant (Partner, Referral Link, Partner Location) saved successfully",
      partner_id: referralId,
    });
  } catch (error) {
    console.error("Referral webhook error:", error);

    return NextResponse.json(
      { error: "Failed to process referral webhook" },
      { status: 500 },
    );
  }
}
