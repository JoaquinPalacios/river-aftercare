import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CanonicalPatientPreview } from "@/app/(staff)/(operator-preview)/operator/templates/canonical-patient-preview";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Operator preview · ${PRODUCT_NAME}`,
  robots: PRIVATE_ROBOTS,
};

export default async function CanonicalTemplateRevisionPreviewPage({
  params,
}: {
  params: Promise<{ templateId: string; revisionId: string }>;
}) {
  await requirePlatformOperator();
  const { templateId, revisionId } = await params;
  const template = await loadOperatorCanonicalTemplate(templateId);
  const revision = template?.revisions.find((item) => item.id === revisionId);
  if (!template || !revision) {
    notFound();
  }

  return (
    <CanonicalPatientPreview
      templateId={template.id}
      templateTitle={template.title}
      isSample={template.isSample}
      revision={revision}
    />
  );
}
