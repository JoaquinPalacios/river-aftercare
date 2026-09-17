"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { formatSelectedAssetFileLabel } from "@/app/(staff)/components/asset-file-label";
import {
  createLocalAssetPreviewUrl,
  revokeLocalAssetPreviewUrl,
} from "@/app/(staff)/components/local-asset-preview";
import { rasterImageSize } from "@/lib/platform-assets/image-size";

export function useAssetFileSelection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const selectionRead = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedPreviewSrc, setSelectedPreviewSrc] = useState<string | null>(
    null
  );

  const replacePreview = useCallback((next: string | null): void => {
    const previous = previewUrlRef.current;
    previewUrlRef.current = next;
    setSelectedPreviewSrc(next);
    if (previous && previous !== next) {
      revokeLocalAssetPreviewUrl(previous);
    }
  }, []);

  const clearSelection = useCallback((): void => {
    selectionRead.current += 1;
    setSelectedName(null);
    setSelectedLabel(null);
    replacePreview(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }, [replacePreview]);

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
      replacePreview(createLocalAssetPreviewUrl(file));

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
    [clearSelection, replacePreview]
  );

  useEffect(() => {
    return () => {
      revokeLocalAssetPreviewUrl(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, []);

  return {
    fileRef,
    selectedName,
    selectedLabel,
    selectedPreviewSrc,
    hasSelection: Boolean(selectedName),
    clearSelection,
    onFileChange,
  };
}
