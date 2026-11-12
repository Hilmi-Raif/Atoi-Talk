import api from "@/lib/axios";
import type { SendOTPRequest } from "@/types";

export const otpService = {
  async sendOTP(data: SendOTPRequest): Promise<void> {
    await api.post("/api/otp/send", data);
  },
};

export default otpService;
