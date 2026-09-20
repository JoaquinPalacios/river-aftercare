import Link from "next/link";
import type { ReactNode } from "react";

import { StatusPage } from "@/app/components/status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

import styles from "../marketing.module.css";

export function MarketingStatusPage({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <StatusPage
      brand={PRODUCT_NAME}
      title={title}
      description={description}
      actions={actions}
      className={styles.statusPage}
      brandClassName={styles.statusBrand}
      markClassName={styles.statusMark}
      titleClassName={styles.statusTitle}
      descriptionClassName={styles.statusCopy}
      actionsClassName={styles.statusActions}
    />
  );
}

export function MarketingStatusLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? `${styles.button} ${styles.primary}`
          : `${styles.button} ${styles.secondary}`
      }
    >
      {children}
    </Link>
  );
}
