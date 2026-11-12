export type OTPMode = "register" | "reset" | "change_email";

export interface SendOTPRequest {
  email: string;
  mode: OTPMode;
  captcha_token: string;
}
