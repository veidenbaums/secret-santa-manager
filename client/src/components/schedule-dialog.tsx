import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calendar, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEvent?: Event | null;
}

export function ScheduleDialog({ open, onOpenChange, currentEvent }: ScheduleDialogProps) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (open && currentEvent?.scheduledDate) {
      const d = new Date(currentEvent.scheduledDate);
      setDate(d.toISOString().split("T")[0]);
      setTime(d.toTimeString().slice(0, 5));
    } else if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split("T")[0]);
      setTime("12:00");
    }
  }, [open, currentEvent]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const scheduledDate = new Date(`${date}T${time}`).toISOString();
      await apiRequest("POST", "/api/events/schedule", {
        name: "Secret Santa " + new Date().getFullYear(),
        scheduledDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/current"] });
      toast({
        title: "Event scheduled!",
        description: `Secret Santa is scheduled for ${new Date(`${date}T${time}`).toLocaleString()}`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule event.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast({ title: "Error", description: "Please select date and time.", variant: "destructive" });
      return;
    }
    scheduleMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Secret Santa</DialogTitle>
          <DialogDescription>
            Choose when to automatically send out the Secret Santa assignments via Slack.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                data-testid="input-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="input-time"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            Notifications will be sent automatically at the scheduled time if matching is complete.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={scheduleMutation.isPending}
              data-testid="button-cancel-schedule"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={scheduleMutation.isPending} data-testid="button-save-schedule">
              {scheduleMutation.isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
