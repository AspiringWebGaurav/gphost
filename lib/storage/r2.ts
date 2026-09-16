if (typeof window !== "undefined") {
  throw new Error("Cloudflare R2 storage client cannot be executed in browser/client environments.");
}
import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "gphosting-files";

let r2ClientInstance: S3Client | null = null;

/**
 * Returns the singleton server-only S3Client configured for Cloudflare R2.
 */
export function getR2Client(): S3Client {
  if (!r2ClientInstance) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("Missing Cloudflare R2 storage credentials in environment variables");
    }

    r2ClientInstance = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  return r2ClientInstance;
}

/**
 * Generates an unpredictable, owner-embedded R2 object key.
 * Format: u/{userId}/{YYYY}/{MM}/{uuid}{ext}
 * Never uses original filenames as object keys.
 */
export function generateR2ObjectKey(userId: string, filename: string): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const randomUUID = crypto.randomUUID();

  const dotIndex = filename.lastIndexOf(".");
  let ext = "";
  if (dotIndex > 0 && dotIndex < filename.length - 1) {
    const rawExt = filename.slice(dotIndex).toLowerCase().replace(/[^a-z0-9.]/g, "");
    if (rawExt.length <= 10) {
      ext = rawExt;
    }
  }

  return `u/${userId}/${year}/${month}/${randomUUID}${ext}`;
}

/**
 * Generates a presigned PUT URL for single-part direct browser-to-R2 upload.
 */
export async function createPresignedPutUrl(
  key: string,
  mimeType: string,
  expiresInSec = 900
): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

/**
 * Initiates an S3/R2 multipart upload for files >= 100 MB.
 * Returns the authoritative R2 UploadId.
 */
export async function initiateR2MultipartUpload(
  key: string,
  mimeType: string
): Promise<string> {
  const client = getR2Client();
  const command = new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });

  const res = await client.send(command);
  if (!res.UploadId) {
    throw new Error("Failed to initiate R2 multipart upload: missing UploadId");
  }

  return res.UploadId;
}

/**
 * Generates a presigned URL for an individual multipart part upload.
 */
export async function createPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSec = 900
): Promise<string> {
  const client = getR2Client();
  const command = new UploadPartCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

/**
 * Finalizes an R2 multipart upload by assembling uploaded parts.
 */
export async function completeR2MultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<string | undefined> {
  const client = getR2Client();
  const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

  const command = new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts,
    },
  });

  const res = await client.send(command);
  return res.ETag ? res.ETag.replace(/^"|"$/g, "") : undefined;
}

/**
 * Aborts an active R2 multipart upload, cleaning up orphaned parts.
 */
export async function abortR2MultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const client = getR2Client();
  const command = new AbortMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
  });

  await client.send(command);
}

/**
 * Authoritatively inspects an R2 object using HeadObject.
 * Returns null if the object does not exist.
 */
export async function headR2Object(
  key: string
): Promise<{ contentLength: number; eTag: string } | null> {
  const client = getR2Client();
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const res = await client.send(command);
    if (res.ContentLength === undefined) {
      return null;
    }

    return {
      contentLength: res.ContentLength,
      eTag: (res.ETag || "").replace(/^"|"$/g, ""),
    };
  } catch (err: unknown) {
    const s3Err = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (s3Err.name === "NotFound" || s3Err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Physically deletes an object from Cloudflare R2.
 */
export async function deleteR2Object(key: string): Promise<boolean> {
  const client = getR2Client();
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (err) {
    console.error(`Failed to delete R2 object ${key}:`, err);
    return false;
  }
}

/**
 * Generates a short-lived presigned GET URL for secure downloading from Cloudflare R2.
 * Enforces a strict 90-second expiration and RFC 5987 / RFC 6266 attachment Content-Disposition.
 */
export async function createPresignedGetUrl(
  key: string,
  filename: string,
  expiresInSec = 90,
  mimeType?: string
): Promise<string> {
  const client = getR2Client();

  const asciiFilename = filename.replace(/["\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  const encodedFilename = encodeURIComponent(filename);
  const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: contentDisposition,
    ...(mimeType ? { ResponseContentType: mimeType } : {}),
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

/**
 * Generates a presigned GET URL with 'inline' Content-Disposition for browser previews
 * (images, PDFs, media). Does NOT force download attachment.
 */
export async function createPresignedPreviewUrl(
  key: string,
  filename: string,
  expiresInSec = 600,
  mimeType?: string
): Promise<string> {
  const client = getR2Client();

  const asciiFilename = filename.replace(/["\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  const encodedFilename = encodeURIComponent(filename);
  const contentDisposition = `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: contentDisposition,
    ...(mimeType ? { ResponseContentType: mimeType } : {}),
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

