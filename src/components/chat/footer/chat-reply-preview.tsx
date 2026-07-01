import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EditMessage, Message, User } from "@/types";
import { File as FileIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React from "react";

interface ChatReplyPreviewProps {
  replyTo: Message | null;
  editMessage: EditMessage | null;
  current: User | null;
  finalReplySenderName: string;
  isGlobalUploading?: boolean;
  isSending?: boolean;
  isEditing?: boolean;
  isLoading?: boolean;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatReplyPreview({
  replyTo,
  editMessage,
  current,
  finalReplySenderName,
  isGlobalUploading,
  isSending,
  isEditing,
  isLoading,
  onCancelReply,
  onCancelEdit,
  textareaRef,
}: ChatReplyPreviewProps) {
  return (
    <AnimatePresence>
      {(replyTo || editMessage) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className="flex justify-between items-center w-full gap-2 overflow-hidden"
        >
          <Card className="w-full flex-1 rounded-md gap-1 p-2 shadow-none bg-muted/50 border-l-4 border-l-primary">
            <div className="flex justify-between items-center w-full gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <p className="text-sm font-semibold text-primary shrink-0">
                  {replyTo ? "Replying to" : "Editing Message"}
                </p>
                {replyTo && (
                  <p className="text-sm font-semibold text-primary truncate">
                    {replyTo.sender_id === current?.id ? "You" : finalReplySenderName}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={isGlobalUploading || isSending || isEditing || isLoading}
                className="size-6 hover:bg-background/50 rounded-full"
                onClick={() => {
                  if (replyTo) {
                    onCancelReply();
                  } else if (editMessage) {
                    onCancelEdit();
                    if (textareaRef.current) {
                      textareaRef.current.value = "";
                      textareaRef.current.focus();
                    }
                  }
                }}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex flex-col min-w-0">
              {(() => {
                const content = replyTo?.content ?? editMessage?.content ?? "";

                if (content) {
                  return content
                    .split("\n")
                    .slice(0, 2)
                    .map((line, i) => (
                      <p key={i} className="text-sm text-muted-foreground truncate">
                        {line}
                      </p>
                    ));
                }

                return (
                  <span className="inline-flex items-center gap-1 align-text-bottom text-sm text-muted-foreground">
                    <FileIcon className="size-3.5 shrink-0" /> File
                  </span>
                );
              })()}
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
