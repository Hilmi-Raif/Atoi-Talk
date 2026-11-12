import api from "@/lib/axios";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { useAuthStore } from "@/store";
import type {
  ApiResponse,
  ChatListItem,
  ChatResponse,
  CreateGroupRequest,
  CreatePrivateChatRequest,
  GetChatsParams,
  GroupMember,
  Message,
  PaginatedResponse,
  PublicGroupDTO,
  UpdateGroupRequest,
} from "@/types";

export const chatService = {
  async getChats(
    params: GetChatsParams = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<ChatListItem>> {
    const token = useAuthStore.getState().token;
    const response = await api.get<PaginatedResponse<ChatListItem>>("/api/chats", {
      params,
      signal,
    });
    if (useAuthStore.getState().token === token)
      useNotificationPreferences.getState().mergeChats(
        response.data.data.map((c) => ({
          chat_id: c.id,
          muted_forever: c.muted_forever ?? false,
          muted_until: c.muted_until,
        }))
      );
    return response.data;
  },

  async createPrivateChat(data: CreatePrivateChatRequest): Promise<ChatListItem> {
    const response = await api.post<ApiResponse<ChatListItem>>("/api/chats/private", data);
    return response.data.data;
  },

  async hideChat(chatId: string): Promise<void> {
    await api.post(`/api/chats/${chatId}/hide`);
  },

  async markAsRead(chatId: string): Promise<void> {
    await api.post(`/api/chats/${chatId}/read`);
  },

  async getChatById(chatId: string, signal?: AbortSignal): Promise<ChatListItem> {
    const token = useAuthStore.getState().token;
    const response = await api.get<ApiResponse<ChatListItem>>(`/api/chats/${chatId}`, { signal });
    const c = response.data.data;
    if (useAuthStore.getState().token === token)
      useNotificationPreferences
        .getState()
        .mergeChats([
          { chat_id: c.id, muted_forever: c.muted_forever ?? false, muted_until: c.muted_until },
        ]);
    return response.data.data;
  },

  async createGroup(data: CreateGroupRequest): Promise<ChatResponse> {
    const response = await api.post<ApiResponse<ChatResponse>>("/api/chats/group", data);
    return response.data.data;
  },

  async updateGroup(chatId: string, data: UpdateGroupRequest): Promise<ChatListItem> {
    const response = await api.put<ApiResponse<ChatListItem>>(`/api/chats/group/${chatId}`, data);
    return response.data.data;
  },

  async leaveGroup(chatId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/leave`);
    return response.data?.data;
  },

  async addGroupMember(chatId: string, userIds: string[]): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/members`, {
      user_ids: userIds,
    });
    return response.data.data;
  },

  async kickGroupMember(chatId: string, userId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(
      `/api/chats/group/${chatId}/members/${userId}/kick`
    );
    return response.data?.data;
  },

  async deleteGroup(chatId: string): Promise<void> {
    await api.delete(`/api/chats/group/${chatId}`);
  },

  async updateMemberRole(chatId: string, userId: string, role: string): Promise<Message> {
    const response = await api.put<ApiResponse<Message>>(
      `/api/chats/group/${chatId}/members/${userId}/role`,
      {
        role,
      }
    );
    return response.data?.data;
  },

  async transferOwnership(chatId: string, newOwnerId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/transfer`, {
      new_owner_id: newOwnerId,
    });
    return response.data?.data;
  },

  async getGroupMembers(
    chatId: string,
    params: { query?: string; cursor?: string; limit?: number } = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<GroupMember>> {
    const response = await api.get<PaginatedResponse<GroupMember>>(
      `/api/chats/group/${chatId}/members`,
      { params, signal }
    );
    return response.data;
  },

  async resetGroupInviteCode(chatId: string): Promise<{ code: string; expires_at: string }> {
    const response = await api.put<
      ApiResponse<{ invite_code?: string; code?: string; expires_at: string }>
    >(`/api/chats/group/${chatId}/invite`);
    const data = response.data.data;
    return {
      code: data.invite_code || data.code || "",
      expires_at: data.expires_at,
    };
  },

  async getGroupPreview(inviteCode: string, signal?: AbortSignal): Promise<ChatListItem> {
    const response = await api.get<ApiResponse<ChatListItem>>(
      `/api/chats/group/invite/${inviteCode}`,
      { signal }
    );
    return response.data.data;
  },

  async joinGroupByInvite(inviteCode: string): Promise<ChatListItem> {
    const response = await api.post<ApiResponse<ChatListItem>>("/api/chats/group/join/invite", {
      invite_code: inviteCode,
    });
    return response.data.data;
  },

  async searchPublicGroups(
    params: { query?: string; cursor?: string; limit?: number; sort_by?: string } = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<PublicGroupDTO>> {
    const response = await api.get<PaginatedResponse<PublicGroupDTO>>("/api/chats/group/public", {
      params,
      signal,
    });
    return response.data;
  },

  async joinGroup(chatId: string): Promise<ChatListItem | null> {
    const response = await api.post<ApiResponse<ChatListItem>>(`/api/chats/group/${chatId}/join`);

    if (response.data && "data" in response.data) {
      return response.data.data;
    }

    if (response.data) {
      return response.data as unknown as ChatListItem;
    }

    return null;
  },
};

export default chatService;
