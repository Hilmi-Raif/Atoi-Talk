import api from "@/lib/axios";
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

/** API calls for chats, groups, and member management */
export const chatService = {
  /**
   * Get chat list with cursor-based pagination
   */
  async getChats(
    params: GetChatsParams = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<ChatListItem>> {
    const response = await api.get<PaginatedResponse<ChatListItem>>("/api/chats", {
      params,
      signal,
    });
    return response.data;
  },

  /**
   * Create or retrieve existing private chat
   */
  async createPrivateChat(data: CreatePrivateChatRequest): Promise<ChatListItem> {
    const response = await api.post<ApiResponse<ChatListItem>>("/api/chats/private", data);
    return response.data.data;
  },

  /**
   * Hide a chat
   */
  async hideChat(chatId: string): Promise<void> {
    await api.post(`/api/chats/${chatId}/hide`);
  },

  /**
   * Mark chat as read
   */
  async markAsRead(chatId: string): Promise<void> {
    await api.post(`/api/chats/${chatId}/read`);
  },

  /**
   * Get chat details by ID
   */
  async getChatById(chatId: string, signal?: AbortSignal): Promise<ChatListItem> {
    const response = await api.get<ApiResponse<ChatListItem>>(`/api/chats/${chatId}`, { signal });
    return response.data.data;
  },

  /**
   * Create a new group chat
   */
  async createGroup(data: CreateGroupRequest): Promise<ChatResponse> {
    const response = await api.post<ApiResponse<ChatResponse>>("/api/chats/group", data);
    return response.data.data;
  },

  /**
   * Update group info
   */
  async updateGroup(chatId: string, data: UpdateGroupRequest): Promise<ChatListItem> {
    const response = await api.put<ApiResponse<ChatListItem>>(`/api/chats/group/${chatId}`, data);
    return response.data.data;
  },

  /**
   * Leave group
   */
  async leaveGroup(chatId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/leave`);
    return response.data?.data;
  },

  /**
   * Add member to group
   */
  async addGroupMember(chatId: string, userIds: string[]): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/members`, {
      user_ids: userIds,
    });
    return response.data.data;
  },

  /**
   * Kick member from group
   */
  async kickGroupMember(chatId: string, userId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(
      `/api/chats/group/${chatId}/members/${userId}/kick`
    );
    return response.data?.data;
  },

  /**
   * Delete group
   */
  async deleteGroup(chatId: string): Promise<void> {
    await api.delete(`/api/chats/group/${chatId}`);
  },

  /**
   * Update member role
   */
  async updateMemberRole(chatId: string, userId: string, role: string): Promise<Message> {
    const response = await api.put<ApiResponse<Message>>(
      `/api/chats/group/${chatId}/members/${userId}/role`,
      {
        role,
      }
    );
    return response.data?.data;
  },

  /**
   * Transfer ownership
   */
  async transferOwnership(chatId: string, newOwnerId: string): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>(`/api/chats/group/${chatId}/transfer`, {
      new_owner_id: newOwnerId,
    });
    return response.data?.data;
  },

  /**
   * Get group members with pagination
   */
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

  /**
   * Reset group invite code and return the latest code payload
   */
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

  /**
   * Get public preview metadata from an invite code
   */
  async getGroupPreview(inviteCode: string, signal?: AbortSignal): Promise<ChatListItem> {
    const response = await api.get<ApiResponse<ChatListItem>>(
      `/api/chats/group/invite/${inviteCode}`,
      { signal }
    );
    return response.data.data;
  },

  /**
   * Join a group by invite code
   */
  async joinGroupByInvite(inviteCode: string): Promise<ChatListItem> {
    const response = await api.post<ApiResponse<ChatListItem>>("/api/chats/group/join/invite", {
      invite_code: inviteCode,
    });
    return response.data.data;
  },

  /**
   * Search public groups with cursor pagination
   */
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

  /**
   * Join a public group by group ID
   */
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
