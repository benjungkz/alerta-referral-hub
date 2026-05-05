import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { addTagsToOrder } from "@/lib/ShopifyOrder";

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET!;

/**
 * Verify Shopify webhook signature
 */
function verifyWebhook(rawBody: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(digest, "base64"),
    Buffer.from(hmacHeader, "base64"),
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhook(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  const order = JSON.parse(rawBody);

  const orderGid = `gid://shopify/Order/${order.id}`;

  const referralAttr = order.note_attributes?.find(
    (a: { name: string; value: string }) => a.name === "referrer_id",
  );

  const referralId = referralAttr?.value?.trim().toUpperCase();

  if (!referralId) {
    return NextResponse.json({
      success: true,
      message: "No referral found",
    });
  }

  /**
   * Add tags to Shopify order
   */
  try {
    await addTagsToOrder(orderGid, [
      `referrer:${referralId}`,
      "referral-order",
    ]);
  } catch (error) {
    console.error("Failed to add tags to order:", error);
    return NextResponse.json(
      { error: "Failed to process referral" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    referralId,
  });
}

export function GET() {
  return NextResponse.json({ message: "Referral order webhook endpoint" });
}
