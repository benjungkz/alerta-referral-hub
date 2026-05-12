import { NextRequest, NextResponse } from "next/server";
import { createRackCardWithPlacid } from "@/lib/createRackCard";
import { updateReferralResourcesAtomic } from "@/lib/partners";
type GenerateResourcePayload = {
  referral_id: string;
  partner_name: string;
  old_status: string;
  status: string;
  updated_at: string;
};

function validatePayload(data: GenerateResourcePayload) {
  const requiredFields = [
    "referral_id",
    "partner_name",
    "old_status",
    "status",
    "updated_at",
  ];

  const missingFields = requiredFields.filter(
    (field) => !data[field as keyof GenerateResourcePayload],
  );

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  console.log(data);

  if (data.status?.trim().toLowerCase() !== "active") {
    return {
      valid: false,
      error: "Resource generation only runs when status is active.",
    };
  }

  return { valid: true };
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateResourcePayload;

    const validation = validatePayload(body);

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: 400 },
      );
    }

    const referralId = body.referral_id!;
    const partnerName = body.partner_name!;
    const referralUrl = `${process.env.BASE_URL}${referralId}`;

    // Generate QR code using QuickChart API (for simplicity and speed)
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(
      referralUrl,
    )}&size=400`;

    // Generate Placid rack card
    const rackCardData = await createRackCardWithPlacid({
      partnerName,
      referralUrl,
      qrCodeUrl,
      referralId,
    });

    const status = body.status.trim().toLowerCase();
    const rackCardUrl = rackCardData.image_url;
    const updatedAt = body.updated_at;

    // Update referral_links + partners tables atomically using TransactWrite
    await updateReferralResourcesAtomic(
      referralId,
      status,
      qrCodeUrl,
      rackCardUrl,
      updatedAt,
    );

    // update google sheet with QR code link + rack card link
    return NextResponse.json({
      success: true,
      message: "QR code generated successfully.",
      data: {
        referral_id: referralId,
        partner_name: partnerName,
        referral_url: referralUrl,
        qr_code_url: qrCodeUrl,
        rack_card_url: rackCardData.image_url,
      },
    });
  } catch (error) {
    console.error("PATCH /api/google/generate-resource error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process generate resource request.",
      },
      { status: 500 },
    );
  }
}
