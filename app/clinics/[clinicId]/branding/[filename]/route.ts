import { serveClinicLogo } from "@/lib/clinic-assets/read-clinic-logo";

type RouteContext = {
  params: Promise<{ clinicId: string; filename: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { clinicId, filename } = await context.params;
  return serveClinicLogo({
    request,
    clinicId,
    filename,
    method: "GET",
    variant: "public",
  });
}

export async function HEAD(request: Request, context: RouteContext) {
  const { clinicId, filename } = await context.params;
  return serveClinicLogo({
    request,
    clinicId,
    filename,
    method: "HEAD",
    variant: "public",
  });
}
