import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Gift, Users, Send, Plus, Pencil, Trash2, MapPin, Sparkles, AlertCircle, MessageSquare, FileText, Settings, UserPlus, RotateCcw, Eye, Package, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ParticipantDialog } from "@/components/participant-dialog";
import { ExclusionDialog } from "@/components/exclusion-dialog";
import { RevealDialog } from "@/components/reveal-dialog";
import { SlackDialog } from "@/components/slack-dialog";
import { SlackConnectDialog } from "@/components/slack-connect-dialog";
import { MessageTemplateDialog } from "@/components/message-template-dialog";
import type { Participant, Event, AssignmentWithDetails } from "@shared/schema";

// Helper to extract phone number from Slack format like "<tel:+37126513112|+371 26513112>"
function formatPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Match Slack tel format: <tel:+123456|+123 456>
  const slackTelMatch = phone.match(/<tel:[^|]+\|([^>]+)>/);
  if (slackTelMatch) {
    return slackTelMatch[1].trim();
  }
  // Also handle format without display text: <tel:+123456>
  const simpleTelMatch = phone.match(/<tel:([^>]+)>/);
  if (simpleTelMatch) {
    return simpleTelMatch[1].trim();
  }
  return phone;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [exclusionDialogOpen, setExclusionDialogOpen] = useState(false);
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackConnectDialogOpen, setSlackConnectDialogOpen] = useState(false);
  const [messageTemplateDialogOpen, setMessageTemplateDialogOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [viewingParticipant, setViewingParticipant] = useState<Participant | null>(null);

  const { data: participants = [], isLoading: loadingParticipants, error: participantsError } = useQuery<Participant[]>({
    queryKey: ["/api/participants"],
  });

  const { data: currentEvent, isLoading: loadingEvent, error: eventError } = useQuery<Event | null>({
    queryKey: ["/api/events/current"],
  });

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery<AssignmentWithDetails[]>({
    queryKey: ["/api/assignments"],
    enabled: !!currentEvent?.matchingComplete,
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/participants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      toast({ title: "Participant removed", description: "The participant has been removed from the list." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove participant.", variant: "destructive" });
    },
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exclusions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/slack/contacts"] });
      toast({ title: "Reset complete", description: "All participants, matches, and contacts have been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset data.", variant: "destructive" });
    },
  });

  const runMatchingMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/events/match");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Matching complete!", description: "Secret Santa pairs have been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Matching failed", description: error.message, variant: "destructive" });
    },
  });

  const sendNotificationsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/events/notify");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/current"] });
      toast({ title: "Notifications sent!", description: "All participants have been notified via Slack." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send notifications", description: error.message, variant: "destructive" });
    },
  });

  const updateGiftStatusMutation = useMutation({
    mutationFn: async ({ assignmentId, giftSent }: { assignmentId: string; giftSent: boolean }) => {
      await apiRequest("PATCH", `/api/assignments/${assignmentId}/gift-status`, { giftSent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Gift status updated", description: "The gift status has been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update gift status.", variant: "destructive" });
    },
  });

  const handleEditParticipant = (participant: Participant) => {
    setEditingParticipant(participant);
    setParticipantDialogOpen(true);
  };

  const handleCloseParticipantDialog = () => {
    setParticipantDialogOpen(false);
    setEditingParticipant(null);
  };

  const getStatusBadge = () => {
    if (!currentEvent) {
      return <Badge variant="secondary" data-testid="badge-status-not-started">Not Started</Badge>;
    }
    if (currentEvent.notificationsSent) {
      return <Badge className="bg-secondary text-secondary-foreground" data-testid="badge-status-complete">Complete</Badge>;
    }
    if (currentEvent.matchingComplete) {
      return <Badge className="bg-chart-3 text-white" data-testid="badge-status-matched">Matched</Badge>;
    }
    return <Badge variant="outline" data-testid="badge-status-draft">Draft</Badge>;
  };

  const hasError = participantsError || eventError;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <div className="relative h-32 sm:h-40 bg-gradient-to-r from-primary/90 via-primary to-secondary/80 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center backdrop-blur-[2px] px-6 py-3 rounded-lg">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight" data-testid="text-page-title">
              Secret Santa Manager
            </h1>
            <p className="text-white/80 mt-1 text-sm sm:text-base" data-testid="text-page-subtitle">
              Organize your gift exchange with ease
            </p>
          </div>
        </div>
        {/* Decorative snowflakes */}
        <Sparkles className="absolute top-4 left-8 h-5 w-5 text-white/30" />
        <Gift className="absolute bottom-4 right-12 h-6 w-6 text-white/25" />
        <Sparkles className="absolute top-6 right-24 h-4 w-4 text-white/20" />
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {hasError && (
          <Alert variant="destructive" className="mb-6" data-testid="alert-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load data. Please refresh the page or try again later.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Participants Management */}
          <Card className="lg:row-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg" data-testid="text-participants-title">Participants</CardTitle>
                  <CardDescription data-testid="text-participants-count">
                    {participants.length} {participants.length === 1 ? "person" : "people"} registered
                  </CardDescription>
                </div>
              </div>
              <Button 
                onClick={() => setParticipantDialogOpen(true)}
                data-testid="button-add-participant"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {loadingParticipants ? (
                <div className="space-y-3" data-testid="skeleton-participants">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state-participants">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Gift className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-1" data-testid="text-empty-title">No participants yet</h3>
                  <p className="text-sm text-muted-foreground mb-4" data-testid="text-empty-description">Add your first participant to get started</p>
                  <Button onClick={() => setParticipantDialogOpen(true)} data-testid="button-add-first-participant">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Participant
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1" data-testid="list-participants">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-start gap-3 p-3 rounded-lg border hover-elevate transition-all"
                      data-testid={`card-participant-${participant.id}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium shrink-0" data-testid={`avatar-${participant.id}`}>
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate" data-testid={`text-name-${participant.id}`}>
                          {participant.name}
                        </p>
                        <div className="flex items-start gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-address-${participant.id}`}>
                            {participant.address}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingParticipant(participant)}
                          data-testid={`button-view-${participant.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditParticipant(participant)}
                          data-testid={`button-edit-${participant.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteParticipantMutation.mutate(participant.id)}
                          disabled={deleteParticipantMutation.isPending}
                          data-testid={`button-delete-${participant.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Secret Santa Control */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-secondary/10">
                  <Gift className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <CardTitle className="text-lg" data-testid="text-control-title">Secret Santa</CardTitle>
                  <CardDescription data-testid="text-control-description">Manage the gift exchange</CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingEvent ? (
                <div className="space-y-3" data-testid="skeleton-event">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-center" data-testid="stat-participants">
                      <p className="text-2xl font-semibold text-foreground" data-testid="text-participant-count">
                        {participants.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Participants</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center" data-testid="stat-assignments">
                      <p className="text-2xl font-semibold text-foreground" data-testid="text-assignment-count">
                        {loadingAssignments ? "..." : assignments.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Assignments</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => runMatchingMutation.mutate()}
                      disabled={participants.length < 3 || runMatchingMutation.isPending || !!currentEvent?.matchingComplete}
                      data-testid="button-run-matching"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {runMatchingMutation.isPending ? "Matching..." : "Run Matching"}
                    </Button>

                    {currentEvent?.matchingComplete && !currentEvent?.notificationsSent && (
                      <Button
                        className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                        onClick={() => sendNotificationsMutation.mutate()}
                        disabled={sendNotificationsMutation.isPending}
                        data-testid="button-send-notifications"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {sendNotificationsMutation.isPending ? "Sending..." : "Send Notifications"}
                      </Button>
                    )}

                    {participants.length < 3 && (
                      <p className="text-xs text-muted-foreground text-center" data-testid="text-min-participants-warning">
                        Add at least 3 participants to run matching
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Additional Actions */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg" data-testid="text-actions-title">Actions</CardTitle>
              <CardDescription data-testid="text-actions-description">Additional options and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setSlackConnectDialogOpen(true)}
                data-testid="button-connect-slack"
              >
                <Settings className="h-4 w-4 mr-2" />
                Connect Slack
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setSlackDialogOpen(true)}
                data-testid="button-slack-import"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Import from Slack
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMessageTemplateDialogOpen(true)}
                data-testid="button-message-template"
              >
                <FileText className="h-4 w-4 mr-2" />
                Message Template
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setExclusionDialogOpen(true)}
                disabled={participants.length < 2}
                data-testid="button-exclusions"
              >
                <Users className="h-4 w-4 mr-2" />
                Manage Exclusions
              </Button>

              {currentEvent?.matchingComplete && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setRevealDialogOpen(true)}
                  data-testid="button-reveal"
                >
                  <Gift className="h-4 w-4 mr-2" />
                  Reveal All Matches
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    data-testid="button-reset-all"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Everything
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Everything?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all participants, matches, exclusions, and imported Slack contacts. The Slack connection settings will remain active. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-reset">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => resetAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-reset"
                    >
                      {resetAllMutation.isPending ? "Resetting..." : "Reset Everything"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Dialogs */}
      <ParticipantDialog
        open={participantDialogOpen}
        onOpenChange={handleCloseParticipantDialog}
        participant={editingParticipant}
      />
      <ExclusionDialog
        open={exclusionDialogOpen}
        onOpenChange={setExclusionDialogOpen}
        participants={participants}
      />
      <RevealDialog
        open={revealDialogOpen}
        onOpenChange={setRevealDialogOpen}
        assignments={assignments}
      />
      <SlackDialog
        open={slackDialogOpen}
        onOpenChange={setSlackDialogOpen}
      />
      <SlackConnectDialog
        open={slackConnectDialogOpen}
        onOpenChange={setSlackConnectDialogOpen}
      />
      <MessageTemplateDialog
        open={messageTemplateDialogOpen}
        onOpenChange={setMessageTemplateDialogOpen}
      />

      {/* Participant View Dialog */}
      <Dialog open={!!viewingParticipant} onOpenChange={(open) => !open && setViewingParticipant(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-view-dialog-title">Participant Details</DialogTitle>
            <DialogDescription data-testid="text-view-dialog-description">
              View all information about this participant
            </DialogDescription>
          </DialogHeader>
          {viewingParticipant && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-lg">
                  {viewingParticipant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-lg" data-testid="text-view-name">{viewingParticipant.name}</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-view-email">{viewingParticipant.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="border-t pt-3">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Delivery Address</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {viewingParticipant.country && (
                      <div>
                        <span className="text-muted-foreground">Country:</span>
                        <p data-testid="text-view-country">{viewingParticipant.country}</p>
                      </div>
                    )}
                    {viewingParticipant.city && (
                      <div>
                        <span className="text-muted-foreground">City:</span>
                        <p data-testid="text-view-city">{viewingParticipant.city}</p>
                      </div>
                    )}
                    {viewingParticipant.zip && (
                      <div>
                        <span className="text-muted-foreground">ZIP:</span>
                        <p data-testid="text-view-zip">{viewingParticipant.zip}</p>
                      </div>
                    )}
                    {viewingParticipant.street && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Street:</span>
                        <p data-testid="text-view-street">{viewingParticipant.street}</p>
                      </div>
                    )}
                  </div>
                  {!viewingParticipant.country && !viewingParticipant.city && viewingParticipant.address && (
                    <p className="text-sm" data-testid="text-view-address">{viewingParticipant.address}</p>
                  )}
                </div>

                {viewingParticipant.phone && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Phone</p>
                    <p className="text-sm" data-testid="text-view-phone">{formatPhoneNumber(viewingParticipant.phone)}</p>
                  </div>
                )}

                {viewingParticipant.notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Delivery Notes</p>
                    <p className="text-sm" data-testid="text-view-notes">{viewingParticipant.notes}</p>
                  </div>
                )}

                {viewingParticipant.slackUserId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Slack ID</p>
                    <p className="text-sm font-mono" data-testid="text-view-slack-id">{viewingParticipant.slackUserId}</p>
                  </div>
                )}
              </div>

              {/* Gift Status Section */}
              {currentEvent?.matchingComplete && (() => {
                const asGiver = assignments.find(a => a.giverId === viewingParticipant.id);
                
                if (!asGiver) return null;
                
                return (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">Gift Status</p>
                      {asGiver.giftSent ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" data-testid="badge-gift-sent">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Sent
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100" data-testid="badge-gift-pending">
                          <Package className="h-3 w-3 mr-1" />
                          Not Sent
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Label htmlFor="gift-sent-toggle" className="text-xs text-muted-foreground">Mark as sent:</Label>
                      <Switch
                        id="gift-sent-toggle"
                        checked={asGiver.giftSent || false}
                        onCheckedChange={(checked) => {
                          updateGiftStatusMutation.mutate({ assignmentId: asGiver.id, giftSent: checked });
                        }}
                        disabled={updateGiftStatusMutation.isPending}
                        data-testid="switch-gift-sent"
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewingParticipant(null)} data-testid="button-close-view">
                  Close
                </Button>
                <Button onClick={() => {
                  handleEditParticipant(viewingParticipant);
                  setViewingParticipant(null);
                }} data-testid="button-edit-from-view">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
