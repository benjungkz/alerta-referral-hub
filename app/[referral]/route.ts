import { NextRequest, NextResponse } from "next/server";

const DEST_URL = process.env.SHOPIFY_HOME_URL || "https://www.alertahome.com/";
const REFERRAL_REGEX = /^[A-Z]{2,12}-[A-Z0-9]{4}$/;

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ referral: string }>;
  },
) {
  const referralId = (await context.params).referral
    ?.trim()
    .toLocaleUpperCase();

  // Validation
  if (!referralId || !REFERRAL_REGEX.test(referralId))
    return NextResponse.redirect(new URL("/referral-invalid", request.url));

  //Setup Params
  const redirectUrl = new URL(DEST_URL);
  redirectUrl.searchParams.set("ref", referralId);

  return NextResponse.redirect(redirectUrl.toString(), 302);
}
