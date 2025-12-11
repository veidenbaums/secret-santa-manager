import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageSquare, UserPlus, Check, AlertCircle, Loader2, RefreshCw, Send, Clock, CheckCircle2, XCircle, User, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SlackUser {
  id: string;
  name: string;
  realName: string;
  email?: string;
  isBot: boolean;
  deleted: boolean;
}

interface SlackContact {
  id: string;
  slackUserId: string;
  slackUsername: string;
  displayName: string;
  email: string | null;
  status: string;
  invitedAt: string | null;
  respondedAt: string | null;
}

interface SlackStatus {
  connected: boolean;
  teamName?: string;
  error?: string;
}

interface SlackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  imported: { label: "Not Invited", color: "secondary", icon: Clock },
  invited: { label: "Invited", color: "default", icon: Send },
  in_progress: { label: "In Progress", color: "default", icon: User },
  completed: { label: "Completed", color: "default", icon: CheckCircle2 },
  declined: { label: "Declined", color: "destructive", icon: XCircle },
};

export function SlackDialog({ open, onOpenChange }: SlackDialogProps) {
  const { toast } = useToast();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("import");

  const { data: slackStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery<SlackStatus>({
    queryKey: ["/api/slack/status"],
    enabled: open,
    staleTime: 30000,
  });

  const { data: slackUsers = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery<SlackUser[]>({
    queryKey: ["/api/slack/users"],
    enabled: open && slackStatus?.connected,
  });

  const { data: slackContacts = [], isLoading: loadingContacts, refetch: refetchContacts } = useQuery<SlackContact[]>({
    queryKey: ["/api/slack/contacts"],
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: async (users: SlackUser[]) => {
      const response = await apiRequest("POST", "/api/slack/contacts/import", { users });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/slack/contacts"] });
      
      if (data.imported === 0) {
        toast({
          title: "No users imported",
          description: data.skipped > 0 ? `All ${data.skipped} selected users already imported.` : "No new users to import.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedUsers(new Set());
      let message = `Imported ${data.imported} user${data.imported > 1 ? "s" : ""} as contacts.`;
      if (data.skipped > 0) {
        message += ` ${data.skipped} skipped (already imported).`;
      }
      
      toast({
        title: "Import complete",
        description: message,
      });
      setActiveTab("contacts");
    },
    onError: () => {
      toast({ title: "Import failed", description: "Failed to import users.", variant: "destructive" });
    },
  });

  const sendInvitationsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/slack/invitations/send", {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send invitations");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/slack/contacts"] });
      toast({
        title: "Invitations sent",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to send invitations", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const response = await apiRequest("POST", `/api/slack/invitations/resend/${contactId}`, {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to resend invitation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slack/contacts"] });
      toast({
        title: "Invitation resent",
        description: "A reminder has been sent to the user.",
      });
    },
    onError: () => {
      toast({ title: "Failed to resend", description: "Could not resend invitation.", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const response = await apiRequest("DELETE", `/api/slack/contacts/${contactId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slack/contacts"] });
      toast({
        title: "Contact removed",
        description: "The contact has been removed from the list.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove contact.", variant: "destructive" });
    },
  });

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const selectAll = () => {
    const importedIds = slackContacts.map(c => c.slackUserId);
    const availableUsers = slackUsers.filter(u => !importedIds.includes(u.id));
    
    if (selectedUsers.size === availableUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(availableUsers.map((u) => u.id)));
    }
  };

  const handleImport = () => {
    const usersToImport = slackUsers.filter((u) => selectedUsers.has(u.id));
    importMutation.mutate(usersToImport);
  };

  const handleRefresh = () => {
    refetchStatus();
    if (slackStatus?.connected) {
      refetchUsers();
      refetchContacts();
    }
  };

  const handleSendInvitations = () => {
    sendInvitationsMutation.mutate();
  };

  const importedIds = slackContacts.map(c => c.slackUserId);
  const availableUsers = slackUsers.filter(u => !importedIds.includes(u.id));
  const pendingContacts = slackContacts.filter(c => c.status === "imported");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Slack Import & Invitations
          </DialogTitle>
          <DialogDescription>
            Import users from Slack and send them invitations via bot to collect their details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingStatus ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Checking Slack connection...</span>
            </div>
          ) : slackStatus?.connected ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/10 border border-secondary/20">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-secondary" />
                <span className="text-sm font-medium" data-testid="text-slack-connected">
                  Connected to {slackStatus.teamName || "Slack"}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleRefresh} data-testid="button-refresh-slack">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive" data-testid="text-slack-error">
                    Slack not connected
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {slackStatus?.error || "Please connect your Slack workspace first."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {slackStatus?.connected && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="import" data-testid="tab-import">
                  Import Users ({availableUsers.length})
                </TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-contacts">
                  Contacts ({slackContacts.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="import" className="space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" data-testid="text-users-label">
                    Available Members
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    disabled={loadingUsers || availableUsers.length === 0}
                    data-testid="button-select-all"
                  >
                    {selectedUsers.size === availableUsers.length && availableUsers.length > 0
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </div>

                <ScrollArea className="h-[240px] rounded-lg border">
                  {loadingUsers ? (
                    <div className="p-3 space-y-2" data-testid="skeleton-users">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : availableUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8" data-testid="empty-users">
                      <CheckCircle2 className="h-8 w-8 text-secondary mb-2" />
                      <p className="text-sm text-muted-foreground">All users already imported</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1" data-testid="list-slack-users">
                      {availableUsers.map((user) => (
                        <label
                          key={user.id}
                          className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                          data-testid={`item-user-${user.id}`}
                        >
                          <Checkbox
                            checked={selectedUsers.has(user.id)}
                            onCheckedChange={() => toggleUser(user.id)}
                            data-testid={`checkbox-user-${user.id}`}
                          />
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium shrink-0">
                            {user.realName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-user-name-${user.id}`}>
                              {user.realName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate" data-testid={`text-user-email-${user.id}`}>
                              {user.email || `@${user.name}`}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {selectedUsers.size > 0 && (
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" data-testid="badge-selected-count">
                      {selectedUsers.size} selected
                    </Badge>
                    <Button
                      onClick={handleImport}
                      disabled={importMutation.isPending}
                      size="sm"
                      data-testid="button-import-users"
                    >
                      {importMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Import Selected
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contacts" className="space-y-3 mt-3">
                {pendingContacts.length > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div>
                      <p className="text-sm font-medium">{pendingContacts.length} contacts waiting</p>
                      <p className="text-xs text-muted-foreground">
                        Send invitations to start collecting their details
                      </p>
                    </div>
                    <Button
                      onClick={handleSendInvitations}
                      disabled={sendInvitationsMutation.isPending}
                      size="sm"
                      data-testid="button-send-invitations"
                    >
                      {sendInvitationsMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Invitations
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <ScrollArea className="h-[240px] rounded-lg border">
                  {loadingContacts ? (
                    <div className="p-3 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1 flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-6 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : slackContacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8" data-testid="empty-contacts">
                      <UserPlus className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No contacts imported yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Import users from the Import tab</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1" data-testid="list-contacts">
                      {slackContacts.map((contact) => {
                        const statusConfig = STATUS_CONFIG[contact.status] || STATUS_CONFIG.imported;
                        const StatusIcon = statusConfig.icon;
                        
                        return (
                          <div
                            key={contact.id}
                            className="flex items-center gap-3 p-2 rounded-md hover-elevate"
                            data-testid={`item-contact-${contact.id}`}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium shrink-0">
                              {contact.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {contact.displayName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                @{contact.slackUsername}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge 
                                variant={statusConfig.color as "default" | "secondary" | "destructive"} 
                                className="flex items-center gap-1"
                              >
                                <StatusIcon className="h-3 w-3" />
                                {statusConfig.label}
                              </Badge>
                              {(contact.status === "invited" || contact.status === "in_progress") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => resendInvitationMutation.mutate(contact.id)}
                                  disabled={resendInvitationMutation.isPending}
                                  title="Resend invitation"
                                  data-testid={`button-resend-${contact.id}`}
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteContactMutation.mutate(contact.id)}
                                disabled={deleteContactMutation.isPending}
                                title="Remove contact"
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-${contact.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-slack">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
