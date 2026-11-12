import api from "@/lib/axios";
import { disablePush } from "@/lib/push";
import { useAuthStore } from "@/store";
import type {
  ApiResponse,
  AuthResponse,
  ChangeEmailRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  GoogleInitResponse,
  GoogleLoginRequest,
  LoginRequest,
  RegisterUserRequest,
  ResetPasswordRequest,
} from "@/types";

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>("/api/auth/login", data);
    return response.data.data;
  },

  async register(data: RegisterUserRequest): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>("/api/auth/register", data);
    return response.data.data;
  },

  async initGoogleAuth(): Promise<GoogleInitResponse> {
    const response = await api.get<ApiResponse<GoogleInitResponse>>("/api/auth/google/init");
    return response.data.data;
  },

  async googleLogin(data: GoogleLoginRequest): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>("/api/auth/google", data);
    return response.data.data;
  },

  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    await api.post("/api/auth/reset-password", data);
  },

  async changeEmail(data: ChangeEmailRequest): Promise<void> {
    await api.put("/api/account/email", data);
  },

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    await api.put("/api/account/password", data);
  },

  async deleteAccount(data: DeleteAccountRequest): Promise<void> {
    await api.delete("/api/account", { data });
  },

  async logout(): Promise<void> {
    await disablePush(useAuthStore.getState().token).catch(() => {});
    await api.post("/api/auth/logout");
  },
};

export default authService;
