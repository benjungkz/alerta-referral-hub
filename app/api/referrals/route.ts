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

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const email = body.email?.trim().toLowerCase();
    const referralId = body.referralId?.trim().toUpperCase();
    const phone = body.phone?.trim();

    if (!firstName || !lastName || !email || !referralId) {
      console.error("Validation failed:", {
        firstName,
        lastName,
        email,
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
        organization_name: body.organization?.trim(),
        contact_name: `${firstName} ${lastName}`,
        segment_code: body.segmentCode,
        reporting_group: body.reportingGroup,
        status: "pending",
        notes: "Created from referral webhook",
      },
      {
        partner_id: referralId,
      },
    );

    return NextResponse.json({
      success: true,
      message: "Referral applicant (Partner, Referral Link) saved successfully",
      partner_id: referralId,
      firstName,
      lastName,
      email,
    });
  } catch (error) {
    console.error("Referral webhook error:", error);

    return NextResponse.json(
      { error: "Failed to process referral webhook" },
      { status: 500 },
    );
  }
}
