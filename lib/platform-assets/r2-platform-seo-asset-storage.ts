import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  CLINIC_ASSET_CACHE_CONTROL,
  r2ClinicAssetConfig,
  type R2ClinicAssetConfig,
} from "@/lib/clinic-assets/config";
import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";
import {
  createR2S3Client,
  type R2ObjectStoreClient,
} from "@/lib/clinic-assets/r2-clinic-asset-storage";
import type { PlatformSeoAssetStorage } from "@/lib/platform-assets/platform-seo-asset-storage";
import { isPlatformSeoStorageKey } from "@/lib/platform-assets/platform-seo-image";
import { platformSeoAssetPublicUrl } from "@/lib/platform-assets/public-url";

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

function requireKey(storageKey: string): string {
  if (!isPlatformSeoStorageKey(storageKey)) {
    throw new Error("That social image path is not allowed.");
  }
  return storageKey;
}

export function createR2PlatformSeoAssetStorage(options?: {
  client?: R2ObjectStoreClient;
  config?: R2ClinicAssetConfig;
}): PlatformSeoAssetStorage {
  const config = options?.config ?? r2ClinicAssetConfig();
  if (!config) {
    throw new ClinicAssetStorageUnavailableError();
  }

  const client = options?.client ?? createR2S3Client(config);

  return {
    async upload(input) {
      const storageKey = requireKey(input.storageKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
            Body: input.bytes,
            ContentType: input.mimeType,
            CacheControl: CLINIC_ASSET_CACHE_CONTROL,
          })
        );
      } catch (error) {
        console.warn("[platform-assets]", "r2_put_failed", {
          storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        throw new Error("Could not store the social image.");
      }

      const publicPath = platformSeoAssetPublicUrl(storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a social image URL.");
      }

      return { storageKey, publicPath };
    },

    async delete(input) {
      const storageKey = requireKey(input.storageKey);
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
          })
        );
      } catch (error) {
        console.warn("[platform-assets]", "r2_delete_failed", {
          storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        throw new Error("Could not remove the previous social image.");
      }
    },

    async read(input) {
      const storageKey = requireKey(input.storageKey);
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
          })
        );
        const bytes = await bodyToBytes(result.Body);
        if (!bytes) {
          return null;
        }
        return { bytes };
      } catch (error) {
        if (isR2MissingObjectError(error)) {
          return null;
        }
        console.warn("[platform-assets]", "r2_get_failed", {
          storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },

    async head(input) {
      const storageKey = requireKey(input.storageKey);
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
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
        console.warn("[platform-assets]", "r2_head_failed", {
          storageKey,
          class: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },

    getPublicUrl(input) {
      const storageKey = requireKey(input.storageKey);
      const publicPath = platformSeoAssetPublicUrl(storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a social image URL.");
      }
      return publicPath;
    },
  };
}
