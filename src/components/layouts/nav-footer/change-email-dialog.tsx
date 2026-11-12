import { Captcha, CaptchaHandle } from "@/components/auth/captcha";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useChangeEmail, useLogout, useSendOTP } from "@/hooks/queries";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { emailSchema, otpSchema } from "@/lib/validators";
import { useUIStore } from "@/store";
import { ApiError, User } from "@/types";
import { AxiosError } from "axios";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const changeEmailSchema = z.object({
  newEmail: emailSchema,
  otp: otpSchema,
});

type EmailErrors = {
  newEmail?: string;
  otp?: string;
};

const errorVariants = {
  hidden: { opacity: 0, y: -5, height: 0, marginTop: 0 },
  visible: { opacity: 1, y: 0, height: "auto", marginTop: 12 },
  exit: { opacity: 0, y: -5, height: 0, marginTop: 0 },
};

export function ChangeEmailDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}) {
  const [emailData, setEmailData] = useState({
    newEmail: "",
    otp: "",
  });
  const [emailErrors, setEmailErrors] = useState<EmailErrors>({});

  const { mutate: changeEmail, isPending: isChangingEmail } = useChangeEmail();
  const { mutate: sendOTP, isPending: isSendingOTP } = useSendOTP();
  const logout = useLogout();

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isCaptchaSolving, setIsCaptchaSolving] = useState(true);
  const captchaRef = useRef<CaptchaHandle>(null);

  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);

  const navigate = useNavigate();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);

  useEffect(() => {
    if (open) {
      setEmailData({ newEmail: "", otp: "" });
      setEmailErrors({});
      setIsEmailSubmitting(false);
    }
  }, [open]);

  const validateEmailField = (field: keyof EmailErrors, value: string) => {
    if (field === "newEmail" && value === user.email) {
      setEmailErrors((prev) => ({
        ...prev,
        newEmail: "New email must be different from current email.",
      }));
      return;
    }

    const fieldSchema = {
      newEmail: changeEmailSchema.shape.newEmail,
      otp: changeEmailSchema.shape.otp,
    }[field];

    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      setEmailErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message }));
    } else {
      setEmailErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSendOTP = () => {
    if (!captchaToken) {
      toast.error("Please wait for Captcha verification", { id: "captcha-wait" });
      return;
    }

    const emailResult = changeEmailSchema.shape.newEmail.safeParse(emailData.newEmail);
    if (!emailResult.success) {
      setEmailErrors((prev) => ({ ...prev, newEmail: emailResult.error.errors[0]?.message }));
      return;
    }

    sendOTP(
      {
        email: emailData.newEmail.trim(),
        mode: "change_email",
        captcha_token: captchaToken,
      },
      {
        onSuccess: () => {
          toast.success("OTP sent to your email", { id: "otp-sent-success" });
          captchaRef.current?.reset();
          setCaptchaToken(null);
          setIsCaptchaSolving(true);
        },
        onError: (error) => {
          const axiosError = error as AxiosError<ApiError>;
          toast.error(axiosError.response?.data?.error || "Failed to send OTP", {
            id: "otp-sent-error",
          });
          captchaRef.current?.reset();
          setCaptchaToken(null);
          setIsCaptchaSolving(true);
        },
      }
    );
  };

  const handleChangeEmail = () => {
    const result = changeEmailSchema.safeParse(emailData);
    if (!result.success) {
      const errors: EmailErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof EmailErrors;
        errors[field] = err.message;
      });
      setEmailErrors(errors);
      return;
    }

    setIsEmailSubmitting(true);
    changeEmail(
      {
        email: emailData.newEmail.trim(),
        code: emailData.otp.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Email updated successfully", { id: "email-update-success" });
          setGlobalLoading(true, "Please log in again");
          onOpenChange(false);
          setTimeout(() => {
            logout().then(() => {
              navigate("/login");
              setGlobalLoading(false);
            });
          }, 2000);
        },
        onError: (error) => {
          setIsEmailSubmitting(false);
          const axiosError = error as AxiosError<ApiError>;
          toast.error(axiosError.response?.data?.error || "Email update failed", {
            id: "email-update-error",
          });
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!isEmailSubmitting && !isSendingOTP) {
          onOpenChange(val);
        }
      }}
    >
      <DialogContent
        size="default"
        className="rounded-lg"
        onInteractOutside={(e) => (isEmailSubmitting || isSendingOTP) && e.preventDefault()}
        onEscapeKeyDown={(e) => (isEmailSubmitting || isSendingOTP) && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Change Email</DialogTitle>
          <DialogDescription>Enter new email to receive verification code.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 pt-4">
          <div className="flex flex-col">
            <Label htmlFor="new-email" className={cn(emailErrors.newEmail && "text-destructive")}>
              New Email
            </Label>
            <div className="flex gap-2 mt-3">
              <Input
                id="new-email"
                type="email"
                value={emailData.newEmail}
                className={cn(
                  emailErrors.newEmail && "border-destructive focus-visible:ring-destructive"
                )}
                onChange={(e) => {
                  const val = e.target.value.replace(/\s/g, "");
                  setEmailData({ ...emailData, newEmail: val });
                  validateEmailField("newEmail", val);
                }}
                placeholder="Email"
                disabled={isSendingOTP || isChangingEmail}
              />
              <Button
                variant="outline"
                disabled={
                  !emailData.newEmail ||
                  isSendingOTP ||
                  isCaptchaSolving ||
                  !captchaToken ||
                  !!emailErrors.newEmail ||
                  isChangingEmail
                }
                type="button"
                onClick={handleSendOTP}
                className="w-[110px] relative"
              >
                <span className={isSendingOTP ? "opacity-0" : ""}>Request OTP</span>
                {isSendingOTP && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </div>
            <AnimatePresence mode="wait">
              {emailErrors.newEmail && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {emailErrors.newEmail}
                </motion.p>
              )}
            </AnimatePresence>
            <Captcha
              ref={captchaRef}
              onVerify={(token) => {
                setCaptchaToken(token);
                setIsCaptchaSolving(false);
              }}
              onError={() => {
                setCaptchaToken(null);
                setIsCaptchaSolving(true);
                if (import.meta.env.DEV) {
                  console.warn("Captcha failed to load, retrying...");
                }
              }}
              onExpire={() => {
                setCaptchaToken(null);
                setIsCaptchaSolving(true);
                captchaRef.current?.reset();
              }}
            />
          </div>
          <div className="flex flex-col">
            <Label htmlFor="otp" className={cn(emailErrors.otp && "text-destructive")}>
              OTP Code
            </Label>
            <Input
              id="otp"
              value={emailData.otp}
              className={cn(
                "mt-3",
                emailErrors.otp && "border-destructive focus-visible:ring-destructive"
              )}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setEmailData({ ...emailData, otp: val });
                validateEmailField("otp", val);
              }}
              placeholder="OTP Code"
              maxLength={6}
              disabled={isChangingEmail || isSendingOTP}
            />
            <AnimatePresence mode="wait">
              {emailErrors.otp && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {emailErrors.otp}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <Button
            onClick={handleChangeEmail}
            disabled={
              !emailData.newEmail ||
              emailData.otp.length < 6 ||
              isEmailSubmitting ||
              !!emailErrors.newEmail ||
              !!emailErrors.otp ||
              isCaptchaSolving ||
              isSendingOTP
            }
            className="w-full relative"
          >
            <span className={isEmailSubmitting || isCaptchaSolving ? "opacity-0" : ""}>
              Change Email
            </span>
            {(isEmailSubmitting || isCaptchaSolving) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="h-4 w-4" />
              </div>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
