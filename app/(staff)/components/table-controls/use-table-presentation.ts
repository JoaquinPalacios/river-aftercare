"use client";

import { useCallback, useEffect, useState } from "react";

import {
  defaultTablePreferences,
  readTablePreferences,
  sanitizeTablePreferences,
  writeTablePreferences,
  type TableColumnDefinition,
  type TablePresentationPreferences,
} from "@/lib/staff/table-controls";

export function useTablePresentation(
  tableId: string,
  columns: readonly TableColumnDefinition[]
) {
  const [preferences, setPreferences] = useState<TablePresentationPreferences>(
    () => defaultTablePreferences(columns)
  );

  useEffect(() => {
    setPreferences(readTablePreferences(tableId, columns));
  }, [tableId, columns]);

  const update = useCallback(
    (patch: Partial<TablePresentationPreferences>) => {
      setPreferences((current) => {
        const next = sanitizeTablePreferences(
          { ...current, ...patch },
          columns
        );
        writeTablePreferences(tableId, columns, next);
        return next;
      });
    },
    [columns, tableId]
  );

  const reset = useCallback(() => {
    const next = defaultTablePreferences(columns);
    writeTablePreferences(tableId, columns, next);
    setPreferences(next);
    return next;
  }, [columns, tableId]);

  return { preferences, update, reset };
}
