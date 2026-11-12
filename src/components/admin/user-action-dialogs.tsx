import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminService, AdminUserDetailResponse } from "@/services/admin.service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner as UiSpinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { useEffect, useState } from "react";
import { UserDetailContent } from "./user-detail-content";

interface UserBanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function UserBanDialog({ open, onOpenChange, userId, onSuccess }: UserBanDialogProps) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("");
  useEffect(() => {
    if (open) {
      setReason("");
      setDuration("");
    }
  }, [open]);
  const queryClient = useQueryClient();

  const banMutation = useMutation({
    mutationFn: adminService.banUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-members-infinite"] });
      toast.success("User banned successfully");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: () => toast.error("Failed to ban user"),
  });

  const handleSubmit = () => {
    if (userId && reason) {
      banMutation.mutate({
        target_user_id: userId,
        reason: reason,
        duration_hours: duration ? parseInt(duration) : undefined,
      });
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ban User"
      description="This will prevent the user from accessing the platform."
      confirmText="Ban User"
      variant="destructive"
      onConfirm={handleSubmit}
      isLoading={banMutation.isPending}
      className="sm:max-w-[425px]"
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="ban-reason">Reason for ban *</Label>
          <Textarea
            id="ban-reason"
            placeholder="Violation of terms of service..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={banMutation.isPending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ban-duration">Duration (hours, leave empty for permanent)</Label>
          <Input
            id="ban-duration"
            type="number"
            placeholder="e.g. 24, 48, 168"
            min={0}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={banMutation.isPending}
          />
        </div>
      </div>
    </ConfirmationDialog>
  );
}

interface UserResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function UserResetDialog({ open, onOpenChange, userId, onSuccess }: UserResetDialogProps) {
  const [resetAvatar, setResetAvatar] = useState(false);
  const [resetBio, setResetBio] = useState(false);
  const [resetName, setResetName] = useState(false);
  useEffect(() => {
    if (open) {
      setResetAvatar(false);
      setResetBio(false);
      setResetName(false);
    }
  }, [open]);
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: { reset_avatar?: boolean; reset_bio?: boolean; reset_name?: boolean };
    }) => adminService.resetUserInfo(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-members-infinite"] });
      toast.success("User info reset successfully");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: () => toast.error("Failed to reset user info"),
  });

  const handleSubmit = () => {
    if (userId && (resetAvatar || resetBio || resetName)) {
      resetMutation.mutate({
        userId: userId,
        data: {
          reset_avatar: resetAvatar,
          reset_bio: resetBio,
          reset_name: resetName,
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !resetMutation.isPending && onOpenChange(val)}>
      <DialogContent
        onInteractOutside={(e) => resetMutation.isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => resetMutation.isPending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Reset User Info</DialogTitle>
          <DialogDescription>Select which information to reset to defaults.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={resetAvatar}
              onChange={(e) => setResetAvatar(e.target.checked)}
              className="rounded"
              disabled={resetMutation.isPending}
            />
            <span>Reset Avatar</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={resetName}
              onChange={(e) => setResetName(e.target.checked)}
              className="rounded"
              disabled={resetMutation.isPending}
            />
            <span>Reset Name</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={resetBio}
              onChange={(e) => setResetBio(e.target.checked)}
              className="rounded"
              disabled={resetMutation.isPending}
            />
            <span>Reset Bio</span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resetMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={(!resetAvatar && !resetBio && !resetName) || resetMutation.isPending}
            className="relative"
          >
            <span className={resetMutation.isPending ? "opacity-0" : ""}>Reset Info</span>
            {resetMutation.isPending && (
              <div className="absolute inset-0 flex items-center justify-center">
                <UiSpinner className="size-4 text-primary-foreground" />
              </div>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UserUnbanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function UserUnbanDialog({ open, onOpenChange, userId, onSuccess }: UserUnbanDialogProps) {
  const queryClient = useQueryClient();

  const unbanMutation = useMutation({
    mutationFn: adminService.unbanUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-members-infinite"] });

      toast.success("User unbanned successfully");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: () => toast.error("Failed to unban user"),
  });

  const handleSubmit = () => {
    if (userId) {
      unbanMutation.mutate(userId);
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Unban User"
      description="Are you sure you want to unban this user? They will regain access to the platform immediately."
      confirmText="Unban User"
      variant="destructive"
      onConfirm={handleSubmit}
      isLoading={unbanMutation.isPending}
    />
  );
}

interface UserDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  user?: AdminUserDetailResponse;
}

export function UserDetailDialog({
  open,
  onOpenChange,
  userId,
  user: initialUser,
}: UserDetailDialogProps) {
  const { data: userDetail, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => adminService.getUser(userId!),
    enabled: !!userId && open,
    initialData: initialUser,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>User Detail</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : userDetail ? (
          <UserDetailContent user={userDetail} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
