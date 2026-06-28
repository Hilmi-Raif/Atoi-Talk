import { CaptchaHandle } from "@/components/auth/captcha";
import { useCreateGroup } from "@/hooks/mutations/use-group";
import { errorLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { groupDescriptionSchema, groupNameSchema } from "@/lib/validators";
import { mediaService } from "@/services/media.service";
import { User } from "@/types";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const groupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
});

type GroupErrors = {
  name?: string;
  description?: string;
};

export const useCreateGroupForm = (onClose: (open: boolean) => void) => {
  const navigate = useNavigate();
  const { mutateAsync: createGroup } = useCreateGroup();

  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [groupErrors, setGroupErrors] = useState<GroupErrors>({});
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);

  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<CaptchaHandle>(null);
  const captchaResolverRef = useRef<((token: string) => void) | null>(null);
  const captchaRejecterRef = useRef<((error: Error) => void) | null>(null);

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

  const resetGroupForm = () => {
    if (groupAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    setGroupName("");
    setGroupDescription("");
    setGroupAvatar(null);
    setGroupAvatarPreview(null);
    setSelectedMembers([]);
    setGroupErrors({});
    setIsPublic(false);
    setIsCreatingGroup(false);
  };

  const handleGroupAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];

      const allowedMimes = ["image/png", "image/jpeg", "image/webp"];
      const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();

      const isMimeValid = allowedMimes.includes(file.type);
      const isExtValid = allowedExts.includes(fileExt);

      if (!isMimeValid && !isExtValid) {
        toast.error("File format not supported.", {
          id: "avatar-format-error",
        });
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
    setCropModalOpen(false);
  };

  const handleDeleteGroupAvatar = () => {
    if (groupAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    setGroupAvatar(null);
    setGroupAvatarPreview(null);
  };

  const validateGroupField = (field: keyof GroupErrors, value: string) => {
    const fieldSchema = field === "name" ? groupNameSchema : groupDescriptionSchema;
    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      setGroupErrors((prev) => ({
        ...prev,
        [field]: result.error.errors[0]?.message,
      }));
    } else {
      setGroupErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCreateGroup = async () => {
    const result = groupSchema.safeParse({
      name: groupName.trim(),
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

    if (selectedMembers.length < 1) {
      toast.error("Please select at least 1 member");
      return;
    }

    setGroupErrors({});
    setIsCreatingGroup(true);

    const memberIds = selectedMembers.map((member) => member.id);

    try {
      let avatarMediaId: string | undefined;

      if (groupAvatar) {
        const captchaToken = await solveGroupAvatarCaptcha();
        const media = await mediaService.uploadDirectMedia(groupAvatar, {
          usage: "group_avatar",
          captchaToken,
        });
        avatarMediaId = media.id;
      }

      const newGroup = await createGroup({
        name: groupName.trim(),
        ...(groupDescription.trim() ? { description: groupDescription.trim() } : {}),
        member_ids: memberIds,
        is_public: isPublic,
        ...(avatarMediaId ? { avatar_media_id: avatarMediaId } : {}),
      });

      navigate(`/chat/${newGroup.id}`);
      onClose(false);
      resetGroupForm();
    } catch (error) {
      errorLog("Failed to create group:", error);
      toast.error("Failed to create group");
    } finally {
      setIsCreatingGroup(false);
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

  return {
    groupName,
    setGroupName,
    groupDescription,
    setGroupDescription,
    groupAvatar,
    groupAvatarPreview,
    selectedMembers,
    setSelectedMembers,
    groupErrors,
    isCreatingGroup,
    isPublic,
    setIsPublic,
    cropModalOpen,
    setCropModalOpen,
    selectedImage,
    setSelectedImage,
    groupAvatarInputRef,
    captchaRef,
    resetGroupForm,
    handleGroupAvatarChange,
    handleCropComplete,
    handleDeleteGroupAvatar,
    handleCaptchaVerify,
    handleCaptchaError,
    validateGroupField,
    handleCreateGroup,
  };
};
