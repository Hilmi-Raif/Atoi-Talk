import { errorLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { useChatStore } from "@/store";

import {
  ChatListItem,
  ChatResponse,
  CreateGroupRequest,
  GroupMember,
  Message,
  PaginatedResponse,
  PublicGroupDTO,
  UpdateGroupRequest,
} from "@/types";
import { InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

export const useCreateGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGroupRequest) => chatService.createGroup(data),
    onSuccess: (newGroup: ChatResponse) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((c) => c.id !== newGroup.id),
          }));

          if (newPages.length > 0) {
            newPages[0] = {
              ...newPages[0],
              data: [newGroup as ChatListItem, ...newPages[0].data],
            };
          }

          return { ...oldData, pages: newPages };
        }
      );
      queryClient.setQueryData<ChatListItem>(["chat", newGroup.id], newGroup as ChatListItem);

      const initialMessages = (newGroup as unknown as ChatListItem).last_message
        ? [(newGroup as unknown as ChatListItem).last_message!]
        : [];

      queryClient.setQueryData<InfiniteData<PaginatedResponse<Message>>>(
        ["messages", newGroup.id],
        {
          pages: [
            {
              data: initialMessages,
              meta: {
                has_next: false,
                has_prev: false,
                next_cursor: "",
                prev_cursor: "",
              },
            },
          ],
          pageParams: [],
        }
      );

      toast.success("Group created successfully");
      return newGroup;
    },
    onError: (error) => {
      errorLog("Failed to create group:", error);
      toast.error("Failed to create group");
    },
  });
};

export const useUpdateGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: UpdateGroupRequest }) =>
      chatService.updateGroup(groupId, data),
    onSuccess: (updatedGroup: ChatListItem, { groupId }) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat) =>
              chat.id === groupId ? { ...chat, ...updatedGroup } : chat
            ),
          }));
          return { ...oldData, pages: newPages };
        }
      );
      queryClient.setQueryData<ChatListItem>(["chat", groupId], (oldChat) => {
        if (!oldChat) return updatedGroup;
        const inviteCode = updatedGroup.invite_code || (updatedGroup as { code?: string }).code;
        return {
          ...oldChat,
          ...updatedGroup,
          invite_code: inviteCode !== undefined ? inviteCode : oldChat.invite_code,
        };
      });
      toast.success("Group updated successfully");
    },
    onError: (error) => {
      errorLog("Failed to update group:", error);
      toast.error("Failed to update group");
    },
  });
};

export const useLeaveGroup = (callback?: (chatId: string) => void) => {
  const queryClient = useQueryClient();
  const setActiveChatId = useChatStore((state) => state.setActiveChatId);

  return useMutation({
    mutationFn: (chatId: string) => chatService.leaveGroup(chatId),
    onSuccess: (_data, chatId) => {
      if (callback) callback(chatId);
      setActiveChatId(null);

      const allChats = queryClient.getQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>({
        queryKey: ["chats"],
      });
      let groupName = "Group";
      for (const [, cacheData] of allChats) {
        const found = cacheData?.pages.flatMap((p) => p.data).find((c) => c.id === chatId);
        if (found?.name) {
          const name = found.name;
          groupName = name.length > 20 ? name.slice(0, 20) + "..." : name;
          break;
        }
      }

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((chat) => chat.id !== chatId),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<PublicGroupDTO>>>(
        { queryKey: ["public-groups"] },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: Array.isArray(page.data)
                ? page.data.map((group) =>
                    group.chat_id === chatId ? { ...group, is_member: false } : group
                  )
                : [],
            })),
          };
        }
      );

      setTimeout(() => {
        queryClient.removeQueries({ queryKey: ["messages", chatId] });
      }, 500);
      queryClient.invalidateQueries({ queryKey: ["users", "search"] });
      toast.success(`Left "${groupName}"`);
    },
    onError: (error) => {
      errorLog("Failed to leave group:", error);
      toast.error("Failed to leave group");
    },
  });
};

export const useDeleteGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId }: { chatId: string; name?: string }) => chatService.deleteGroup(chatId),
    onMutate: ({ chatId }) => {
      useChatStore.getState().addDeletedChatId(chatId);
    },
    onSuccess: (_data, { chatId, name }) => {
      let groupName = name || "Group";

      if (!name) {
        const allChats = queryClient.getQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>({
          queryKey: ["chats"],
        });
        for (const [, cacheData] of allChats) {
          const found = cacheData?.pages.flatMap((p) => p.data).find((c) => c.id === chatId);
          if (found?.name) {
            const foundName = found.name;
            groupName = foundName.length > 20 ? foundName.slice(0, 20) + "..." : foundName;
            break;
          }
        }
      } else {
        groupName = name.length > 20 ? name.slice(0, 20) + "..." : name;
      }

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((chat) => chat.id !== chatId),
          }));
          return { ...oldData, pages: newPages };
        }
      );
      setTimeout(() => {
        queryClient.removeQueries({ queryKey: ["messages", chatId] });
        queryClient.removeQueries({ queryKey: ["chat", chatId] });
      }, 500);
      toast.success(`"${groupName}" deleted`);
    },
    onError: (error, { chatId }) => {
      useChatStore.getState().removeDeletedChatId(chatId);
      errorLog("Failed to delete group:", error);
      toast.error("Failed to delete group");
    },
  });
};

