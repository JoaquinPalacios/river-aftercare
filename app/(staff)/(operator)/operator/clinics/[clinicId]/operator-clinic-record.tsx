import type { ReactNode } from "react";

export function OperatorClinicRecord({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  if (!collapsed) {
    return (
      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </section>
    );
  }

  return (
    <details className="operatorClinicRecord">
      <summary>{title}</summary>
      <div className="operatorClinicRecordBody">{children}</div>
    </details>
  );
}

export function OperatorClinicRecordGroup({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  if (!collapsed) {
    return <>{children}</>;
  }

  return (
    <details className="operatorClinicRecord">
      <summary>{title}</summary>
      <div className="operatorClinicRecordBody">{children}</div>
    </details>
  );
}
