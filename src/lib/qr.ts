/**
 * QR generation (Build Spec §2, §4.6).
 *
 * The QR encodes the *digital-card URL*, never a raw vCard — a vCard with a photo
 * is too dense to scan reliably, and a URL lets the owner update their info and
 * collect scan analytics without reprinting (§4.6, §7).
 *
 * We use `qrcode` (works on server + client) with brand color options. For a
 * logo-in-center styled QR, `qr-code-styling` is the documented upgrade path;
 * colored modules already give branded output here.
 */

import QRCode from "qrcode";

export interface QrStyle {
  color?: string;
  background?: string;
  /** high error correction leaves room for a center logo overlay. */
  level?: "L" | "M" | "Q" | "H";
  margin?: number;
}

export async function qrToDataUrl(
  data: string,
  style: QrStyle = {}
): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: style.level ?? "M",
    margin: style.margin ?? 1,
    color: {
      dark: style.color ?? "#000000",
      light: style.background ?? "#ffffff",
    },
    width: 512,
  });
}

export async function qrToSvg(data: string, style: QrStyle = {}): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: style.level ?? "M",
    margin: style.margin ?? 1,
    color: {
      dark: style.color ?? "#000000",
      light: style.background ?? "#ffffff",
    },
  });
}
