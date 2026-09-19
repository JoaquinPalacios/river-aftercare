import type { ReactNode } from "react";

import { OperatorAccountChrome } from "@/app/(staff)/components/operator-account-chrome";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requirePlatformOperator();

  return (
    <OperatorAccountChrome userLabel={user.name?.trim() || user.email}>
      {children}
    </OperatorAccountChrome>
  );
}
