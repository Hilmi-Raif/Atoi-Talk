import { errorLog } from "@/lib/logger";
import { mediaService } from "@/services/media.service";
import type { MediaUsage } from "@/types";
import { useMutation } from "@tanstack/react-query";

export const useUploadMedia = () => {
  return useMutation({
    mutationFn: ({
      file,
      usage,
      captchaToken,
      signal,
    }: {
      file: File;
      usage: MediaUsage;
      captchaToken: string;
      signal?: AbortSignal;
    }) => mediaService.uploadDirectMedia(file, { usage, captchaToken, signal }),
    onError: (error) => {
      if (
        error.name === "Aborted" ||
        error.message === "aborted" ||
        error.name === "CanceledError"
      ) {
        return;
      }
      errorLog("Upload failed in mutation:", error);
    },
  });
};
