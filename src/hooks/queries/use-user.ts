import { userService } from "@/services";
import { useAuthStore } from "@/store";
import { UpdateProfileRequest, User } from "@/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useCurrentUser() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: ["user", "current"],
    queryFn: ({ signal }) => userService.getCurrentUser(signal),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUserById(
  id: string | null,
  options?: { enabled?: boolean; initialData?: User }
) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: ({ signal }) => userService.getUserById(id!, signal),
    enabled: (options?.enabled ?? true) && !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialData: options?.initialData,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => userService.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.setQueryData(["user", "current"], updatedUser);
    },
  });
}

export function useSearchUsers(
  query: string,
  options?: { enabled?: boolean; excludeChatId?: string }
) {
  return useInfiniteQuery({
    queryKey: ["users", "search", query, options?.excludeChatId],
    queryFn: ({ pageParam, signal }) =>
      userService.searchUsers(
        {
          query,
          cursor: pageParam as string | undefined,
          limit: 20,
          include_chat_id: true,
          exclude_chat_id: options?.excludeChatId,
        },
        signal
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_next ? lastPage.meta.next_cursor : undefined,
    enabled: options?.enabled ?? true,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useBlockedUsers(query: string, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ["users", "blocked", query],
    queryFn: ({ pageParam, signal }) =>
      userService.getBlockedUsers(
        {
          query,
          cursor: pageParam as string | undefined,
          limit: 20,
        },
        signal
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_next ? lastPage.meta.next_cursor : undefined,
    enabled: options?.enabled ?? true,
  });
}
