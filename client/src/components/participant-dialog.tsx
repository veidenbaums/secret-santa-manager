import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Participant } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Legal name is required"),
  email: z.string().email("Please enter a valid email"),
  slackUserId: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  city: z.string().min(1, "City is required"),
  zip: z.string().min(1, "ZIP/Postal code is required"),
  street: z.string().min(1, "Street address is required"),
  phone: z.string().min(1, "Phone with international prefix is required"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant?: Participant | null;
}

export function ParticipantDialog({ open, onOpenChange, participant }: ParticipantDialogProps) {
  const { toast } = useToast();
  const isEditing = !!participant;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      slackUserId: "",
      country: "",
      city: "",
      zip: "",
      street: "",
      phone: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (participant) {
        form.reset({
          name: participant.name,
          email: participant.email,
          slackUserId: participant.slackUserId || "",
          country: participant.country || "",
          city: participant.city || "",
          zip: participant.zip || "",
          street: participant.street || "",
          phone: participant.phone || "",
          notes: participant.notes || "",
        });
      } else {
        form.reset({
          name: "",
          email: "",
          slackUserId: "",
          country: "",
          city: "",
          zip: "",
          street: "",
          phone: "",
          notes: "",
        });
      }
    }
  }, [open, participant, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        address: `${data.street}, ${data.city}, ${data.zip}, ${data.country}`,
      };
      await apiRequest("POST", "/api/participants", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      toast({ title: "Participant added", description: "The participant has been added successfully." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add participant.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        address: `${data.street}, ${data.city}, ${data.zip}, ${data.country}`,
      };
      await apiRequest("PATCH", `/api/participants/${participant!.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participants"] });
      toast({ title: "Participant updated", description: "The participant has been updated successfully." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update participant.", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">{isEditing ? "Edit Participant" : "Add Participant"}</DialogTitle>
          <DialogDescription data-testid="text-dialog-description">
            {isEditing
              ? "Update the participant's details below."
              : "Enter the details for the new participant."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Legal Name (as it appears on postal packages)</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@company.com" {...field} data-testid="input-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slackUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slack User ID (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="U01234567" {...field} data-testid="input-slack-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Delivery Address</p>
              
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Latvia" {...field} data-testid="input-country" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="Riga" {...field} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP/Postal Code</FormLabel>
                        <FormControl>
                          <Input placeholder="LV-1050" {...field} data-testid="input-zip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Brivibas iela 123-45" {...field} data-testid="input-street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (with international prefix)</FormLabel>
                  <FormControl>
                    <Input placeholder="+371 26123456" {...field} data-testid="input-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Delivery instructions, gate code, etc."
                      className="resize-none"
                      rows={2}
                      {...field}
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save">
                {isPending ? "Saving..." : isEditing ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
