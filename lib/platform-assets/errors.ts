export class PlatformSeoAssetError extends Error {
  readonly code: "forbidden" | "invalid";

  constructor(message: string, code: "forbidden" | "invalid") {
    super(message);
    this.name = "PlatformSeoAssetError";
    this.code = code;
  }
}

export function isPlatformSeoAssetError(
  error: unknown
): error is PlatformSeoAssetError {
  return error instanceof PlatformSeoAssetError;
}
