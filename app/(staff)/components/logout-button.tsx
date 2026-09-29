"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StaffNavIcon } from "@/app/(staff)/components/staff-nav-icon";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLogout() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
        });

        if (response.ok) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError("Unable to sign out right now.");
      } catch {
        setError("Unable to sign out right now.");
      }
    });
  }

  return (
    <div className={className ?? "flex min-w-0 flex-col"}>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="staffNavRow staffSignOut"
        data-tooltip={isPending ? "Signing out" : "Sign out"}
      >
        <StaffNavIcon name="sign-out" />
        <span className="staffNavLabel">
          {isPending ? "Signing out..." : "Sign out"}
        </span>
      </button>
      {error ? (
        <p className="px-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
