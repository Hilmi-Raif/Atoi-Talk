import { api } from "@/lib/axios";
import { CreateReportRequest, ReportResponse } from "@/types";
import { ApiResponse } from "@/types/api";

export const reportService = {
  createReport: async (data: CreateReportRequest): Promise<ReportResponse> => {
    const response = await api.post<ApiResponse<ReportResponse>>("/api/reports", data);
    return response.data.data;
  },

  deleteReport: async (reportId: string): Promise<void> => {
    await api.delete(`/api/admin/reports/${reportId}`);
  },
};
