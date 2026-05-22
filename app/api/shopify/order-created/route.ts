import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { addTagsToOrder } from "@/lib/ShopifyOrder";
import { ddbDocClient } from "@/lib/dynamodb";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitedResponse,
} from "@/lib/rateLimit";
import { getConvertedReferralExpiresAt } from "@/lib/referralTtl";
import type {
  ConversionStatus,
  ReferralConversion,
  ReferralLink,
} from "@/types/db";

const REFERRAL_CONVERSIONS_TABLE =
  process.env.DYNAMODB_REFERRAL_CONVERSIONS_TABLE || "referral_conversions";
const REFERRAL_SESSIONS_TABLE =
  process.env.DYNAMODB_REFERRAL_SESSIONS_TABLE || "referral_sessions";
const REFERRAL_LINKS_TABLE =
  process.env.DYNAMODB_REFERRAL_LINKS_TABLE || "referral_links";
const REFERRAL_LINKS_PARTNER_ID_INDEX =
  process.env.DYNAMODB_REFERRAL_LINKS_PARTNER_ID_INDEX || "partner_id-GSI";

type ShopifyNoteAttribute = {
  name: string;
  value: string;
};

type ShopifyLineItem = {
  name?: string;
  title?: string;
  sku?: string;
  quantity?: number;
};

type ShopifyOrder = {
  id: number | string;
  name?: string;
  tags?: string;
  currency?: string;
  total_price?: string;
  current_total_price?: string;
  subtotal_price?: string;
  current_subtotal_price?: string;
  total_discounts?: string;
  current_total_discounts?: string;
  financial_status?: string;
  cancelled_at?: string | null;
  processed_at?: string;
  created_at?: string;
  customer?: {
    id?: number | string;
    orders_count?: number;
  } | null;
  note_attributes?: ShopifyNoteAttribute[];
  discount_codes?: { code?: string }[];
  line_items?: ShopifyLineItem[];
};

/**
 * Verify Shopify webhook signature
 */
function verifyWebhook(
  rawBody: string,
  hmacHeader: string | null,
  webhookSecret: string,
) {
  if (!hmacHeader) return false;

  const expectedDigest = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest();
  const providedDigest = Buffer.from(hmacHeader, "base64");

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedDigest, providedDigest);
}

function getNoteAttribute(order: ShopifyOrder, name: string) {
  return order.note_attributes?.find((attribute) => attribute.name === name)
    ?.value;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getConversionStatus(order: ShopifyOrder): ConversionStatus {
  if (order.cancelled_at) return "cancelled";

  switch (order.financial_status) {
    case "paid":
    case "partially_paid":
      return "approved";
    case "refunded":
      return "refunded";
    case "voided":
      return "cancelled";
    default:
      return "pending";
  }
}

function removeUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedValues(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [
          entryKey,
          removeUndefinedValues(entryValue),
        ]),
    ) as T;
  }

  return value;
}

function buildOrderTag(prefix: string, value: string) {
  const maxOrderTagLength = 40;
  const tagPrefix = `${prefix}:`;
  const availableValueLength = maxOrderTagLength - tagPrefix.length;

  return `${tagPrefix}${value.slice(0, availableValueLength)}`;
}

function createConversionId(orderId: string | number) {
  const normalizedOrderId = String(orderId)
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 80);

  return `shopify-order-${normalizedOrderId}`;
}

function isConditionalCheckFailed(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

async function getReferralLink(referralId: string) {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: REFERRAL_LINKS_TABLE,
      IndexName: REFERRAL_LINKS_PARTNER_ID_INDEX,
      KeyConditionExpression: "partner_id = :partner_id",
      ExpressionAttributeValues: {
        ":partner_id": referralId,
      },
      Limit: 1,
    }),
  );

  return result.Items?.[0] as ReferralLink | undefined;
}

async function markReferralSessionConverted({
  sessionId,
  conversionId,
  convertedAt,
  expiresAt,
}: {
  sessionId: string;
  conversionId: string;
  convertedAt: string;
  expiresAt: number;
}) {
  if (sessionId === "unattributed") return;

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: REFERRAL_SESSIONS_TABLE,
      Key: { session_id: sessionId },
      UpdateExpression:
        "SET conversion_status = :conversion_status, converted_at = :converted_at, conversion_id = :conversion_id, expires_at = :expires_at, last_seen_at = :converted_at",
      ExpressionAttributeValues: {
        ":conversion_status": "converted",
        ":converted_at": convertedAt,
        ":conversion_id": conversionId,
        ":expires_at": expiresAt,
      },
      ConditionExpression: "attribute_exists(session_id)",
    }),
  );
}

