import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Participant, Exclusion } from "@shared/schema";

interface ExclusionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: Participant[];
}

type ExclusionWithNames = Exclusion & {
  participantName: string;
  excludedName: string;
};

export function ExclusionDialog({ open, onOpenChange, participants }: ExclusionDialogProps) {
  const { toast } = useToast();
  const [participantId, setParticipantId] = useState("");
  const [excludedId, setExcludedId] = useState("");

  const { data: exclusions = [], isLoading: loadingExclusions, refetch } = useQuery<ExclusionWithNames[]>({
    queryKey: ["/api/exclusions"],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      refetch();
      setParticipantId("");
      setExcludedId("");
    }
  }, [open, refetch]);

  const addExclusionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/exclusions", {
        participantId,
        excludedParticipantId: excludedId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusions"] });
      toast({ title: "Exclusion added", description: "The exclusion rule has been added." });
      setParticipantId("");
      setExcludedId("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add exclusion.", variant: "destructive" });
    },
  });

  const deleteExclusionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/exclusions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusions"] });
      toast({ title: "Exclusion removed", description: "The exclusion rule has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove exclusion.", variant: "destructive" });
    },
  });

  const handleAddExclusion = () => {
    if (!participantId || !excludedId) {
      toast({ title: "Error", description: "Please select both participants.", variant: "destructive" });
      return;
    }
    if (participantId === excludedId) {
      toast({ title: "Error", description: "Cannot exclude a participant from themselves.", variant: "destructive" });
      return;
    }
    addExclusionMutation.mutate();
  };

  const availableExcludedParticipants = participants.filter((p) => p.id !== participantId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-exclusion-dialog-title">
            <UserX className="h-5 w-5" />
            Manage Exclusions
          </DialogTitle>
          <DialogDescription data-testid="text-exclusion-dialog-description">
            Prevent specific people from being paired together (e.g., spouses or direct reports).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new exclusion */}
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="participant-select">Participant</Label>
              <Select value={participantId} onValueChange={setParticipantId}>
                <SelectTrigger id="participant-select" data-testid="select-participant">
                  <SelectValue placeholder="Select participant" />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`option-participant-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excluded-select">Cannot be paired with</Label>
              <Select value={excludedId} onValueChange={setExcludedId} disabled={!participantId}>
                <SelectTrigger id="excluded-select" data-testid="select-excluded">
                  <SelectValue placeholder="Select person to exclude" />
                </SelectTrigger>
                <SelectContent>
                  {availableExcludedParticipants.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`option-excluded-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddExclusion}
              disabled={!participantId || !excludedId || addExclusionMutation.isPending}
              className="w-full"
              data-testid="button-add-exclusion"
            >
              {addExclusionMutation.isPending ? "Adding..." : "Add Exclusion"}
            </Button>
          </div>

          {/* Current exclusions */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Current Exclusions</Label>
            {loadingExclusions ? (
              <div className="space-y-2" data-testid="skeleton-exclusions">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : exclusions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-exclusions">
                No exclusion rules set
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="list-exclusions">
                {exclusions.map((exclusion) => (
                  <div
                    key={exclusion.id}
                    className="flex items-center justify-between p-2 rounded-md border text-sm"
                    data-testid={`exclusion-${exclusion.id}`}
                  >
                    <span data-testid={`text-exclusion-${exclusion.id}`}>
                      <span className="font-medium">{exclusion.participantName}</span>
                      <span className="text-muted-foreground"> cannot be paired with </span>
                      <span className="font-medium">{exclusion.excludedName}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteExclusionMutation.mutate(exclusion.id)}
                      disabled={deleteExclusionMutation.isPending}
                      data-testid={`button-delete-exclusion-${exclusion.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
