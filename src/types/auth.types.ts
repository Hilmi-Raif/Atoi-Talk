import { User } from "./user.types";

export interface LoginRequest {
  email: string;
  password: string;
  captcha_token: string;
}

export interface RegisterUserRequest {
  email: string;
  username: string;
  password: string;
  full_name: string;
  code: string;
  captcha_token: string;
}

export interface GoogleLoginRequest {
  code: string;
  state: string;
}

export interface GoogleInitResponse {
  auth_url: string;
  state: string;
  expires_in_seconds: number;
}

export interface ResetPasswordRequest {
  email: string;
  password: string;
  confirm_password: string;
  code: string;
  captcha_token: string;
}

export interface ChangeEmailRequest {
  email: string;
  code: string;
}

export interface ChangePasswordRequest {
  old_password?: string;
  new_password: string;
  confirm_password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DeleteAccountRequest {
  password?: string;
}
