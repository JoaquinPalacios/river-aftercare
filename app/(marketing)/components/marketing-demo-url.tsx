import { SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION } from "@/lib/marketing/shared-demo-links";

import styles from "../marketing.module.css";

export function MarketingDemoUrl() {
  const slash = SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION.lastIndexOf("/");
  const host = SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION.slice(0, slash);
  const path = SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION.slice(slash);

  return (
    <span className={styles.urlStrip} translate="no">
      {host}
      <wbr />
      {path}
    </span>
  );
}
