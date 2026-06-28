import api from "@/lib/axios";
import type {
  ApiResponse,
  PaginatedResponse,
  SearchUsersParams,
  UpdateProfileRequest,
  User,
} from "@/types";

/** API calls for user profile, lookup, and block lists */
export const userService = {
  /**
   * Get current logged-in user
   */
  async getCurrentUser(signal?: AbortSignal): Promise<User> {
    const response = await api.get<ApiResponse<User>>("/api/user/current", { signal });
    return response.data.data;
  },

  /**
   * Get user by ID
   */
  async getUserById(id: string, signal?: AbortSignal): Promise<User> {
    const response = await api.get<ApiResponse<User>>(`/api/users/${id}`, { signal });
    return response.data.data;
  },

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await api.put<ApiResponse<User>>("/api/user/profile", data);
    return response.data.data;
  },

  /**
   * Search users with cursor-based pagination
   */
  async searchUsers(
    params: SearchUsersParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<User>> {
    const response = await api.get<PaginatedResponse<User>>("/api/users", { params, signal });
    return response.data;
  },

  /**
   * Get blocked users
   */
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

  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<void> {
    await api.post(`/api/users/${userId}/block`);
  },

  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<void> {
    await api.post(`/api/users/${userId}/unblock`);
  },
};

export default userService;
