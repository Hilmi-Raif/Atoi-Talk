import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { useChangePassword, useLogout } from "@/hooks/queries";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { passwordSchema } from "@/lib/validators";
import { useUIStore } from "@/store";
import { ApiError, User } from "@/types";
import { AxiosError } from "axios";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const baseChangePasswordSchema = z.object({
  oldPassword: z.union([passwordSchema, z.literal("")]),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
});

const changePasswordSchema = baseChangePasswordSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  }
);

type SecurityErrors = {
  oldPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

const errorVariants = {
  hidden: { opacity: 0, y: -5, height: 0, marginTop: 0 },
  visible: { opacity: 1, y: 0, height: "auto", marginTop: 12 },
  exit: { opacity: 0, y: -5, height: 0, marginTop: 0 },
};

export function SecurityDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}) {
  const [securityData, setSecurityData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [securityErrors, setSecurityErrors] = useState<SecurityErrors>({});

  const { mutate: changePassword, isPending: isChangingPassword } = useChangePassword();
  const [isSecuritySubmitting, setIsSecuritySubmitting] = useState(false);

  const logout = useLogout();
  const navigate = useNavigate();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);

  const validateSecurityField = (field: keyof SecurityErrors, value: string) => {
    if (field === "oldPassword") {
      const result = baseChangePasswordSchema.shape.oldPassword.safeParse(value);
      setSecurityErrors((prev) => ({
        ...prev,
        oldPassword: result.success ? undefined : result.error.errors[0]?.message,
      }));
    }
    if (field === "newPassword") {
      const result = baseChangePasswordSchema.shape.newPassword.safeParse(value);
      setSecurityErrors((prev) => ({
        ...prev,
        newPassword: result.success ? undefined : result.error.errors[0]?.message,
      }));
    }
    if (field === "confirmPassword") {
      if (value !== securityData.newPassword) {
        setSecurityErrors((prev) => ({
          ...prev,
          confirmPassword: "Passwords do not match.",
        }));
      } else {
        setSecurityErrors((prev) => ({ ...prev, confirmPassword: undefined }));
      }
    }
  };

  const handleChangePassword = () => {
    const result = changePasswordSchema.safeParse(securityData);
    if (!result.success) {
      const errors: SecurityErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof SecurityErrors;
        errors[field] = err.message;
      });
      setSecurityErrors(errors);
      return;
    }

    setIsSecuritySubmitting(true);
    changePassword(
      {
        old_password: user.has_password ? securityData.oldPassword : undefined,
        new_password: securityData.newPassword,
        confirm_password: securityData.confirmPassword,
      },
      {
        onSuccess: () => {
          toast.success("Password updated successfully", { id: "password-update-success" });
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
          setIsSecuritySubmitting(false);
          const axiosError = error as AxiosError<ApiError>;
          toast.error(axiosError.response?.data?.error || "Password update failed", {
            id: "password-update-error",
          });
        },
      }
    );
  };

  useEffect(() => {
    if (open) {
      setSecurityData({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setSecurityErrors({});
      setIsSecuritySubmitting(false);
    }
  }, [open]);

  const handleOpenChange = (open: boolean) => {
    if (!isSecuritySubmitting) {
      onOpenChange(open);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="default"
        className="rounded-lg"
        onInteractOutside={(e) => isSecuritySubmitting && e.preventDefault()}
        onEscapeKeyDown={(e) => isSecuritySubmitting && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Set Password</DialogTitle>
          <DialogDescription>
            {user.has_password
              ? "Enter old password & new password."
              : "Create a new password for your account."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 pt-4">
          {user.has_password && (
            <div className="flex flex-col">
              <Label
                htmlFor="old-password"
                className={cn(securityErrors.oldPassword && "text-destructive")}
              >
                Old Password
              </Label>
              <div className="mt-3">
                <PasswordInput
                  id="old-password"
                  value={securityData.oldPassword}
                  className={cn(
                    securityErrors.oldPassword &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                  onChange={(e) => {
                    setSecurityData({ ...securityData, oldPassword: e.target.value });
                    validateSecurityField("oldPassword", e.target.value);
                  }}
                  placeholder="Old Password"
                  disabled={isChangingPassword}
                />
              </div>
              <AnimatePresence mode="wait">
                {securityErrors.oldPassword && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {securityErrors.oldPassword}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex flex-col">
            <Label
              htmlFor="new-password"
              className={cn(securityErrors.newPassword && "text-destructive")}
            >
              New Password
            </Label>
            <div className="mt-3">
              <PasswordInput
                id="new-password"
                value={securityData.newPassword}
                className={cn(
                  securityErrors.newPassword && "border-destructive focus-visible:ring-destructive"
                )}
                onChange={(e) => {
                  setSecurityData({ ...securityData, newPassword: e.target.value });
                  validateSecurityField("newPassword", e.target.value);
                }}
                placeholder="New Password"
                disabled={isChangingPassword}
              />
            </div>
            <AnimatePresence mode="wait">
              {securityErrors.newPassword && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {securityErrors.newPassword}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-col">
            <Label
              htmlFor="confirm-password"
              className={cn(securityErrors.confirmPassword && "text-destructive")}
            >
              Confirm Password
            </Label>
            <div className="mt-3">
              <PasswordInput
                id="confirm-password"
                value={securityData.confirmPassword}
                className={cn(
                  securityErrors.confirmPassword &&
                    "border-destructive focus-visible:ring-destructive"
                )}
                onChange={(e) => {
                  setSecurityData({ ...securityData, confirmPassword: e.target.value });
                  validateSecurityField("confirmPassword", e.target.value);
                }}
                placeholder="Confirm Password"
                disabled={isChangingPassword}
              />
            </div>
            <AnimatePresence mode="wait">
              {securityErrors.confirmPassword && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {securityErrors.confirmPassword}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={
              (user.has_password && !securityData.oldPassword) ||
              !securityData.newPassword ||
              !securityData.confirmPassword ||
              isSecuritySubmitting ||
              !!securityErrors.newPassword ||
              !!securityErrors.confirmPassword
            }
            className="w-full relative"
          >
            <span className={isSecuritySubmitting ? "opacity-0" : ""}>Save Password</span>
            {isSecuritySubmitting && (
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
