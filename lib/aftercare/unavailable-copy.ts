import { PRODUCT_NAME } from "@/lib/branding/product-name";

/**
 * Application tenant 404 copy. Same wording for missing, removed,
 * unpublished, or never-existed clinic slugs and for unpublished guides.
 * Do not branch this copy on slug existence or lifecycle.
 */
export const AFTERCARE_UNAVAILABLE_HEADING =
  "This aftercare guide isn’t available";

export const AFTERCARE_UNAVAILABLE_BODY =
  "The page you opened isn’t available. If you were given this link by your clinic, please contact them directly.";

export const AFTERCARE_UNAVAILABLE_HOME_LABEL = `Go to ${PRODUCT_NAME}`;
