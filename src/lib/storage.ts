import "server-only";

/**
 * Photo re-hosting (Build Spec §4.4).
 *
 * The LinkedIn `picture` URL is time-limited, so on first login we download the
 * image server-side and persist it to our own storage rather than hot-linking an
 * expiring URL. In production this uploads to S3-compatible storage / Vercel Blob
 * (configure via env); the demo fallback returns a self-contained data URL so the
 * photo is captured on our side and no longer depends on LinkedIn's CDN.
 */

export async function rehostPhoto(sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());

  // Production path: upload `buf` to S3-compatible storage / Vercel Blob and
  // return the public URL. Add the SDK and wire it here when BLOB_READ_WRITE_TOKEN
  // (or S3 creds) are configured — intentionally omitted so the demo has no
  // storage dependency:
  //
  //   const { put } = await import("@vercel/blob");
  //   const { url } = await put(key, buf, { access: "public", contentType });
  //   return url;

  // Demo fallback: embed as a data URL — the image now lives in our card model,
  // not on LinkedIn's expiring CDN.
  return `data:${contentType};base64,${buf.toString("base64")}`;
}
