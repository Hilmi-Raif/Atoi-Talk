import api from "@/lib/axios";
import type {
  ApiResponse,
  Media,
  MediaUsage,
  UploadMediaRequest,
  UploadMediaResponse,
} from "@/types";

interface UploadDirectMediaOptions {
  usage: MediaUsage;
  captchaToken: string;
  signal?: AbortSignal;
}

/** API calls for media upload and URL refresh */
export const mediaService = {
  /**
   * Upload a media file directly to storage using a backend-provided presigned URL.
   */
  async uploadDirectMedia(file: File, options: UploadDirectMediaOptions): Promise<Media> {
    const body: UploadMediaRequest = {
      usage: options.usage,
      original_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      captcha_token: options.captchaToken,
    };

    const uploadResponse = await api.post<ApiResponse<UploadMediaResponse>>(
      "/api/media/upload",
      body,
      {
        signal: options.signal,
      }
    );
    const upload = uploadResponse.data.data;

    const storageResponse = await fetch(upload.upload_url, {
      method: upload.upload_method,
      headers: upload.upload_headers,
      body: file,
      signal: options.signal,
    });

    if (!storageResponse.ok) {
      throw new Error(
        `Storage upload failed: ${storageResponse.status} ${storageResponse.statusText}`.trim()
      );
    }

    const completeResponse = await api.post<ApiResponse<Media>>(
      `/api/media/${upload.media.id}/complete`,
      undefined,
      {
        signal: options.signal,
      }
    );
    return completeResponse.data.data;
  },

  /**
   * Compatibility wrapper for existing callers while upload flows migrate usage explicitly.
   */
  async uploadMedia(file: File, captchaToken: string, signal?: AbortSignal): Promise<Media> {
    return mediaService.uploadDirectMedia(file, {
      usage: "message_attachment",
      captchaToken,
      signal,
    });
  },

  /**
   * Refresh a presigned URL for a media file
   */
  async refreshMediaUrl(mediaId: string): Promise<string> {
    const response = await api.get<ApiResponse<{ url: string }>>(`/api/media/${mediaId}/url`);
    return response.data.data.url;
  },
};

export default mediaService;
