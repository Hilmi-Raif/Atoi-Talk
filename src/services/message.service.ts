import api from "@/lib/axios";
import type {
  ApiResponse,
  EditMessageRequest,
  GetMessagesParams,
  Message,
  PaginatedResponse,
  SendMessageRequest,
} from "@/types";

export const messageService = {
  async getMessages(
    chatId: string,
    params: GetMessagesParams = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Message>> {
    const response = await api.get<PaginatedResponse<Message>>(`/api/chats/${chatId}/messages`, {
      params,
      signal,
    });
    return response.data;
  },

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const response = await api.post<ApiResponse<Message>>("/api/messages", data);
    return response.data.data;
  },

  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/api/messages/${messageId}`);
  },

  async editMessage(messageId: string, data: EditMessageRequest): Promise<Message> {
    const response = await api.put<ApiResponse<Message>>(`/api/messages/${messageId}`, data);
    return response.data.data;
  },
};

export default messageService;
