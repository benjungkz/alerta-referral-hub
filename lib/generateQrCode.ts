import QRCode from "qrcode";

export async function generateQrCode(referralUrl: string): Promise<string> {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(referralUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 500,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return qrCodeDataUrl;
  } catch (error) {
    console.error("QR generation error:", error);
    throw new Error("Failed to generate QR code.");
  }
}
