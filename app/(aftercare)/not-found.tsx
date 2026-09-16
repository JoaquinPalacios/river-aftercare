import { ProductLogo } from "@/lib/branding/product-logo";
import { PRODUCT_MARKETING_ORIGIN } from "@/lib/branding/product-name";
import {
  AFTERCARE_UNAVAILABLE_BODY,
  AFTERCARE_UNAVAILABLE_HEADING,
  AFTERCARE_UNAVAILABLE_HOME_LABEL,
} from "@/lib/aftercare/unavailable-copy";

import styles from "./not-found.module.css";

export default function AftercareNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <ProductLogo className={styles.logo} />
        <h1 className={styles.title}>{AFTERCARE_UNAVAILABLE_HEADING}</h1>
        <p className={styles.copy}>{AFTERCARE_UNAVAILABLE_BODY}</p>
        <a className={styles.home} href={PRODUCT_MARKETING_ORIGIN}>
          {AFTERCARE_UNAVAILABLE_HOME_LABEL}
        </a>
      </div>
    </main>
  );
}
