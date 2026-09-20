import type { ReactNode } from "react";

import { StatusPage } from "@/app/components/status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export function PatientStatusPage({
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
      className="notFound"
      brandClassName="notFoundBrand"
      markClassName="notFoundMark"
      titleClassName="notFoundTitle"
      descriptionClassName="notFoundCopy"
      actionsClassName="notFoundActions"
    />
  );
}
