type CreateRackCardParams = {
  organizationName: string;
  referralUrl: string;
  qrCodeUrl: string;
  referralId: string;
};

type PlacidPdfResponse = {
  id: number;
  status: "queued" | "finished" | "error";
  pdf_url: string | null;
  polling_url: string | null;
};

async function pollPdfUntilReady(
  pollingUrl: string,
  apiToken: string,
): Promise<PlacidPdfResponse> {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(pollingUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Placid PDF polling error:", errorText);

      throw new Error("Failed to poll rack card PDF status.");
    }

    const data = (await response.json()) as PlacidPdfResponse;

    if (data.status === "finished" && data.pdf_url) {
      return data;
    }

    if (data.status === "error") {
      throw new Error("Placid failed to generate rack card PDF.");
    }
  }

  throw new Error("Timed out waiting for rack card PDF generation.");
}

export async function createRackCardWithPlacid({
  organizationName,
  referralUrl,
  qrCodeUrl,
  referralId,
}: CreateRackCardParams) {
  const apiToken = process.env.PLACID_API_TOKEN;
  const templateUuid = process.env.PLACID_RACK_CARD_TEMPLATE_UUID;

  if (!apiToken || !templateUuid) {
    throw new Error("Missing Placid environment variables.");
  }

  const response = await fetch("https://api.placid.app/api/rest/pdfs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      pages: [
        {
          template_uuid: templateUuid,
          layers: {
            organization_name: {
              text: organizationName,
            },

            referral_url: {
              text: referralUrl,
            },

            qr_code: {
              image: qrCodeUrl,
            },
          },
        },
      ],

      modifications: {
        filename: `rack-card-${referralId}`,
        dpi: 300,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    console.error("Placid PDF API Error:", errorText);

    throw new Error("Failed to generate rack card PDF using Placid.");
  }

  const data = (await response.json()) as PlacidPdfResponse;

  if (data.status === "finished" && data.pdf_url) {
    return data;
  }

  if (data.polling_url) {
    return pollPdfUntilReady(data.polling_url, apiToken);
  }

  throw new Error("Placid did not return a rack card PDF URL.");
}
