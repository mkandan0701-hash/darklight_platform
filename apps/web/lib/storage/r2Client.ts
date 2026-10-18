import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible, so the AWS SDK's S3 client is the supported
// way to talk to it — same pattern as lib/payments/*: a factory, so a missing
// credential fails at the call rather than at module load.
export function createR2Client() {
  return new S3Client({
    region: "auto", // R2 ignores region, but the SDK requires one
    endpoint: `https://${process.env.R2_ACCOUNT_ID ?? ""}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
}

/**
 * Uploads a certificate PDF and returns its stable public URL.
 *
 * Deliberately not a presigned URL: a college-application certificate is
 * attached to applications and emailed to admissions offices months or years
 * after it is issued, and a SigV4 presigned URL expires within 7 days. The
 * bucket is expected to be public-read (or fronted by a custom domain), with
 * R2_PUBLIC_URL_BASE naming it — which is also why Certificate.pdfUrl is a
 * plain String in the schema rather than a URL-plus-expiry.
 */
export async function uploadCertificatePdf(key: string, body: Buffer): Promise<string> {
  await createR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET ?? "",
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    })
  );

  const base = (process.env.R2_PUBLIC_URL_BASE ?? "").replace(/\/$/, "");
  return `${base}/${key}`;
}
