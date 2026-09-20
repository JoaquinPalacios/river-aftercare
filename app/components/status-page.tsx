import type { ReactNode } from "react";

import { ProductMark } from "@/lib/branding/product-mark";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export function StatusPage({
  title,
  description,
  actions,
  brand = PRODUCT_NAME,
  className,
  brandClassName,
  markClassName,
  titleClassName,
  descriptionClassName,
  actionsClassName,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  brand?: string;
  className?: string;
  brandClassName?: string;
  markClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionsClassName?: string;
}) {
  return (
    <main className={className}>
      <p className={brandClassName}>
        <ProductMark className={markClassName} />
        {brand}
      </p>
      <h1 className={titleClassName}>{title}</h1>
      <p className={descriptionClassName}>{description}</p>
      {actions ? <div className={actionsClassName}>{actions}</div> : null}
    </main>
  );
}
