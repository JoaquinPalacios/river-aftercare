import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import {
  CLINIC_ASSET_CACHE_CONTROL,
  r2ClinicAssetConfig,
  type R2ClinicAssetConfig,
} from "@/lib/clinic-assets/config";
import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";
import { clinicAssetPublicUrl } from "@/lib/clinic-assets/public-url";

export type R2ObjectStoreClient = Pick<S3Client, "send">;

async function bodyToBytes(body: unknown): Promise<Uint8Array | null> {
  if (!body) {
    return null;
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return body.transformToByteArray();
  }
  return null;
}

function isR2MissingObjectError(error: unknown): boolean {
  const status =
    error &&
    typeof error === "object" &&
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  if (status === 404) {
    return true;
  }
  const name = error instanceof Error ? error.name : "";
  return name === "NoSuchKey" || name === "NotFound";
}

export function createR2S3Client(config: R2ClinicAssetConfig): S3Client {
  const clientConfig: S3ClientConfig = {
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  return new S3Client(clientConfig);
}

export function createR2ClinicAssetStorage(options?: {
  client?: R2ObjectStoreClient;
  config?: R2ClinicAssetConfig;
}): ClinicAssetStorage {
  const config = options?.config ?? r2ClinicAssetConfig();
  if (!config) {
    throw new ClinicAssetStorageUnavailableError();
  }

  const client = options?.client ?? createR2S3Client(config);

  return {
    async uploadLogo(input) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.storageKey,
            Body: input.bytes,
            ContentType: input.mimeType,
            CacheControl: CLINIC_ASSET_CACHE_CONTROL,
          })
        );
      } catch (error) {
        console.warn("[clinic-assets]", "r2_put_failed", {
          clinicId: input.clinicId,
          storageKey: input.storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        throw new Error("Could not store the clinic logo.");
      }

      const publicPath = clinicAssetPublicUrl(input.storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a clinic logo URL.");
      }

      return {
        clinicId: input.clinicId,
        storageKey: input.storageKey,
        publicPath,
      };
    },

    async deleteLogo(input) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: input.storageKey,
          })
        );
      } catch (error) {
        console.warn("[clinic-assets]", "r2_delete_failed", {
          clinicId: input.clinicId,
          storageKey: input.storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        throw new Error("Could not remove the previous clinic logo.");
      }
    },

    async readLogo(input) {
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: input.storageKey,
          })
        );
        const bytes = await bodyToBytes(result.Body);
        if (!bytes) {
          return null;
        }
        return {
          bytes,
          mimeType: result.ContentType || "application/octet-stream",
        };
      } catch (error) {
        if (isR2MissingObjectError(error)) {
          return null;
        }
        console.warn("[clinic-assets]", "r2_get_failed", {
          clinicId: input.clinicId,
          storageKey: input.storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },

    async headLogo(input) {
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: input.storageKey,
          })
        );
        return {
          contentLength:
            typeof result.ContentLength === "number"
              ? result.ContentLength
              : null,
        };
      } catch (error) {
        if (isR2MissingObjectError(error)) {
          return null;
        }
        console.warn("[clinic-assets]", "r2_head_failed", {
          clinicId: input.clinicId,
          storageKey: input.storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },

    getPublicLogoUrl(input) {
      const publicPath = clinicAssetPublicUrl(input.storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a clinic logo URL.");
      }
      return publicPath;
    },
  };
}
