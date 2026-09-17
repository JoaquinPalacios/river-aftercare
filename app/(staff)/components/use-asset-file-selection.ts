"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";

import { formatSelectedAssetFileLabel } from "@/app/(staff)/components/asset-file-label";
import { rasterImageSize } from "@/lib/platform-assets/image-size";

export function useAssetFileSelection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const selectionRead = useRef(0);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const clearSelection = useCallback((): void => {
    selectionRead.current += 1;
    setSelectedName(null);
    setSelectedLabel(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }, []);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      if (!file) {
        clearSelection();
        return;
      }

      const readId = selectionRead.current + 1;
      selectionRead.current = readId;
      setSelectedName(file.name);
      setSelectedLabel(
        formatSelectedAssetFileLabel({
          name: file.name,
          byteLength: file.size,
          width: null,
          height: null,
        })
      );

      const size = rasterImageSize(new Uint8Array(await file.arrayBuffer()));
      if (selectionRead.current !== readId) {
        return;
      }
      setSelectedLabel(
        formatSelectedAssetFileLabel({
          name: file.name,
          byteLength: file.size,
          width: size?.width ?? null,
          height: size?.height ?? null,
        })
      );
    },
    [clearSelection]
  );

  return {
    fileRef,
    selectedName,
    selectedLabel,
    hasSelection: Boolean(selectedName),
    clearSelection,
    onFileChange,
  };
}
