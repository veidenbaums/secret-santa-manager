import { Gift, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssignmentWithDetails } from "@shared/schema";

interface RevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: AssignmentWithDetails[];
  isLoading?: boolean;
}

export function RevealDialog({ open, onOpenChange, assignments, isLoading = false }: RevealDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-reveal-dialog-title">
            <Gift className="h-5 w-5 text-primary" />
            All Secret Santa Matches
          </DialogTitle>
          <DialogDescription data-testid="text-reveal-dialog-description">
            Here are all the gift-giving assignments for this year's Secret Santa.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3" data-testid="skeleton-assignments">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-24 flex-1" />
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-24 flex-1" />
              </div>
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-assignments">
            No assignments yet. Run the matching first!
          </div>
        ) : (
          <ScrollArea className="max-h-96 pr-4">
            <div className="space-y-3" data-testid="list-assignments">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate"
                  data-testid={`assignment-${assignment.id}`}
                >
                  {/* Giver */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm shrink-0" data-testid={`avatar-giver-${assignment.id}`}>
                      {assignment.giver.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium truncate" data-testid={`text-giver-${assignment.id}`}>
                      {assignment.giver.name}
                    </span>
                  </div>

                  {/* Arrow */}
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                  {/* Receiver */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10 text-secondary font-medium text-sm shrink-0" data-testid={`avatar-receiver-${assignment.id}`}>
                      {assignment.receiver.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium truncate block" data-testid={`text-receiver-${assignment.id}`}>
                        {assignment.receiver.name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
