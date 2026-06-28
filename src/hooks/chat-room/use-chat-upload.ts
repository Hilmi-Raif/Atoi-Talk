import { CaptchaHandle } from "@/components/auth/captcha";
import { debugLog, errorLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { Media, MediaUsage } from "@/types";
import React, { useRef, useState } from "react";

interface UseChatUploadProps {
  uploadMedia: (variables: {
    file: File;
    usage: MediaUsage;
    captchaToken: string;
    signal?: AbortSignal;
  }) => Promise<Media>;
  setAttachments: React.Dispatch<React.SetStateAction<Media[]>>;
  attachments: Media[];
}

export function useChatUpload({ uploadMedia, setAttachments, attachments }: UseChatUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [isSolvingCaptcha, setIsSolvingCaptcha] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const pendingUploadsRef = useRef<File[]>([]);
  const uploadingKeysRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const captchaRef = useRef<CaptchaHandle>(null);

  const truncateFilename = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const extensionIndex = name.lastIndexOf(".");
    const extension = extensionIndex !== -1 ? name.substring(extensionIndex) : "";
    const nameWithoutExt = extensionIndex !== -1 ? name.substring(0, extensionIndex) : name;

    const visibleChars = maxLength - extension.length - 3;
    if (visibleChars <= 0) return name;

    const half = Math.floor(visibleChars / 2);
    return `${nameWithoutExt.substring(0, half)}...${nameWithoutExt.substring(nameWithoutExt.length - half)}${extension}`;
  };

  const handleCaptchaError = () => {
    setIsSolvingCaptcha(false);

    pendingUploadsRef.current.forEach((file) => {
      setTimeout(() => {
        toast.error(`Failed to upload "${truncateFilename(file.name)}"`);
      }, 0);
    });

    pendingUploadsRef.current = [];
    setUploadingFiles([]);
    uploadingKeysRef.current.clear();
  };

  const handleCancelUploads = () => {
    setIsCancelling(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    pendingUploadsRef.current = [];
    setUploadingFiles([]);
    uploadingKeysRef.current.clear();
    setIsSolvingCaptcha(false);

    setTimeout(() => {
      setIsCancelling(false);
    }, 1000);
  };

  const processNextFile = async (token: string) => {
    if (pendingUploadsRef.current.length === 0) {
      setIsSolvingCaptcha(false);
      return;
    }

    const file = pendingUploadsRef.current[0];
    const remainingFiles = pendingUploadsRef.current.slice(1);

    pendingUploadsRef.current = remainingFiles;

    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }
    const signal = abortControllerRef.current.signal;

    try {
      const media = await uploadMedia({
        file,
        usage: "message_attachment",
        captchaToken: token,
        signal,
      });

      if (!signal.aborted) {
        setAttachments((prev) => [...prev, media]);

        setUploadingFiles((prev) =>
          prev.filter(
            (f) =>
              f !== file &&
              !(
                f.name === file.name &&
                f.size === file.size &&
                f.lastModified === file.lastModified
              )
          )
        );

        const key = `${file.name}-${file.size}-${file.lastModified}`;
        uploadingKeysRef.current.delete(key);

        if (remainingFiles.length > 0 && pendingUploadsRef.current.length > 0) {
          captchaRef.current?.reset();
        } else {
          setIsSolvingCaptcha(false);
        }
      }
    } catch (error) {
      if (signal.aborted) {
        debugLog("Upload aborted for", file.name);
        setIsSolvingCaptcha(false);
        return;
      }

      errorLog("File upload error:", error);

      setUploadingFiles((prev) =>
        prev.filter(
          (f) =>
            f !== file &&
            !(f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)
        )
      );
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      uploadingKeysRef.current.delete(key);

      if (remainingFiles.length > 0) {
        captchaRef.current?.reset();
      } else {
        setIsSolvingCaptcha(false);
      }

      setTimeout(() => {
        toast.error(`Failed to upload "${truncateFilename(file.name)}"`);
      }, 0);
    }
  };

  const handleFilesChange = async (newFiles: File[]) => {
    const addedFiles = newFiles.filter(
      (nf) =>
        !uploadingFiles.some(
          (uf) => uf.name === nf.name && uf.size === nf.size && uf.lastModified === nf.lastModified
        )
    );

    const notUploadedFiles = addedFiles.filter(
      (nf) => !attachments.some((att) => att.original_name === nf.name && att.file_size === nf.size)
    );

    const trulyNewFiles = notUploadedFiles.filter((nf) => {
      const key = `${nf.name}-${nf.size}-${nf.lastModified}`;
      return !uploadingKeysRef.current.has(key);
    });

    const validFiles: File[] = [];
    const MAX_SIZE = 20 * 1024 * 1024;

    for (const file of trulyNewFiles) {
      if (file.size > MAX_SIZE) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        uploadingKeysRef.current.add(key);
        setTimeout(() => {
          toast.error(`File "${truncateFilename(file.name)}" exceeds 20MB`);
        }, 0);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    validFiles.forEach((f) => {
      const key = `${f.name}-${f.size}-${f.lastModified}`;
      uploadingKeysRef.current.add(key);
    });

    setUploadingFiles((prev) => {
      const uniqueNew = validFiles.filter(
        (nf) =>
          !prev.some(
            (uf) =>
              uf.name === nf.name && uf.size === nf.size && uf.lastModified === nf.lastModified
          )
      );
      return [...prev, ...uniqueNew];
    });

    pendingUploadsRef.current = [...pendingUploadsRef.current, ...validFiles];
    setIsSolvingCaptcha(true);
    captchaRef.current?.reset();
  };

  return {
    uploadingFiles,
    setUploadingFiles,
    isSolvingCaptcha,
    setIsSolvingCaptcha,
    isCancelling,
    pendingUploadsRef,
    uploadingKeysRef,
    captchaRef,
    handleFilesChange,
    handleCancelUploads,
    handleCaptchaError,
    processNextFile,
  };
}
