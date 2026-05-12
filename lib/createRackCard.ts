type CreateRackCardParams = {
  partnerName: string;
  referralUrl: string;
  qrCodeUrl: string;
  referralId: string;
};

export async function createRackCardWithPlacid({
  partnerName,
  referralUrl,
  qrCodeUrl,
  referralId,
}: CreateRackCardParams) {
  const apiToken = process.env.PLACID_API_TOKEN;
  const templateUuid = process.env.PLACID_RACK_CARD_TEMPLATE_UUID;

  if (!apiToken || !templateUuid) {
    throw new Error("Missing Placid environment variables.");
  }

  const response = await fetch("https://api.placid.app/api/rest/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      template_uuid: templateUuid,

      create_now: true,

      layers: {
        partner_name: {
          text: partnerName,
        },

        referral_url: {
          text: referralUrl,
        },

        qr_code: {
          image: qrCodeUrl,
        },
      },

      modifications: {
        filename: `rack-card-${referralId}`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    console.error("Placid API Error:", errorText);

    throw new Error("Failed to generate rack card using Placid.");
  }

  return response.json();
}
