export interface PlatformSeoAssetObject {
  storageKey: string;
  publicPath: string;
}

export interface PlatformSeoAssetUploadInput {
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface PlatformSeoAssetReadResult {
  bytes: Uint8Array;
}

export interface PlatformSeoAssetHeadResult {
  contentLength: number | null;
}

export interface PlatformSeoAssetStorage {
  upload(input: PlatformSeoAssetUploadInput): Promise<PlatformSeoAssetObject>;
  delete(input: { storageKey: string }): Promise<void>;
  read(input: {
    storageKey: string;
  }): Promise<PlatformSeoAssetReadResult | null>;
  head(input: {
    storageKey: string;
  }): Promise<PlatformSeoAssetHeadResult | null>;
  getPublicUrl(input: { storageKey: string }): string;
}