export const useAddGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, userIds }: { chatId: string; userIds: string[] }) =>
      chatService.addGroupMember(chatId, userIds),
    onSuccess: (_data, { chatId, userIds }) => {
      queryClient.setQueryData<ChatListItem>(["chat", chatId], (oldChat) => {
        if (!oldChat) return oldChat;
        const backendMemberCount = (_data as Message & { member_count?: number }).member_count;
        return {
          ...oldChat,
          member_count:
            typeof backendMemberCount === "number"
              ? backendMemberCount
              : (oldChat.member_count || 0) + userIds.length,
        };
      });

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const backendMemberCount = (_data as Message & { member_count?: number }).member_count;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat) =>
              chat.id === chatId
                ? {
                    ...chat,
                    member_count:
                      typeof backendMemberCount === "number"
                        ? backendMemberCount
                        : (chat.member_count || 0) + userIds.length,
                  }
                : chat
            ),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      toast.success("Members added successfully");
    },
    onError: (error) => {
      errorLog("Failed to add members:", error);
      toast.error("Failed to add members");
    },
  });
};

export const useKickGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, userId }: { chatId: string; userId: string }) =>
      chatService.kickGroupMember(chatId, userId),
    onSuccess: (_data, { chatId }) => {
      queryClient.setQueryData<ChatListItem>(["chat", chatId], (oldChat) => {
        if (!oldChat) return oldChat;
        const backendMemberCount = (_data as Message & { member_count?: number }).member_count;
        return {
          ...oldChat,
          member_count:
            typeof backendMemberCount === "number"
              ? backendMemberCount
              : Math.max(0, (oldChat.member_count || 0) - 1),
        };
      });

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const backendMemberCount = (_data as Message & { member_count?: number }).member_count;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat) =>
              chat.id === chatId
                ? {
                    ...chat,
                    member_count:
                      typeof backendMemberCount === "number"
                        ? backendMemberCount
                        : Math.max(0, (chat.member_count || 0) - 1),
                  }
                : chat
            ),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.invalidateQueries({ queryKey: ["users", "search"] });
      toast.success("Member removed successfully");
    },
    onError: (error) => {
      errorLog("Failed to remove member:", error);
      toast.error("Failed to remove member");
    },
  });
};

export const useUpdateMemberRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, userId, role }: { chatId: string; userId: string; role: string }) =>
      chatService.updateMemberRole(chatId, userId, role),
    onSuccess: (_data, { chatId, userId, role }) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<GroupMember>>>(
        { queryKey: ["group-members", "infinite", chatId] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((member) =>
                member.user_id === userId ? { ...member, role: role as "admin" | "member" } : member
              ),
            })),
          };
        }
      );

      toast.success("Role updated successfully");
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        const message = error.response.data?.error || "Role update failed";
        toast.error(message);
        return;
      }
      errorLog("Failed to update role:", error);
      toast.error("Failed to update role");
    },
  });
};

export const useTransferOwnership = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, newOwnerId }: { chatId: string; newOwnerId: string }) =>
      chatService.transferOwnership(chatId, newOwnerId),
    onSuccess: (_data, { chatId, newOwnerId }) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<GroupMember>>>(
        { queryKey: ["group-members", "infinite", chatId] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((member) => {
                if (member.user_id === newOwnerId) {
                  return { ...member, role: "owner" };
                }
                return member;
              }),
            })),
          };
        }
      );

      toast.success("Ownership transferred successfully");
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        const message = error.response.data?.error || "Transfer failed";
        toast.error(message);
        return;
      }
      errorLog("Failed to transfer ownership:", error);
      toast.error("Failed to transfer ownership");
    },
  });
};

export const useResetInviteCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) => chatService.resetGroupInviteCode(chatId),
    onSuccess: (data, chatId) => {
      queryClient.setQueryData<ChatListItem>(["chat", chatId], (oldChat) => {
        if (!oldChat) return oldChat;
        return { ...oldChat, invite_code: data.code };
      });
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((chat) =>
                chat.id === chatId ? { ...chat, invite_code: data.code } : chat
              ),
            })),
          };
        }
      );
      toast.success("Invite link has been reset");
    },
    onError: (error) => {
      errorLog("Failed to reset invite code:", error);
      toast.error("Failed to reset invite link");
    },
  });
};
