import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  MessageSquare, 
  Check, 
  AlertCircle, 
  Loader2, 
  ExternalLink, 
  Copy, 
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  UserCog
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SlackStatus {
  connected: boolean;
  teamName?: string;
  error?: string;
}

interface SlackSettings {
  hasToken: boolean;
  teamName?: string | null;
  teamId?: string | null;
  adminSlackId?: string | null;
  adminDisplayName?: string | null;
}

interface SlackConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REQUIRED_SCOPES = [
  "chat:write",
  "users:read", 
  "users:read.email",
  "im:read",
  "im:write",
  "im:history"
];

export function SlackConnectDialog({ open, onOpenChange }: SlackConnectDialogProps) {
  const { toast } = useToast();
  const [copiedScope, setCopiedScope] = useState<string | null>(null);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [adminSlackId, setAdminSlackId] = useState("");

  const { data: slackStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery<SlackStatus>({
    queryKey: ["/api/slack/status"],
    enabled: open,
    staleTime: 5000,
  });

  const { data: slackSettings, isLoading: loadingSettings, refetch: refetchSettings } = useQuery<SlackSettings>({
    queryKey: ["/api/slack/settings"],
    enabled: open,
  });

  const saveTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/slack/settings", { botToken: token });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save token");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setBotToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/slack/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/slack/settings"] });
      toast({
        title: "Token saved successfully",
        description: `Connected to ${data.teamName || "Slack workspace"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save token",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/slack/settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slack/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/slack/settings"] });
      toast({
        title: "Disconnected",
        description: "Slack has been disconnected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect Slack.",
        variant: "destructive",
      });
    },
  });

  const saveAdminMutation = useMutation({
    mutationFn: async (slackId: string | null) => {
      const response = await apiRequest("PATCH", "/api/slack/settings/admin", { adminSlackId: slackId });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update admin contact");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setAdminSlackId("");
      queryClient.invalidateQueries({ queryKey: ["/api/slack/settings"] });
      if (data.adminSlackId) {
        toast({
          title: "Admin contact updated",
          description: `${data.adminDisplayName} will be shown as the contact person in messages.`,
        });
      } else {
        toast({
          title: "Admin contact removed",
          description: "Messages will show 'the organizer' as the contact.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update admin contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveAdmin = () => {
    if (!adminSlackId.trim()) return;
    saveAdminMutation.mutate(adminSlackId.trim());
  };

  const handleClearAdmin = () => {
    saveAdminMutation.mutate(null);
  };

  const handleSaveToken = () => {
    if (!botToken.trim()) return;
    saveTokenMutation.mutate(botToken.trim());
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScope(text);
    setTimeout(() => setCopiedScope(null), 2000);
  };

  const allScopes = REQUIRED_SCOPES.join(",");
  const isConnected = slackStatus?.connected || slackSettings?.hasToken;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Connect Slack
          </DialogTitle>
          <DialogDescription>
            Set up Slack integration to import users and send Secret Santa invitations via bot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingStatus || loadingSettings ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Checking connection...</span>
            </div>
          ) : isConnected ? (
            <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-secondary" />
                  <span className="font-medium text-secondary" data-testid="text-connected-status">
                    Connected to {slackSettings?.teamName || slackStatus?.teamName || "Slack"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-slack"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Your Slack workspace is connected. You can now import users and the bot will collect participant details via DM.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium" data-testid="text-not-connected">Not Connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Follow the steps below to connect your Slack workspace.
              </p>
            </div>
          )}

          {isConnected && (
            <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Admin Contact Person</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                This person will be mentioned in messages when participants have questions or problems.
              </p>
              
              {slackSettings?.adminSlackId ? (
                <div className="flex items-center justify-between p-2 rounded-md bg-background border">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                      {slackSettings.adminDisplayName?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium" data-testid="text-admin-name">
                        {slackSettings.adminDisplayName}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid="text-admin-id">
                        {slackSettings.adminSlackId}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAdmin}
                    disabled={saveAdminMutation.isPending}
                    data-testid="button-clear-admin"
                  >
                    {saveAdminMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter Slack User ID (e.g., U12345678)"
                      value={adminSlackId}
                      onChange={(e) => setAdminSlackId(e.target.value)}
                      className="flex-1"
                      data-testid="input-admin-slack-id"
                    />
                    <Button
                      onClick={handleSaveAdmin}
                      disabled={!adminSlackId.trim() || saveAdminMutation.isPending}
                      size="sm"
                      data-testid="button-save-admin"
                    >
                      {saveAdminMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find the User ID in Slack: Click on a user's profile → More → Copy member ID
                  </p>
                </div>
              )}
            </div>
          )}

          {!isConnected && (
            <Tabs defaultValue="step1" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="step1" data-testid="tab-step1">1. Create App</TabsTrigger>
                <TabsTrigger value="step2" data-testid="tab-step2">2. Add Scopes</TabsTrigger>
                <TabsTrigger value="step3" data-testid="tab-step3">3. Add Token</TabsTrigger>
              </TabsList>

              <TabsContent value="step1" className="space-y-3 mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Create a Slack App</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to the Slack API portal and create a new app for your workspace.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => window.open("https://api.slack.com/apps", "_blank")}
                    data-testid="button-create-app"
                  >
                    <span>Open Slack API Portal</span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Quick Steps:</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Click "Create New App"</li>
                    <li>Choose "From scratch"</li>
                    <li>Name your app (e.g., "Secret Santa Bot")</li>
                    <li>Select your workspace</li>
                    <li>Enable "Event Subscriptions" (for bot replies)</li>
                  </ol>
                </div>
              </TabsContent>

              <TabsContent value="step2" className="space-y-3 mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Add Bot Scopes</h4>
                  <p className="text-sm text-muted-foreground">
                    In "OAuth & Permissions", add these Bot Token Scopes:
                  </p>
                </div>
                <div className="space-y-2">
                  {REQUIRED_SCOPES.map((scope) => (
                    <div
                      key={scope}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {scope}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {scope === "chat:write" && "Send messages"}
                          {scope === "users:read" && "View users"}
                          {scope === "users:read.email" && "View user emails"}
                          {scope === "im:read" && "View DM channels"}
                          {scope === "im:write" && "Open DM channels"}
                          {scope === "im:history" && "View DM history"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(scope)}
                        data-testid={`button-copy-${scope}`}
                      >
                        {copiedScope === scope ? (
                          <Check className="h-3 w-3 text-secondary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(allScopes)}
                  className="w-full"
                  data-testid="button-copy-all-scopes"
                >
                  {copiedScope === allScopes ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-secondary" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy All Scopes
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  After adding scopes, click "Install to Workspace" to generate your Bot Token.
                </p>
              </TabsContent>

              <TabsContent value="step3" className="space-y-3 mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Enter Your Bot Token</h4>
                  <p className="text-sm text-muted-foreground">
                    Copy the "Bot User OAuth Token" from your Slack app (starts with <code className="text-xs bg-muted px-1 rounded">xoxb-</code>).
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="botToken">Bot Token</Label>
                    <div className="relative">
                      <Input
                        id="botToken"
                        type={showToken ? "text" : "password"}
                        placeholder="xoxb-..."
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        className="pr-10"
                        data-testid="input-bot-token"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowToken(!showToken)}
                        data-testid="button-toggle-token-visibility"
                      >
                        {showToken ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveToken}
                    disabled={!botToken.trim() || saveTokenMutation.isPending}
                    className="w-full"
                    data-testid="button-save-token"
                  >
                    {saveTokenMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying & Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Save & Connect
                      </>
                    )}
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    Your token is securely stored in the database and used to communicate with Slack. You can disconnect at any time.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-connect">
            {isConnected ? "Done" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