function buildConversionItem({
  order,
  conversionId,
  referralId,
  referralLink,
  expiresAt,
}: {
  order: ShopifyOrder;
  conversionId: string;
  referralId: string;
  referralLink?: ReferralLink;
  expiresAt: number;
}): ReferralConversion {
  const grossRevenue =
    toNumber(order.current_total_price) ?? toNumber(order.total_price);
  const netRevenue =
    toNumber(order.current_subtotal_price) ?? toNumber(order.subtotal_price);
  const totalDiscounts =
    toNumber(order.current_total_discounts) ?? toNumber(order.total_discounts);
  const discountCode = order.discount_codes?.find(
    (discount) => discount.code,
  )?.code;
  const sessionId = getNoteAttribute(order, "session_id") || "unattributed";

  return {
    conversion_id: conversionId,
    partner_id: referralId,
    session_id: sessionId,
    referral_link_id: referralLink?.referral_link_id || referralId,
    external_order_id: String(order.id),
    conversion_type: "purchase",
    conversion_status: getConversionStatus(order),
    external_customer_id: order.customer?.id
      ? String(order.customer.id)
      : undefined,
    gross_revenue: grossRevenue,
    net_revenue: netRevenue,
    commissionable_amount:
      netRevenue !== undefined && totalDiscounts !== undefined
        ? Math.max(netRevenue - totalDiscounts, 0)
        : netRevenue,
    currency_code: order.currency || "USD",
    credit_status: "pending",
    conversion_timestamp:
      order.processed_at || order.created_at || new Date().toISOString(),
    expires_at: expiresAt,
    metadata: {
      order_name: order.name,
      shopify_tags: order.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      discount_code: discountCode,
      line_items: order.line_items?.map((item) =>
        [item.title || item.name, item.sku, item.quantity]
          .filter((value) => value !== undefined && value !== "")
          .join(" | "),
      ),
      first_order: order.customer?.orders_count === 1,
    },
  };
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: getRateLimitKey(request, "shopify-order-created"),
    limit: 120,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    console.error("Missing SHOPIFY_WEBHOOK_SECRET environment variable.");

    return NextResponse.json(
      { error: "Shopify webhook secret is not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhook(rawBody, hmacHeader, webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  let order: ShopifyOrder;

  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!order.id) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
  }

  const orderGid = `gid://shopify/Order/${order.id}`;

  console.info("Received Shopify order-created webhook:", {
    orderId: order.id,
  });

  const referralId = getNoteAttribute(order, "referrer_id")
    ?.trim()
    .toUpperCase();

  if (!referralId) {
    console.info("No referral ID found in Shopify order note attributes:", {
      orderId: order.id,
    });
    return NextResponse.json({
      success: true,
      message: "No referral found",
    });
  }

  const conversionId = createConversionId(order.id);
  let conversionAlreadySaved = false;
  let conversionItem: ReferralConversion | undefined;

  // Save conversion data to DynamoDB for tracking and analytics purposes
  try {
    const referralLink = await getReferralLink(referralId);
    const conversionExpiresAt = getConvertedReferralExpiresAt();
    conversionItem = removeUndefinedValues(
      buildConversionItem({
        order,
        conversionId,
        referralId,
        referralLink,
        expiresAt: conversionExpiresAt,
      }),
    );

    await ddbDocClient.send(
      new PutCommand({
        TableName: REFERRAL_CONVERSIONS_TABLE,
        Item: conversionItem,
        ConditionExpression: "attribute_not_exists(conversion_id)",
      }),
    );
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      conversionAlreadySaved = true;
      console.info("Duplicate Shopify referral conversion ignored:", {
        orderId: order.id,
        conversionId,
        referralId,
      });
    } else {
      console.error("Failed to save referral conversion:", error);
      return NextResponse.json(
        { error: "Failed to save referral conversion" },
        { status: 500 },
      );
    }
  }

  if (!conversionAlreadySaved) {
    console.info("Saved referral conversion:", {
      orderId: order.id,
      conversionId,
      referralId,
    });

    if (conversionItem) {
      try {
        await markReferralSessionConverted({
          sessionId: conversionItem.session_id,
          conversionId,
          convertedAt: conversionItem.conversion_timestamp,
          expiresAt: conversionItem.expires_at,
        });
      } catch (error) {
        console.warn("Failed to mark referral session converted:", {
          orderId: order.id,
          conversionId,
          referralId,
          sessionId: conversionItem.session_id,
          error,
        });
      }
    }
  }
  // Add tags to the Shopify order for easy identification and segmentation in Shopify admin and analytics - this will allow us to easily track which orders came from referrals and link them back to the conversion data in our database
  try {
    await addTagsToOrder(orderGid, [
      buildOrderTag("ref", referralId),
      buildOrderTag("conversion", conversionId),
      "referral-order",
    ]);
  } catch (error) {
    console.error("Failed to add tags to Shopify order:", {
      orderId: order.id,
      conversionId,
      referralId,
      error,
    });

    return NextResponse.json({
      success: true,
      referralId,
      conversionId,
      duplicate: conversionAlreadySaved,
      tag_status: "failed",
    });
  }

  return NextResponse.json({
    success: true,
    referralId,
    conversionId,
    duplicate: conversionAlreadySaved,
    tag_status: "tagged",
  });
}
