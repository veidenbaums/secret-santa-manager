import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Eye, RotateCcw, Loader2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface MessageTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateData {
  template: string;
  isDefault: boolean;
}

const PLACEHOLDERS = [
  { placeholder: "{{giver_name}}", description: "Giver's name" },
  { placeholder: "{{receiver_name}}", description: "Receiver's name" },
  { placeholder: "{{receiver_address}}", description: "Receiver's address" },
];

export function MessageTemplateDialog({ open, onOpenChange }: MessageTemplateDialogProps) {
  const { toast } = useToast();
  const [template, setTemplate] = useState("");
  const [preview, setPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data: templateData, isLoading } = useQuery<TemplateData>({
    queryKey: ["/api/message-template"],
    enabled: open,
  });

  useEffect(() => {
    if (templateData) {
      setTemplate(templateData.template);
    }
  }, [templateData]);

  const saveMutation = useMutation({
    mutationFn: async (newTemplate: string) => {
      await apiRequest("POST", "/api/message-template", { template: newTemplate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-template"] });
      toast({ title: "Template saved", description: "Your message template has been updated." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/message-template/reset");
      return response.json();
    },
    onSuccess: (data) => {
      setTemplate(data.template);
      queryClient.invalidateQueries({ queryKey: ["/api/message-template"] });
      toast({ title: "Template reset", description: "Restored to default template." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset template.", variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (currentTemplate: string) => {
      const response = await apiRequest("POST", "/api/message-template/preview", { template: currentTemplate });
      return response.json();
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setShowPreview(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate preview.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(template);
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  const handlePreview = () => {
    previewMutation.mutate(template);
  };

  const insertPlaceholder = (placeholder: string) => {
    setTemplate((prev) => prev + placeholder);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Message Template
          </DialogTitle>
          <DialogDescription>
            Customize the notification message sent to participants when they receive their Secret Santa assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-48 w-full" data-testid="skeleton-template" />
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Template</label>
                  {!templateData?.isDefault && (
                    <Badge variant="secondary" data-testid="badge-custom-template">Custom</Badge>
                  )}
                </div>
                <Textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="Enter your message template..."
                  className="min-h-[180px] font-mono text-sm"
                  data-testid="textarea-template"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span>Available placeholders (click to insert):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((p) => (
                    <Button
                      key={p.placeholder}
                      variant="outline"
                      size="sm"
                      onClick={() => insertPlaceholder(p.placeholder)}
                      className="font-mono text-xs h-auto py-1"
                      data-testid={`button-placeholder-${p.placeholder.replace(/[{}#/]/g, "")}`}
                    >
                      {p.placeholder}
                    </Button>
                  ))}
                </div>
              </div>

              {showPreview && preview && (
                <div className="space-y-2" data-testid="preview-section">
                  <label className="text-sm font-medium">Preview</label>
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <pre className="whitespace-pre-wrap text-sm font-mono" data-testid="text-preview">
                      {preview}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetMutation.isPending || templateData?.isDefault}
              data-testid="button-reset-template"
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Reset to Default
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              data-testid="button-preview-template"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-1" />
              )}
              Preview
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !template.trim()}
              data-testid="button-save-template"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Template"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
