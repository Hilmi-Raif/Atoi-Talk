import { Captcha, CaptchaHandle } from "@/components/auth/captcha";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalLightbox } from "@/components/ui/lightbox";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateProfile } from "@/hooks/queries";
import { getInitials } from "@/lib/avatar-utils";
import { errorLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { bioSchema, nameSchema, usernameSchema } from "@/lib/validators";
import { mediaService } from "@/services/media.service";
import { ApiError, User } from "@/types";
import { AxiosError } from "axios";
import { Camera, Eye, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ImageCropper } from "../../image-cropper";

const profileSchema = z.object({
  username: usernameSchema.optional(),
  name: nameSchema,
  bio: bioSchema,
});

type ProfileErrors = {
  username?: string;
  name?: string;
  bio?: string;
};

const errorVariants = {
  hidden: { opacity: 0, y: -5, height: 0, marginTop: 0 },
  visible: { opacity: 1, y: 0, height: "auto", marginTop: 12 },
  exit: { opacity: 0, y: -5, height: 0, marginTop: 0 },
};

export function MyProfileDialog({
  open,
  onOpenChange,
  user,
  onOpenSecurity,
  onOpenChangeEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onOpenSecurity: () => void;
  onOpenChangeEmail: () => void;
}) {
  const [accountData, setAccountData] = useState({
    name: user.full_name,
    username: user.username,
    bio: user.bio || "",
    avatarFile: null as File | null,
    avatarPreview: user.avatar || null,
    deleteAvatar: false,
  });

  useEffect(() => {
    setAccountData((prev) => ({
      ...prev,
      name: user.full_name,
      username: user.username,
      bio: user.bio || "",
      avatarPreview: user.avatar || null,
    }));
  }, [user.full_name, user.username, user.bio, user.avatar]);

  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [isModalAvatarLoaded, setIsModalAvatarLoaded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<CaptchaHandle>(null);
  const captchaResolverRef = useRef<((token: string) => void) | null>(null);

  const { mutateAsync: updateProfile, isPending: isUpdatingProfile } = useUpdateProfile();
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const isSubmitting = isProfileSubmitting || isUpdatingProfile;

  const solveAvatarCaptcha = () =>
    new Promise<string>((resolve, reject) => {
      captchaResolverRef.current = resolve;
      captchaRef.current?.reset();

      window.setTimeout(() => {
        if (captchaResolverRef.current === resolve) {
          captchaResolverRef.current = null;
          reject(new Error("Captcha verification timed out"));
        }
      }, 30000);
    });

  const validateField = (field: keyof ProfileErrors, value: string) => {
    const fieldSchema = {
      username: profileSchema.shape.username,
      name: profileSchema.shape.name,
      bio: profileSchema.shape.bio,
    }[field];

    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      setProfileErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message }));
    } else {
      setProfileErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const hasChanges =
    accountData.name.trim() !== user.full_name.trim() ||
    accountData.username.trim() !== user.username.trim() ||
    (accountData.bio || "").trim() !== (user.bio || "").trim() ||
    !!accountData.avatarFile ||
    (accountData.deleteAvatar && !!user.avatar);

  const handleUpdateProfile = async () => {
    const result = profileSchema.safeParse({
      username: accountData.username.trim(),
      name: accountData.name.trim(),
      bio: (accountData.bio || "").trim(),
    });

    if (!result.success) {
      const errors: ProfileErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ProfileErrors;
        if (!errors[field]) {
          errors[field] = err.message;
        }
      });
      setProfileErrors(errors);
      return;
    }

    setProfileErrors({});

    setIsProfileSubmitting(true);

    try {
      let avatarMediaId: string | undefined;

      if (accountData.avatarFile && !accountData.deleteAvatar) {
        const captchaToken = await solveAvatarCaptcha();
        const media = await mediaService.uploadDirectMedia(accountData.avatarFile, {
          usage: "user_avatar",
          captchaToken,
        });
        avatarMediaId = media.id;
      }

      await updateProfile({
        username: accountData.username.trim(),
        full_name: accountData.name.trim(),
        bio: (accountData.bio || "").trim(),
        ...(avatarMediaId ? { avatar_media_id: avatarMediaId } : {}),
        ...(accountData.deleteAvatar ? { delete_avatar: true } : {}),
      });

      toast.success("Profile updated successfully", { id: "profile-update-success" });
      onOpenChange(false);
    } catch (error) {
      errorLog("Profile update failed", error);
      const axiosError = error as AxiosError<ApiError>;
      toast.error(axiosError.response?.data?.error || "Profile update failed", {
        id: "profile-update-error",
      });
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];

      const allowedMimes = ["image/png", "image/jpeg", "image/webp"];
      const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();

      const isMimeValid = allowedMimes.includes(file.type);
      const isExtValid = allowedExts.includes(fileExt);

      if (!isMimeValid && !isExtValid) {
        toast.error("File format not supported.", { id: "avatar-format-error" });
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        toast.error("File exceeds 2MB limit", { id: "avatar-size-error" });
        return;
      }

      setOriginalFilename(file.name);
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setSelectedImage(reader.result?.toString() || null);
        setCropModalOpen(true);
        e.target.value = "";
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (blob: Blob) => {
    if (accountData.avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(accountData.avatarPreview);
    }
    const previewUrl = URL.createObjectURL(blob);
    const avatarFile = new File([blob], originalFilename || "avatar.jpg", {
      type: blob.type || "image/jpeg",
    });
    setAccountData((prev) => ({
      ...prev,
      avatarFile,
      avatarPreview: previewUrl,
      deleteAvatar: false,
    }));
    setCropModalOpen(false);
  };

  const handleDeleteAvatar = () => {
    if (accountData.avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(accountData.avatarPreview);
    }
    setAccountData((prev) => ({
      ...prev,
      avatarFile: null,
      avatarPreview: null,
      deleteAvatar: true,
    }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
        <DialogContent
          size="default"
          onInteractOutside={(e) =>
            (isLightboxOpen || isSubmitting || cropModalOpen) && e.preventDefault()
          }
          onEscapeKeyDown={(e) => {
            if (isSubmitting || cropModalOpen) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 pt-4">
            <div className="flex flex-col items-center gap-4">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <div
                    className={cn(
                      "relative group cursor-pointer",
                      isSubmitting && "pointer-events-none opacity-50"
                    )}
                  >
                    <Avatar className="h-24 w-24">
                      <AvatarImage
                        src={accountData.avatarPreview || undefined}
                        onLoadingStatusChange={(status) =>
                          setIsModalAvatarLoaded(status === "loaded")
                        }
                      />
                      <AvatarFallback className="text-4xl">
                        {getInitials(accountData.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  side="bottom"
                  sideOffset={-5}
                  className="z-[100]"
                >
                  {accountData.avatarPreview && isModalAvatarLoaded && (
                    <>
                      <DropdownMenuItem onSelect={() => setIsLightboxOpen(true)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Photo
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                    <Camera className="mr-2 h-4 w-4" />
                    Change Photo
                  </DropdownMenuItem>
                  {accountData.avatarPreview && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={handleDeleteAvatar}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove Photo
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="flex flex-col">
              <Label
                htmlFor="username"
                className={cn(profileErrors.username && "text-destructive")}
              >
                Username
              </Label>
              <Input
                id="username"
                value={accountData.username}
                className={cn(
                  "mt-3",
                  profileErrors.username && "border-destructive focus-visible:ring-destructive"
                )}
                disabled={isSubmitting}
                onChange={(e) => {
                  const normalized = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "");
                  setAccountData({ ...accountData, username: normalized });
                  validateField("username", normalized);
                }}
              />
              <AnimatePresence mode="wait">
                {profileErrors.username && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {profileErrors.username}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <div className="flex flex-col">
              <Label htmlFor="name" className={cn(profileErrors.name && "text-destructive")}>
                Full Name
              </Label>
              <Input
                id="name"
                value={accountData.name}
                disabled={isSubmitting}
                className={cn(
                  "mt-3",
                  profileErrors.name && "border-destructive focus-visible:ring-destructive"
                )}
                onChange={(e) => {
                  setAccountData({ ...accountData, name: e.target.value });
                  validateField("name", e.target.value);
                }}
              />
              <AnimatePresence mode="wait">
                {profileErrors.name && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {profileErrors.name}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <div className="flex flex-col">
              <Label htmlFor="email">Email</Label>
              <div className="flex gap-2 mt-3">
                <Input id="email" type="email" value={user.email} disabled className="bg-muted" />
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!user.has_password || isSubmitting}
                  onClick={() => {
                    onOpenChangeEmail();
                  }}
                  title={!user.has_password ? "Set password first" : "Change Email"}
                >
                  <div className="h-4 w-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-settings"
                    >
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                </Button>
              </div>
              {!user.has_password && (
                <p className="text-[0.8rem] text-muted-foreground mt-2">
                  Set{" "}
                  <span
                    className="text-primary font-medium cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {
                      onOpenChange(false);
                      setTimeout(() => onOpenSecurity(), 150);
                    }}
                  >
                    password
                  </span>{" "}
                  to change email.
                </p>
              )}
            </div>
            <div className="flex flex-col">
              <Label htmlFor="bio" className={cn(profileErrors.bio && "text-destructive")}>
                Bio
              </Label>
              <Textarea
                id="bio"
                className={cn(
                  "resize-none min-h-[80px] max-h-[120px] overflow-y-auto break-words mt-3",
                  profileErrors.bio && "border-destructive focus-visible:ring-destructive"
                )}
                value={accountData.bio}
                disabled={isSubmitting}
                onChange={(e) => {
                  setAccountData({ ...accountData, bio: e.target.value });
                  validateField("bio", e.target.value);
                }}
              />
              <AnimatePresence mode="wait">
                {profileErrors.bio && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {profileErrors.bio}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <Button
              onClick={handleUpdateProfile}
              disabled={isSubmitting || !hasChanges}
              className="relative"
            >
              <span className={isSubmitting ? "opacity-0" : ""}>Save Changes</span>
              {isSubmitting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="h-4 w-4" />
                </div>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImageCropper
        image={selectedImage}
        open={cropModalOpen}
        onOpenChange={(open: boolean) => {
          setCropModalOpen(open);
        }}
        onCropComplete={handleCropComplete}
      />

      <GlobalLightbox
        open={isLightboxOpen}
        close={() => setIsLightboxOpen(false)}
        slides={
          accountData.avatarPreview
            ? [{ src: accountData.avatarPreview, alt: "Avatar Preview" }]
            : []
        }
      />

      <Captcha
        ref={captchaRef}
        action="profile-avatar-upload"
        onVerify={(token) => {
          captchaResolverRef.current?.(token);
          captchaResolverRef.current = null;
        }}
        onError={() => {
          captchaResolverRef.current = null;
          toast.error("Captcha verification failed", { id: "profile-captcha-error" });
        }}
      />
    </>
  );
}
