import { Captcha, CaptchaHandle } from "@/components/auth/captcha";
import { ImageCropper } from "@/components/image-cropper";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateGroup } from "@/hooks/mutations/use-group";
import { getInitials } from "@/lib/avatar-utils";
import { errorLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { groupDescriptionSchema, groupNameSchema } from "@/lib/validators";
import { mediaService } from "@/services/media.service";
import { ChatListItem } from "@/types";
import { Camera, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

interface EditGroupDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  chat: ChatListItem;
}

const errorVariants = {
  hidden: { opacity: 0, y: -5, height: 0, marginTop: 0 },
  visible: { opacity: 1, y: 0, height: "auto", marginTop: 8 },
  exit: { opacity: 0, y: -5, height: 0, marginTop: 0 },
};

const groupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
});

type GroupErrors = {
  name?: string;
  description?: string;
};

export function EditGroupDialog({ isOpen, onClose, chat }: EditGroupDialogProps) {
  const [groupName, setGroupName] = useState(chat.name || "");
  const [groupDescription, setGroupDescription] = useState(chat.description || "");
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(chat.avatar);
  const [groupErrors, setGroupErrors] = useState<GroupErrors>({});
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(chat.is_public || false);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<CaptchaHandle>(null);
  const captchaResolverRef = useRef<((token: string) => void) | null>(null);
  const captchaRejecterRef = useRef<((error: Error) => void) | null>(null);

  const { mutateAsync: updateGroup, isPending: isUpdating } = useUpdateGroup();
  const isSubmitting = isGroupSubmitting || isUpdating;

  const solveGroupAvatarCaptcha = () =>
    new Promise<string>((resolve, reject) => {
      captchaResolverRef.current = resolve;
      captchaRejecterRef.current = reject;
      captchaRef.current?.reset();

      window.setTimeout(() => {
        if (captchaResolverRef.current === resolve) {
          captchaResolverRef.current = null;
          captchaRejecterRef.current = null;
          reject(new Error("Captcha verification timed out"));
        }
      }, 30000);
    });

  useEffect(() => {
    if (isOpen) {
      setGroupName(chat.name || "");
      setGroupDescription(chat.description || "");
      setGroupAvatarPreview(chat.avatar);
      setGroupAvatar(null);
      setGroupErrors({});
      setIsPublic(chat.is_public || false);
      setRemoveAvatar(false);
      setIsGroupSubmitting(false);
    }
  }, [isOpen, chat]);

  const hasChanges =
    (groupName || "").trim() !== (chat.name || "") ||
    groupDescription.trim() !== (chat.description || "") ||
    isPublic !== (chat.is_public || false) ||
    groupAvatar !== null ||
    removeAvatar;

  const handleGroupAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (groupAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    const previewUrl = URL.createObjectURL(blob);
    const avatarFile = new File([blob], originalFilename || "avatar.jpg", {
      type: blob.type || "image/jpeg",
    });
    setGroupAvatar(avatarFile);
    setGroupAvatarPreview(previewUrl);
    setRemoveAvatar(false);
    setCropModalOpen(false);
  };

  const handleDeleteGroupAvatar = () => {
    if (groupAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    setGroupAvatar(null);
    setGroupAvatarPreview(null);
    setRemoveAvatar(true);
  };

  const validateGroupField = (field: keyof GroupErrors, value: string) => {
    const fieldSchema = field === "name" ? groupNameSchema : groupDescriptionSchema;
    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      setGroupErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message }));
    } else {
      setGroupErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSaveGroup = async () => {
    const result = groupSchema.safeParse({
      name: (groupName || "").trim(),
      description: groupDescription.trim() || undefined,
    });

    if (!result.success) {
      const errors: GroupErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof GroupErrors;
        if (!errors[field]) {
          errors[field] = err.message;
        }
      });
      setGroupErrors(errors);
      return;
    }

    setGroupErrors({});
    setIsGroupSubmitting(true);

    try {
      let avatarMediaId: string | undefined;

      if (groupAvatar && !removeAvatar) {
        const captchaToken = await solveGroupAvatarCaptcha();
        const media = await mediaService.uploadDirectMedia(groupAvatar, {
          usage: "group_avatar",
          captchaToken,
        });
        avatarMediaId = media.id;
      }

      await updateGroup({
        groupId: chat.id,
        data: {
          name: (groupName || "").trim(),
          ...(groupDescription.trim() ? { description: groupDescription.trim() } : {}),
          is_public: isPublic,
          ...(avatarMediaId ? { avatar_media_id: avatarMediaId } : {}),
          ...(removeAvatar ? { delete_avatar: true } : {}),
        },
      });
      onClose(false);
    } catch (error) {
      errorLog("Failed to update group:", error);
      toast.error("Failed to update group");
    } finally {
      setIsGroupSubmitting(false);
    }
  };

  const handleCaptchaVerify = (token: string) => {
    captchaResolverRef.current?.(token);
    captchaResolverRef.current = null;
    captchaRejecterRef.current = null;
  };

  const handleCaptchaError = () => {
    captchaRejecterRef.current?.(new Error("Captcha verification failed"));
    captchaResolverRef.current = null;
    captchaRejecterRef.current = null;
    toast.error("Captcha verification failed", { id: "group-captcha-error" });
  };

  const initials = getInitials(chat.name);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && onClose(val)}>
        <DialogContent
          size="default"
          onInteractOutside={(e) => (cropModalOpen || isSubmitting) && e.preventDefault()}
          onEscapeKeyDown={(e) => (cropModalOpen || isSubmitting) && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 pt-2">
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
                      <AvatarImage src={groupAvatarPreview || undefined} />
                      <AvatarFallback className="text-4xl">
                        {groupAvatarPreview ? initials : <Users className="size-10 text-white" />}
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
                  <DropdownMenuItem onSelect={() => groupAvatarInputRef.current?.click()}>
                    <Camera className="mr-2 h-4 w-4" />
                    {groupAvatarPreview ? "Change Photo" : "Upload Photo"}
                  </DropdownMenuItem>
                  {groupAvatarPreview && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={handleDeleteGroupAvatar}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove Photo
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={groupAvatarInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                onChange={handleGroupAvatarChange}
              />
            </div>

            <div className="flex flex-col">
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input
                id="edit-group-name"
                placeholder="Enter group name"
                value={groupName}
                className="mt-3"
                onChange={(e) => {
                  setGroupName(e.target.value);
                  validateGroupField("name", e.target.value);
                }}
                disabled={isSubmitting}
              />
              <AnimatePresence mode="wait">
                {groupErrors.name && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {groupErrors.name}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col">
              <Label htmlFor="edit-group-description">Description</Label>
              <Textarea
                id="edit-group-description"
                placeholder="Enter group description (optional)"
                value={groupDescription}
                className="resize-none min-h-[80px] max-h-[120px] overflow-y-auto break-words mt-3"
                onChange={(e) => {
                  setGroupDescription(e.target.value);
                  validateGroupField("description", e.target.value);
                }}
                disabled={isSubmitting}
              />
              <AnimatePresence mode="wait">
                {groupErrors.description && (
                  <motion.p
                    variants={errorVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                  >
                    {groupErrors.description}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label>Public Group</Label>
                <span className="text-xs text-muted-foreground">Anyone can find and join</span>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={isSubmitting} />
            </div>

            <Button
              className="w-full relative"
              onClick={handleSaveGroup}
              disabled={
                isSubmitting ||
                !(groupName || "").trim() ||
                !hasChanges ||
                !!groupErrors.name ||
                !!groupErrors.description
              }
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
        open={cropModalOpen}
        onOpenChange={setCropModalOpen}
        image={selectedImage || ""}
        onCropComplete={handleCropComplete}
      />

      <Captcha
        ref={captchaRef}
        action="group-avatar-upload"
        onVerify={handleCaptchaVerify}
        onError={handleCaptchaError}
      />
    </>
  );
}
