import api from "@/lib/axios";
import type {
  ApiResponse,
  PaginatedResponse,
  SearchUsersParams,
  UpdateProfileRequest,
  User,
} from "@/types";

export const userService = {
  async getCurrentUser(signal?: AbortSignal): Promise<User> {
    const response = await api.get<ApiResponse<User>>("/api/user/current", { signal });
    return response.data.data;
  },

  async getUserById(id: string, signal?: AbortSignal): Promise<User> {
    const response = await api.get<ApiResponse<User>>(`/api/users/${id}`, { signal });
    return response.data.data;
  },

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await api.put<ApiResponse<User>>("/api/user/profile", data);
    return response.data.data;
  },

  async searchUsers(
    params: SearchUsersParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<User>> {
    const response = await api.get<PaginatedResponse<User>>("/api/users", { params, signal });
    return response.data;
  },

  async getBlockedUsers(
    params: SearchUsersParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<User>> {
    const response = await api.get<PaginatedResponse<User>>("/api/users/blocked", {
      params,
      signal,
    });
    return response.data;
  },

  async blockUser(userId: string): Promise<void> {
    await api.post(`/api/users/${userId}/block`);
  },

  async unblockUser(userId: string): Promise<void> {
    await api.post(`/api/users/${userId}/unblock`);
  },
};

export default userService;
