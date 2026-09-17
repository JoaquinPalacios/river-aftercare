export class PlatformSeoAssetError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "invalid"
  ) {
    super(message);
    this.name = "PlatformSeoAssetError";
  }
}

export function isPlatformSeoAssetError(
  error: unknown
): error is PlatformSeoAssetError {
  return error instanceof PlatformSeoAssetError;
}
