"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { StaffNavIcon } from "@/app/(staff)/components/staff-nav-icon";
import { StaffSidebarTooltip } from "@/app/(staff)/components/staff-sidebar-tooltip";

const STORAGE_KEY = "river-aftercare-staff-sidebar";

export function StaffSidebarFrame({ children }: { children: ReactNode }) {
  const reactId = useId().replace(/:/g, "");
  const sidebarId = `staff-sidebar-${reactId}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "collapsed");
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
      return next;
    });
  }

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      id={sidebarId}
      className="staffAppSidebar"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="staffSidebarTools">
        <button
          type="button"
          className="staffNavRow staffSidebarToggle"
          data-tooltip={label}
          aria-expanded={!collapsed}
          aria-controls={sidebarId}
          onClick={toggle}
        >
          <StaffNavIcon name={collapsed ? "expand" : "collapse"} />
          <span className="staffNavLabel">{label}</span>
        </button>
      </div>
      {children}
      <StaffSidebarTooltip enabled={collapsed} />
    </aside>
  );
}
