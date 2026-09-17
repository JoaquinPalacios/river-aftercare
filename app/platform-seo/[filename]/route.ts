import { servePlatformSeoAsset } from "@/lib/platform-assets/read-platform-seo-asset";

type RouteContext = {
  params: Promise<{ filename: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { filename } = await context.params;
  return servePlatformSeoAsset({
    request,
    filename,
    method: "GET",
    variant: "fallback",
  });
}

export async function HEAD(request: Request, context: RouteContext) {
  const { filename } = await context.params;
  return servePlatformSeoAsset({
    request,
    filename,
    method: "HEAD",
    variant: "fallback",
  });
}
