export interface ClinicLogoObject {
  clinicId: string;
  storageKey: string;
  publicPath: string;
}

export interface ClinicLogoUploadInput {
  clinicId: string;
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface ClinicLogoReadResult {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ClinicLogoHeadResult {
  contentLength: number | null;
}

export interface ClinicAssetStorage {
  uploadLogo(input: ClinicLogoUploadInput): Promise<ClinicLogoObject>;
  deleteLogo(input: { clinicId: string; storageKey: string }): Promise<void>;
  readLogo(input: {
    clinicId: string;
    storageKey: string;
  }): Promise<ClinicLogoReadResult | null>;
  headLogo(input: {
    clinicId: string;
    storageKey: string;
  }): Promise<ClinicLogoHeadResult | null>;
  /**
   * Keys currently stored under `clinics/<clinicId>/branding/`.
   * Only keys owned by that clinic are returned.
   */
  listOwnedBrandingKeys(clinicId: string): Promise<string[]>;
  getPublicLogoUrl(input: { clinicId: string; storageKey: string }): string;
}
