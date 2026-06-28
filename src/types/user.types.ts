/**
 * User data transfer object
 * Matches API response structure
 */
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar: string | null;
  bio: string | null;
  username: string;
  has_password: boolean;
  private_chat_id?: string | null;
  is_online?: boolean;
  last_seen_at?: string;
  is_blocked_by_me?: boolean;
  is_blocked_by_other?: boolean;
  role?: string;
  is_banned?: boolean;
}

/**
 * Payload for user.update event
 */
export interface UserUpdateEventPayload {
  id: string;
  username: string;
  full_name: string;
  avatar: string | null;
  bio: string | null;
  last_seen_at?: string;
}

/**
 * Update profile request
 */
export interface UpdateProfileRequest {
  username?: string;
  full_name: string;
  bio?: string;
  avatar_media_id?: string;
  delete_avatar?: boolean;
}

/**
 * Search users query parameters
 */
export interface SearchUsersParams {
  query?: string;
  cursor?: string;
  limit?: number;
  include_chat_id?: boolean;
  exclude_chat_id?: string;
}
