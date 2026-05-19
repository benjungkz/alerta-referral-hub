import { createTimeoutSignal, getEnvTimeoutMs } from "./timeout";

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const timeoutSignal = createTimeoutSignal(timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: timeoutSignal.signal,
    });
  } finally {
    timeoutSignal.clear();
  }
}

async function pollPdfUntilReady(
  pollingUrl: string,
  apiToken: string,
): Promise<PlacidPdfResponse> {
  const requestTimeoutMs = getEnvTimeoutMs("PLACID_REQUEST_TIMEOUT_MS", 30_000);
  const totalTimeoutMs = getEnvTimeoutMs("PLACID_PDF_TIMEOUT_MS", 120_000);
  const pollIntervalMs = getEnvTimeoutMs("PLACID_POLL_INTERVAL_MS", 3_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < totalTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const response = await fetchWithTimeout(
      pollingUrl,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      },
      requestTimeoutMs,
    );

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

  const response = await fetchWithTimeout(
    "https://api.placid.app/api/rest/pdfs",
    {
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
    },
    getEnvTimeoutMs("PLACID_REQUEST_TIMEOUT_MS", 30_000),
  );

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
