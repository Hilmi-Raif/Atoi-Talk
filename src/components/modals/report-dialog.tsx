import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useReport } from "@/hooks/mutations/use-report";
import { CreateReportRequest, ReportTargetType } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const reportReasons = {
  message: ["Spam", "Harassment", "Hate Speech", "Inappropriate Content", "Other"],
  group: ["Illegal Content", "Harassment", "Spam", "Inappropriate Content", "Other"],
  user: ["Fake Account", "Harassment", "Spam", "Inappropriate Behavior", "Other"],
};

const formSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  description: z.string().optional(),
});

interface ReportDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
}

export function ReportDialog({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportDialogProps) {
  const { mutate: report, isPending } = useReport();
  const [customReason, setCustomReason] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
      description: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      setCustomReason("");
    }
  }, [isOpen, form]);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    const payload: CreateReportRequest = {
      target_type: targetType,
      reason: values.reason === "Other" ? customReason : values.reason,
      description: values.description,
    };

    if (targetType === "message") payload.message_id = targetId;
    if (targetType === "group") payload.chat_id = targetId;
    if (targetType === "user") payload.target_user_id = targetId;

    report(payload, {
      onSuccess: () => {
        onClose(false);
      },
    });
  };

  const reasons = reportReasons[targetType];
  const selectedReason = form.watch("reason");

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isPending && onClose(val)}>
      <DialogContent
        size="sm"
        onInteractOutside={(e) => isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            Report {targetType === "user" ? "User" : targetType === "group" ? "Group" : "Message"}
          </DialogTitle>
          <DialogDescription>
            {targetName
              ? `Why are you reporting "${targetName}"?`
              : "Please select a reason for reporting."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                      disabled={isPending}
                    >
                      {reasons.map((reason) => {
                        const id = `report-reason-${reason.replace(/\s+/g, "-").toLowerCase()}`;
                        return (
                          <FormItem key={reason} className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value={reason} id={id} />
                            </FormControl>
                            <Label
                              htmlFor={id}
                              className="font-normal cursor-pointer text-sm w-full"
                            >
                              {reason}
                            </Label>
                          </FormItem>
                        );
                      })}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedReason === "Other" && (
              <div className="space-y-2">
                <Label htmlFor="custom-reason">Specify Reason</Label>
                <Input
                  id="custom-reason"
                  placeholder="Enter detailed reason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  required
                  disabled={isPending}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional details..."
                      className="resize-none"
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                className="w-full relative"
                disabled={isPending || (selectedReason === "Other" && !customReason)}
              >
                <span className={isPending ? "opacity-0" : ""}>Submit Report</span>
                {isPending && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner className="size-4" />
                  </div>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
