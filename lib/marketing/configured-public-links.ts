import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import type { MarketingPublicLinks } from "@/lib/marketing/public-links";
import { marketingSiteOrigin } from "@/lib/marketing/site";
import { apexPublicUrl, labeledPublicUrl } from "@/lib/tenancy/public-url";
import { getRootDomain } from "@/lib/tenancy/root-domain";

const LOCAL_DEV_PORT = "3000";

/**
 * Marketing CTAs from configuration, not the incoming request.
 * `headers()` would opt an otherwise static marketing page into dynamic
 * rendering. Staff and operator surfaces keep `marketingPublicLinks()`.
 */
export function marketingConfiguredPublicLinks(
  env: NodeJS.ProcessEnv = process.env
): MarketingPublicLinks {
  const rootDomain = getRootDomain(env);
  const origin = new URL(marketingSiteOrigin(env));
  const localHost =
    origin.hostname === "localhost" || origin.hostname.endsWith(".localhost");
  const port = origin.port || (localHost ? LOCAL_DEV_PORT : "");
  const requestHost = port ? `${origin.hostname}:${port}` : origin.hostname;
  const protocol = origin.protocol.replace(/:$/, "");
  const localPort = port ? `:${port}` : "";

  return {
    demoHref:
      labeledPublicUrl({
        requestHost,
        rootDomain,
        label: DEMO_AFTERCARE_TENANT_SLUG,
        protocol,
      }) ?? `http://${DEMO_AFTERCARE_TENANT_SLUG}.localhost:${LOCAL_DEV_PORT}/`,
    staffHref:
      labeledPublicUrl({
        requestHost,
        rootDomain,
        label: "app",
        protocol,
        pathname: "/login",
      }) ?? `http://app.localhost:${LOCAL_DEV_PORT}/login`,
    homeHref:
      apexPublicUrl({
        requestHost,
        rootDomain,
        protocol,
      }) ?? `${protocol}://${rootDomain}${localPort}/`,
  };
}
