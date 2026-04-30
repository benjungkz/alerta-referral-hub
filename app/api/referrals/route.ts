import { NextRequest, NextResponse } from "next/server";

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
    const referralId = body.referralId
      ? body.referralId?.trim().toUpperCase()
      : "Test";

    if (!firstName || !lastName || !email || !referralId) {
      return NextResponse.json(
        { error: "Missing required referral fields" },
        { status: 400 },
      );
    }

    /**
     * ============================================
     * TODO: Save referral applicant to DB
     * ============================================
     *
     * Suggested schema:
     * {
     *   firstName: string,
     *   lastName: string,
     *   email: string,
     *   referralId: string,
     *   source: "google_form",
     *   createdAt: Date
     * }
     *
     * Example:
     * await saveReferralApplicant({
     *   firstName,
     *   lastName,
     *   email,
     *   referralId,
     *   source: "google_form",
     *   createdAt: new Date(),
     * });
     */

    return NextResponse.json({
      success: true,
      message: "Referral applicant received",
      referralId,
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
