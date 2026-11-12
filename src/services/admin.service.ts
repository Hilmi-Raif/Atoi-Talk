import { api } from "@/lib/axios";
import type { Media } from "@/types";

export interface DashboardStats {
  active_reports: number;
  total_groups: number;
  total_messages: number;
  total_users: number;
}

export interface AdminUserListResponse {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: string;
  is_banned: boolean;
  created_at: string;
}

export interface AdminUserDetailResponse {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: string;
  avatar: string;
  bio: string;
  is_banned: boolean;
  ban_reason: string;
  banned_until: string;
  last_seen_at: string;
  created_at: string;
  total_messages: number;
  total_groups: number;
}

export interface BanUserRequest {
  target_user_id: string;
  reason: string;
  duration_hours?: number;
}

export interface ResetUserInfoRequest {
  target_user_id: string;
  reset_avatar?: boolean;
  reset_bio?: boolean;
  reset_name?: boolean;
}

export interface AdminGroupListResponse {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  created_at: string;
  chat_id: string;
}

export interface AdminGroupDetailResponse {
  id: string;
  name: string;
  description: string;
  avatar: string;
  is_public: boolean;
  member_count: number;
  created_at: string;
  chat_id: string;
  created_by: string;
}

export interface GroupMemberDTO {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar: string;
  role: string;
  joined_at: string;
  is_banned?: boolean;
}

export interface ResetGroupInfoRequest {
  reset_name?: boolean;
  reset_description?: boolean;
  reset_avatar?: boolean;
}

export interface ReportListResponse {
  id: string;
  target_type: string;
  reason: string;
  status: string;
  reporter_name: string;
  created_at: string;
}

export interface EvidenceSnapshot {
  attachments?: (string | Media)[];
  data?: {
    attachments?: (string | Media)[];
  };
  sender_id?: string;
  chat_id?: string;
  group_id?: string;
  chat_type?: string;
  content?: string;
  [key: string]: unknown;
}

export interface ReportDetailResponse {
  id: string;
  target_type: string;
  target_id?: string;
  target_is_deleted: boolean;
  reason: string;
  description?: string;
  status: string;
  reporter_id: string;
  reporter_name: string;
  reporter_avatar: string;
  reporter_is_deleted: boolean;
  reporter_is_banned: boolean;
  evidence_snapshot: EvidenceSnapshot;
  admin_notes?: string;
  target_is_banned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResolveReportRequest {
  status: "resolved" | "rejected";
  notes?: string;
}

export interface PaginationMeta {
  has_next: boolean;
  has_prev: boolean;
  next_cursor: string;
  prev_cursor: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export const adminService = {
  getDashboardStats: async () => {
    const response = await api.get<{ data: DashboardStats }>("/api/admin/dashboard");
    return response.data.data;
  },

  getUsers: async (params?: { query?: string; role?: string; limit?: number; cursor?: string }) => {
    const response = await api.get<PaginatedResponse<AdminUserListResponse>>("/api/admin/users", {
      params,
    });
    return response.data;
  },

  getUser: async (userId: string) => {
    const response = await api.get<{ data: AdminUserDetailResponse }>(`/api/admin/users/${userId}`);
    return response.data.data;
  },

  banUser: async (data: BanUserRequest) => {
    const response = await api.post("/api/admin/users/ban", data);
    return response.data;
  },

  unbanUser: async (userId: string) => {
    const response = await api.post(`/api/admin/users/${userId}/unban`);
    return response.data;
  },

  resetUserInfo: async (userId: string, data: Omit<ResetUserInfoRequest, "target_user_id">) => {
    const response = await api.post(`/api/admin/users/${userId}/reset`, {
      ...data,
      target_user_id: userId,
    });
    return response.data;
  },

  getGroups: async (params?: { query?: string; limit?: number; cursor?: string }) => {
    const response = await api.get<PaginatedResponse<AdminGroupListResponse>>("/api/admin/groups", {
      params,
    });
    return response.data;
  },

  getGroupDetail: async (chatId: string) => {
    const response = await api.get<{ data: AdminGroupDetailResponse }>(
      `/api/admin/groups/${chatId}`
    );
    return response.data.data;
  },

  getGroupMembers: async (
    chatId: string,
    params?: { query?: string; cursor?: string; limit?: number }
  ) => {
    const response = await api.get<PaginatedResponse<GroupMemberDTO>>(
      `/api/admin/groups/${chatId}/members`,
      { params }
    );
    return response.data;
  },

  getGroupMembersInfinite: async ({
    queryKey,
    pageParam,
  }: {
    queryKey: [string, string, string];
    pageParam?: string;
  }) => {
    const [, chatId, query] = queryKey;
    const response = await api.get<PaginatedResponse<GroupMemberDTO>>(
      `/api/admin/groups/${chatId}/members`,
      {
        params: {
          query,
          cursor: pageParam,
          limit: 10,
        },
      }
    );
    return response.data;
  },

  resetGroupInfo: async (chatId: string, data: ResetGroupInfoRequest) => {
    const response = await api.post(`/api/admin/groups/${chatId}/reset`, data);
    return response.data;
  },

  dissolveGroup: async (chatId: string) => {
    const response = await api.delete(`/api/admin/groups/${chatId}`);
    return response.data;
  },

  getReports: async (params?: {
    status?: string;
    limit?: number;
    cursor?: string;
    query?: string;
  }) => {
    const response = await api.get<PaginatedResponse<ReportListResponse>>("/api/admin/reports", {
      params,
    });
    return response.data;
  },

  getReportDetail: async (reportId: string) => {
    const response = await api.get<{ data: ReportDetailResponse }>(
      `/api/admin/reports/${reportId}`
    );
    return response.data.data;
  },

  resolveReport: async (reportId: string, data: ResolveReportRequest) => {
    const response = await api.put(`/api/admin/reports/${reportId}/resolve`, data);
    return response.data;
  },
};
