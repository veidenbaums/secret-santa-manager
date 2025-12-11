import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertParticipantSchema, insertExclusionSchema, ONBOARDING_STATES, CONTACT_STATUS } from "@shared/schema";
import { z } from "zod";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, isBefore } from "date-fns";

// Default timezone for users without timezone set
const DEFAULT_TIMEZONE = "Europe/Riga";
const REMINDER_HOUR = 10; // 10:00 AM local time

// Calculate the next 10:00 AM in the user's timezone
function getNext10AMInTimezone(timezone: string | null, fromDate: Date = new Date()): Date {
  const tz = timezone || DEFAULT_TIMEZONE;
  
  try {
    // Convert current time to user's timezone
    const zonedTime = toZonedTime(fromDate, tz);
    
    // Set to 10:00 AM
    let target = setMilliseconds(setSeconds(setMinutes(setHours(zonedTime, REMINDER_HOUR), 0), 0), 0);
    
    // If 10:00 AM has already passed today, move to next day
    if (isBefore(target, zonedTime)) {
      target = addDays(target, 1);
    }
    
    // Convert back to UTC
    return fromZonedTime(target, tz);
  } catch (error) {
    console.error(`Invalid timezone "${tz}", using default:`, error);
    // Fallback: just add 1 day from now
    return addDays(fromDate, 1);
  }
}

// Calculate the first reminder date (7 days after notification, at 10:00 AM local time)
function getFirstReminderDate(timezone: string | null, notificationDate: Date): Date {
  const tz = timezone || DEFAULT_TIMEZONE;
  
  try {
    // Add 7 days to notification date
    const sevenDaysLater = addDays(notificationDate, 7);
    
    // Convert to user's timezone
    const zonedTime = toZonedTime(sevenDaysLater, tz);
    
    // Set to 10:00 AM
    const target = setMilliseconds(setSeconds(setMinutes(setHours(zonedTime, REMINDER_HOUR), 0), 0), 0);
    
    // Convert back to UTC
    return fromZonedTime(target, tz);
  } catch (error) {
    console.error(`Invalid timezone "${tz}", using default:`, error);
    return addDays(notificationDate, 7);
  }
}

// Helper to get Slack token - first from DB, then from env
async function getSlackToken(): Promise<string | null> {
  const settings = await storage.getSlackSettings();
  if (settings?.botToken) {
    return settings.botToken;
  }
  return process.env.SLACK_BOT_TOKEN || null;
}

// Secret Santa matching algorithm with proper randomization
function generateMatching(
  participantIds: string[],
  exclusionPairs: Array<{ participantId: string; excludedParticipantId: string }>
): Array<{ giverId: string; receiverId: string }> | null {
  const n = participantIds.length;
  if (n < 2) return null;

  // Build exclusion set for quick lookup
  const exclusionSet = new Set<string>();
  for (const pair of exclusionPairs) {
    exclusionSet.add(`${pair.participantId}-${pair.excludedParticipantId}`);
  }

  // Helper to check if assignment is valid
  const isValidAssignment = (giverId: string, receiverId: string): boolean => {
    if (giverId === receiverId) return false;
    if (exclusionSet.has(`${giverId}-${receiverId}`)) return false;
    return true;
  };

  // Fisher-Yates shuffle
  const shuffle = <T>(array: T[]): T[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // Try to find a valid assignment using backtracking
  const findAssignment = (
    givers: string[],
    receivers: string[],
    current: Array<{ giverId: string; receiverId: string }>
  ): Array<{ giverId: string; receiverId: string }> | null => {
    if (givers.length === 0) return current;

    const giver = givers[0];
    const remainingGivers = givers.slice(1);

    // Shuffle receivers for randomization
    const shuffledReceivers = shuffle(receivers);

    for (const receiver of shuffledReceivers) {
      if (isValidAssignment(giver, receiver)) {
        const remainingReceivers = receivers.filter((r) => r !== receiver);
        const result = findAssignment(remainingGivers, remainingReceivers, [
          ...current,
          { giverId: giver, receiverId: receiver },
        ]);
        if (result) return result;
      }
    }

    return null;
  };

  // Try multiple times with different initial shuffles
  for (let attempt = 0; attempt < 100; attempt++) {
    const shuffledGivers = shuffle(participantIds);
    const shuffledReceivers = shuffle(participantIds);
    const result = findAssignment(shuffledGivers, shuffledReceivers, []);
    if (result) return result;
  }

  return null;
}

// Default message template - uses {{admin_contact}} placeholder for admin mention
const DEFAULT_MESSAGE_TEMPLATE = `Hi {{giver_name}}! 🎅

*Welcome to Secret Santa!*

Here's how it works: You've been randomly assigned someone to buy a gift for. Your identity stays secret until the gift exchange - that's what makes it fun! Choose a thoughtful gift based on the details below.

*Your assignment:*
You're the Secret Santa for: *{{receiver_name}}*

📍 *Delivery Address:*
• Name: {{receiver_name}}
• Street: {{receiver_street}}
• City: {{receiver_city}}
• ZIP: {{receiver_zip}}
• Country: {{receiver_country}}
• Phone: {{receiver_phone}}
{{#if receiver_notes}}
📝 *Delivery Notes:* {{receiver_notes}}
{{/if}}

🔍 *Hint:* Try searching for "secret santa" in Slack to find some hints about what your recipient might like!

💰 *Budget:* The company will compensate up to *50 EUR* for your gift. If you'd like to go above this budget, you're welcome to do so!

⏰ *Deadline:* Please send your gift within *1 week* of receiving this message.

🌍 *Tip:* Try to order from a store in the recipient's country/region to avoid unexpected customs fees for them.

📸 *Need inspiration?* Check out photos from last year's gifts: https://photos.app.goo.gl/HtxkXTTSAibtxvNYA

If you have any questions or problems, please contact {{admin_contact}}.

Happy gifting! 🎁`;

// Get admin contact mention string from settings
async function getAdminContactMention(): Promise<string> {
  const settings = await storage.getSlackSettings();
  if (settings?.adminSlackId) {
    return `<@${settings.adminSlackId}>`;
  }
  return "the organizer";
}

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

// Receiver address details interface
interface ReceiverDetails {
  name: string;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  wishlist: string | null;
}

// Build message from template
function buildMessage(
  template: string,
  giverName: string,
  receiver: ReceiverDetails,
  adminContactMention: string = "the organizer"
): string {
  // Clean up phone number from Slack format
  const cleanPhone = formatPhoneNumber(receiver.phone) || "Not provided";
  
  let message = template
    .replace(/\{\{giver_name\}\}/g, giverName)
    .replace(/\{\{receiver_name\}\}/g, receiver.name)
    .replace(/\{\{receiver_street\}\}/g, receiver.street || "Not provided")
    .replace(/\{\{receiver_city\}\}/g, receiver.city || "Not provided")
    .replace(/\{\{receiver_zip\}\}/g, receiver.zip || "Not provided")
    .replace(/\{\{receiver_country\}\}/g, receiver.country || "Not provided")
    .replace(/\{\{receiver_phone\}\}/g, cleanPhone)
    .replace(/\{\{receiver_address\}\}/g, [receiver.street, receiver.city, receiver.zip, receiver.country].filter(Boolean).join(", ") || "Not provided")
    .replace(/\{\{admin_contact\}\}/g, adminContactMention);
  
  // Handle conditional notes
  if (receiver.notes) {
    message = message
      .replace(/\{\{#if receiver_notes\}\}/g, "")
      .replace(/\{\{receiver_notes\}\}/g, receiver.notes);
  } else {
    message = message.replace(/\{\{#if receiver_notes\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  }
  
  // Handle conditional wishlist
  if (receiver.wishlist) {
    message = message
      .replace(/\{\{#if receiver_wishlist\}\}/g, "")
      .replace(/\{\{\/if\}\}/g, "")
      .replace(/\{\{receiver_wishlist\}\}/g, receiver.wishlist);
  } else {
    // Remove the entire conditional block
    message = message.replace(/\{\{#if receiver_wishlist\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  }
  
  // Normalize multiple blank lines but preserve intentional formatting
  return message.replace(/\n{3,}/g, "\n\n");
}

// Slack notification sender with custom template
async function sendSlackNotification(
  slackUserId: string | null,
  email: string,
  giverName: string,
  receiver: ReceiverDetails,
  messageTemplate?: string | null
): Promise<boolean> {
  const slackToken = await getSlackToken();
  if (!slackToken) {
    console.log("Slack bot token not configured, skipping notification");
    return false;
  }

  try {
    let userId = slackUserId;

    // If no Slack user ID, try to find user by email
    if (!userId && email) {
      const lookupResponse = await fetch("https://slack.com/api/users.lookupByEmail", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `email=${encodeURIComponent(email)}`,
      });
      const lookupData = await lookupResponse.json() as { ok: boolean; user?: { id: string } };
      if (lookupData.ok && lookupData.user) {
        userId = lookupData.user.id;
      }
    }

    if (!userId) {
      console.log(`Could not find Slack user for ${email}`);
      return false;
    }

    // Get admin contact for message
    const adminContactMention = await getAdminContactMention();

    // Build message from template
    const message = buildMessage(
      messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
      giverName,
      receiver,
      adminContactMention
    );

    // Send DM
    const dmResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: userId,
        text: message,
      }),
    });

    const dmData = await dmResponse.json() as { ok: boolean };
    return dmData.ok === true;
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    return false;
  }
}

// Fetch Slack users with cursor-based pagination
async function fetchSlackUsers(): Promise<{
  ok: boolean;
  users?: Array<{
    id: string;
    name: string;
    realName: string;
    email?: string;
    isBot: boolean;
    deleted: boolean;
    timezone?: string;
    timezoneOffset?: number;
  }>;
  error?: string;
}> {
  const slackToken = await getSlackToken();
  if (!slackToken) {
    return { ok: false, error: "Slack bot token not configured" };
  }

  try {
    const allUsers: Array<{
      id: string;
      name: string;
      realName: string;
      email?: string;
      isBot: boolean;
      deleted: boolean;
      timezone?: string;
      timezoneOffset?: number;
    }> = [];
    
    let cursor: string | undefined;
    let hasMore = true;
    
    while (hasMore) {
      const url = cursor 
        ? `https://slack.com/api/users.list?limit=200&cursor=${encodeURIComponent(cursor)}`
        : "https://slack.com/api/users.list?limit=200";
        
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
        },
      });

      const data = await response.json() as {
        ok: boolean;
        error?: string;
        members?: Array<{
          id: string;
          name: string;
          real_name?: string;
          tz?: string;
          tz_offset?: number;
          profile?: {
            email?: string;
            real_name?: string;
          };
          is_bot?: boolean;
          deleted?: boolean;
        }>;
        response_metadata?: {
          next_cursor?: string;
        };
      };

      if (!data.ok) {
        return { ok: false, error: data.error || "Failed to fetch users" };
      }

      const pageUsers = (data.members || [])
        .filter((m) => !m.is_bot && !m.deleted && m.id !== "USLACKBOT" && m.profile?.email)
        .map((m) => ({
          id: m.id,
          name: m.name,
          realName: m.real_name || m.profile?.real_name || m.name,
          email: m.profile?.email,
          isBot: m.is_bot || false,
          deleted: m.deleted || false,
          timezone: m.tz,
          timezoneOffset: m.tz_offset,
        }));
      
      allUsers.push(...pageUsers);
      
      cursor = data.response_metadata?.next_cursor;
      hasMore = !!cursor && cursor.length > 0;
    }

    return { ok: true, users: allUsers };
  } catch (error) {
    console.error("Error fetching Slack users:", error);
    return { ok: false, error: "Failed to connect to Slack" };
  }
}

// Check and process scheduled events
async function checkScheduledEvents(): Promise<void> {
  try {
    const event = await storage.getCurrentEvent();
    if (!event) return;

    // Check if event is scheduled and time has passed
    if (
      event.scheduledDate &&
      event.matchingComplete &&
      !event.notificationsSent &&
      new Date(event.scheduledDate) <= new Date()
    ) {
      console.log("Processing scheduled Secret Santa event:", event.name);
      await sendAllNotifications(event.id);
    }
  } catch (error) {
    console.error("Error checking scheduled events:", error);
  }
}

// Send gift reminders to givers who haven't sent their gift yet
// Reminders are sent at 10:00 AM in the user's local timezone
async function sendGiftReminders(): Promise<{ sent: number; failed: number; skipped: number }> {
  const slackToken = await getSlackToken();
  if (!slackToken) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const assignmentsNeedingReminder = await storage.getAssignmentsNeedingReminder();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date();

  for (const assignment of assignmentsNeedingReminder) {
    if (!assignment.notifiedAt || !assignment.giver.slackUserId) {
      skipped++;
      continue;
    }

    // Check if it's time to send a reminder based on nextReminderAt
    let nextReminderAt = assignment.nextReminderAt ? new Date(assignment.nextReminderAt) : null;
    
    // If no nextReminderAt is set, always schedule it first (never send immediately)
    if (!nextReminderAt) {
      const notifiedAt = new Date(assignment.notifiedAt);
      const firstReminderDate = getFirstReminderDate(assignment.giver.timezone, notifiedAt);
      
      // If first reminder date is in the past, schedule for next 10:00 AM instead
      if (isBefore(firstReminderDate, now)) {
        nextReminderAt = getNext10AMInTimezone(assignment.giver.timezone, now);
      } else {
        nextReminderAt = firstReminderDate;
      }
      
      // Always save and skip on first encounter - will be checked next cycle
      await storage.updateAssignmentNextReminder(assignment.id, nextReminderAt);
      console.log(`Scheduled first reminder for ${assignment.giver.name} at ${nextReminderAt.toISOString()}`);
      skipped++;
      continue;
    }
    
    // Not time yet for this reminder
    if (isBefore(now, nextReminderAt)) {
      skipped++;
      continue;
    }

    const isFirstReminder = !assignment.lastReminderAt;

    try {
      const reminderMessage = isFirstReminder
        ? `Hi ${assignment.giver.name}!\n\nJust a friendly reminder - it's been a week since you received your Secret Santa assignment.\n\nHave you sent your gift to *${assignment.receiver.name}* yet?\n\nPlease reply with:\n• *yes* - if you've already sent it\n• *no* - if you still need to send it\n\nRemember, gifts should be sent within 1 week of receiving your assignment!`
        : `Hi ${assignment.giver.name}!\n\nDaily reminder: Your Secret Santa gift should have been sent by now.\n\nHave you sent your gift to *${assignment.receiver.name}* yet?\n\nPlease reply:\n• *yes* - if sent\n• *no* - if not yet\n\nLet's spread some holiday cheer!`;

      const dmResponse = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: assignment.giver.slackUserId,
          text: reminderMessage,
        }),
      });

      const dmData = await dmResponse.json() as { ok: boolean };

      if (dmData.ok) {
        // Calculate next reminder for tomorrow at 10:00 AM user's local time
        const nextReminder = getNext10AMInTimezone(assignment.giver.timezone, now);
        await storage.updateAssignmentReminderSent(assignment.id, nextReminder);
        sent++;
      } else {
        failed++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error sending reminder to ${assignment.giver.name}:`, error);
      failed++;
    }
  }

  console.log(`Gift reminders sent: ${sent}, failed: ${failed}, skipped: ${skipped}`);
  return { sent, failed, skipped };
}

// Check and send gift reminders
async function checkGiftReminders(): Promise<void> {
  try {
    await sendGiftReminders();
  } catch (error) {
    console.error("Error checking gift reminders:", error);
  }
}

// Send notifications for an event
async function sendAllNotifications(eventId: string, messageTemplate?: string | null): Promise<{ sent: number; failed: number }> {
  const assignmentsData = await storage.getAssignments(eventId);
  const event = await storage.getCurrentEvent();
  const template = messageTemplate || event?.messageTemplate;
  
  let successCount = 0;
  let failCount = 0;

  for (const assignment of assignmentsData) {
    if (assignment.notified) continue;

    const receiverDetails: ReceiverDetails = {
      name: assignment.receiver.name,
      street: assignment.receiver.street,
      city: assignment.receiver.city,
      zip: assignment.receiver.zip,
      country: assignment.receiver.country,
      phone: assignment.receiver.phone,
      notes: assignment.receiver.notes,
      wishlist: assignment.receiver.wishlist,
    };
    
    const success = await sendSlackNotification(
      assignment.giver.slackUserId,
      assignment.giver.email,
      assignment.giver.name,
      receiverDetails,
      template
    );

    if (success) {
      await storage.updateAssignmentNotified(assignment.id);
      successCount++;
    } else {
      failCount++;
    }

    // Add small delay between messages to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (successCount > 0 || failCount === 0) {
    if (event) {
      await storage.updateEvent(event.id, { notificationsSent: true, status: "complete" });
    }
  }

  return { sent: successCount, failed: failCount };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Start scheduler - check every minute for scheduled events
  setInterval(checkScheduledEvents, 60000);
  // Check gift reminders every 15 minutes (more responsive while still efficient)
  setInterval(checkGiftReminders, 15 * 60 * 1000);
  // Also check immediately on startup
  setTimeout(checkScheduledEvents, 5000);
  setTimeout(checkGiftReminders, 10000);

  // Participants CRUD
  app.get("/api/participants", async (req, res) => {
    try {
      const participants = await storage.getParticipants();
      res.json(participants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  app.post("/api/participants", async (req, res) => {
    try {
      const data = insertParticipantSchema.parse(req.body);
      const participant = await storage.createParticipant(data);
      res.json(participant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("Error creating participant:", error);
        res.status(500).json({ error: "Failed to create participant" });
      }
    }
  });

  app.patch("/api/participants/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertParticipantSchema.partial().parse(req.body);
      const participant = await storage.updateParticipant(id, data);
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      res.json(participant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("Error updating participant:", error);
        res.status(500).json({ error: "Failed to update participant" });
      }
    }
  });

  app.delete("/api/participants/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteParticipant(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting participant:", error);
      res.status(500).json({ error: "Failed to delete participant" });
    }
  });

  // Reset all data (keeps Slack connection settings)
  app.post("/api/reset", async (req, res) => {
    try {
      await storage.resetAll();
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting data:", error);
      res.status(500).json({ error: "Failed to reset data" });
    }
  });

  // Events
  app.get("/api/events/current", async (req, res) => {
    try {
      const event = await storage.getCurrentEvent();
      res.json(event || null);
    } catch (error) {
      console.error("Error fetching current event:", error);
      res.status(500).json({ error: "Failed to fetch current event" });
    }
  });

  app.post("/api/events/schedule", async (req, res) => {
    try {
      const { name, scheduledDate } = req.body;
      const event = await storage.createEvent({
        name,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        status: "scheduled",
      });
      res.json(event);
    } catch (error) {
      console.error("Error scheduling event:", error);
      res.status(500).json({ error: "Failed to schedule event" });
    }
  });

  app.post("/api/events/match", async (req, res) => {
    try {
      // Get or create event
      let event = await storage.getCurrentEvent();
      if (!event) {
        event = await storage.createEvent({
          name: `Secret Santa ${new Date().getFullYear()}`,
          status: "draft",
          scheduledDate: null,
        });
      }

      // Get participants and exclusions
      const participants = await storage.getParticipants();
      if (participants.length < 3) {
        return res.status(400).json({ error: "Need at least 3 participants for Secret Santa" });
      }

      const exclusionPairs = await storage.getExclusionPairs();
      const participantIds = participants.map((p) => p.id);

      // Generate matching
      const matching = generateMatching(participantIds, exclusionPairs);
      if (!matching) {
        return res.status(400).json({ 
          error: "Could not find a valid matching with the current exclusion rules. Try removing some exclusions." 
        });
      }

      // Clear existing assignments and create new ones
      await storage.clearAssignments(event.id);
      for (const pair of matching) {
        await storage.createAssignment({
          eventId: event.id,
          giverId: pair.giverId,
          receiverId: pair.receiverId,
        });
      }

      // Update event status
      await storage.updateEvent(event.id, { matchingComplete: true, status: "matched" });

      res.json({ success: true, matchCount: matching.length });
    } catch (error) {
      console.error("Matching error:", error);
      res.status(500).json({ error: "Failed to run matching" });
    }
  });

  app.post("/api/events/notify", async (req, res) => {
    try {
      const event = await storage.getCurrentEvent();
      if (!event || !event.matchingComplete) {
        return res.status(400).json({ error: "No completed matching to notify" });
      }

      const result = await sendAllNotifications(event.id);

      res.json({ 
        success: true, 
        sent: result.sent, 
        failed: result.failed,
        message: result.failed > 0 
          ? `Sent ${result.sent} notifications. ${result.failed} failed (check Slack token or user emails).`
          : `All ${result.sent} notifications sent successfully!`
      });
    } catch (error) {
      console.error("Notification error:", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  // Assignments
  app.get("/api/assignments", async (req, res) => {
    try {
      const event = await storage.getCurrentEvent();
      if (!event) {
        return res.json([]);
      }
      const assignmentsData = await storage.getAssignments(event.id);
      res.json(assignmentsData);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Exclusions
  app.get("/api/exclusions", async (req, res) => {
    try {
      const exclusionsData = await storage.getExclusions();
      res.json(exclusionsData);
    } catch (error) {
      console.error("Error fetching exclusions:", error);
      res.status(500).json({ error: "Failed to fetch exclusions" });
    }
  });

  app.post("/api/exclusions", async (req, res) => {
    try {
      const data = insertExclusionSchema.parse(req.body);
      const exclusion = await storage.createExclusion(data);
      res.json(exclusion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("Error creating exclusion:", error);
        res.status(500).json({ error: "Failed to create exclusion" });
      }
    }
  });

  app.delete("/api/exclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteExclusion(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting exclusion:", error);
      res.status(500).json({ error: "Failed to delete exclusion" });
    }
  });

  // Slack integration
  app.get("/api/slack/status", async (req, res) => {
    const slackToken = await getSlackToken();
    if (!slackToken) {
      return res.json({ connected: false, error: "Slack bot token not configured" });
    }

    try {
      const response = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
        },
      });

      const data = await response.json() as { ok: boolean; team?: string; error?: string };
      
      if (data.ok) {
        res.json({ connected: true, teamName: data.team });
      } else {
        res.json({ connected: false, error: data.error || "Invalid token" });
      }
    } catch (error) {
      console.error("Error checking Slack status:", error);
      res.json({ connected: false, error: "Failed to connect to Slack" });
    }
  });

  app.get("/api/slack/users", async (req, res) => {
    try {
      const result = await fetchSlackUsers();
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.users);
    } catch (error) {
      console.error("Error fetching Slack users:", error);
      res.status(500).json({ error: "Failed to fetch Slack users" });
    }
  });

  app.post("/api/slack/import", async (req, res) => {
    try {
      const { users } = req.body as {
        users: Array<{
          id: string;
          name: string;
          realName: string;
          email?: string;
          address?: string;
        }>;
      };

      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: "No users provided" });
      }

      const imported: string[] = [];
      const skipped: string[] = [];
      const noEmail: string[] = [];

      for (const user of users) {
        // Validate email - skip users without valid email
        if (!user.email || !user.email.includes("@")) {
          noEmail.push(user.realName);
          continue;
        }

        // Check if user already exists by Slack ID or email
        const existingParticipants = await storage.getParticipants();
        const exists = existingParticipants.some(
          (p) => p.slackUserId === user.id || p.email === user.email
        );

        if (exists) {
          skipped.push(user.realName);
          continue;
        }

        await storage.createParticipant({
          name: user.realName,
          email: user.email,
          slackUserId: user.id,
          address: user.address || "Address not provided",
          wishlist: null,
        });

        imported.push(user.realName);
      }

      res.json({
        success: true,
        imported: imported.length,
        skipped: skipped.length,
        noEmail: noEmail.length,
        importedNames: imported,
        skippedNames: skipped,
        noEmailNames: noEmail,
      });
    } catch (error) {
      console.error("Error importing Slack users:", error);
      res.status(500).json({ error: "Failed to import users" });
    }
  });

  // Message template
  app.get("/api/message-template", async (req, res) => {
    try {
      const event = await storage.getCurrentEvent();
      res.json({
        template: event?.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
        isDefault: !event?.messageTemplate,
      });
    } catch (error) {
      console.error("Error fetching message template:", error);
      res.status(500).json({ error: "Failed to fetch message template" });
    }
  });

  app.post("/api/message-template", async (req, res) => {
    try {
      const { template } = req.body as { template: string };

      // Get or create event
      let event = await storage.getCurrentEvent();
      if (!event) {
        event = await storage.createEvent({
          name: `Secret Santa ${new Date().getFullYear()}`,
          status: "draft",
          scheduledDate: null,
          messageTemplate: template,
        });
      } else {
        await storage.updateEvent(event.id, { messageTemplate: template });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving message template:", error);
      res.status(500).json({ error: "Failed to save message template" });
    }
  });

  app.post("/api/message-template/reset", async (req, res) => {
    try {
      const event = await storage.getCurrentEvent();
      if (event) {
        await storage.updateEvent(event.id, { messageTemplate: null });
      }
      res.json({ success: true, template: DEFAULT_MESSAGE_TEMPLATE });
    } catch (error) {
      console.error("Error resetting message template:", error);
      res.status(500).json({ error: "Failed to reset message template" });
    }
  });

  app.post("/api/message-template/preview", async (req, res) => {
    try {
      const { template } = req.body as { template: string };
      const adminContactMention = await getAdminContactMention();
      
      const sampleReceiver: ReceiverDetails = {
        name: "Recipient Name",
        street: "123 Example Street",
        city: "Helsinki",
        zip: "00100",
        country: "Finland",
        phone: "+358 40 123 4567",
        notes: "Please ring the doorbell twice",
        wishlist: "Books, puzzles, gift cards",
      };
      
      const preview = buildMessage(
        template || DEFAULT_MESSAGE_TEMPLATE,
        "Your Name",
        sampleReceiver,
        adminContactMention
      );
      
      res.json({ preview });
    } catch (error) {
      console.error("Error generating preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // Slack Settings - Save token to database
  app.get("/api/slack/settings", async (req, res) => {
    try {
      const settings = await storage.getSlackSettings();
      res.json({
        hasToken: !!settings?.botToken,
        teamName: settings?.teamName || null,
        teamId: settings?.teamId || null,
        adminSlackId: settings?.adminSlackId || null,
        adminDisplayName: settings?.adminDisplayName || null,
      });
    } catch (error) {
      console.error("Error fetching slack settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/slack/settings", async (req, res) => {
    try {
      const { botToken } = req.body as { botToken: string };

      if (!botToken || !botToken.startsWith("xoxb-")) {
        return res.status(400).json({ error: "Invalid bot token format. Token should start with 'xoxb-'" });
      }

      // Test the token first
      const testResponse = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${botToken}`,
        },
      });

      const testData = await testResponse.json() as { ok: boolean; team?: string; team_id?: string; error?: string };

      if (!testData.ok) {
        return res.status(400).json({ error: testData.error || "Invalid token" });
      }

      // Save to database
      await storage.saveSlackSettings({
        botToken,
        teamId: testData.team_id || null,
        teamName: testData.team || null,
      });

      res.json({
        success: true,
        teamName: testData.team,
        teamId: testData.team_id,
      });
    } catch (error) {
      console.error("Error saving slack settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.delete("/api/slack/settings", async (req, res) => {
    try {
      await storage.saveSlackSettings({
        botToken: null,
        teamId: null,
        teamName: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting slack settings:", error);
      res.status(500).json({ error: "Failed to delete settings" });
    }
  });

  // Update admin contact
  app.patch("/api/slack/settings/admin", async (req, res) => {
    try {
      const { adminSlackId } = req.body as { adminSlackId: string | null };
      
      // If clearing the admin, just save null values
      if (!adminSlackId) {
        const settings = await storage.getSlackSettings();
        if (settings) {
          await storage.saveSlackSettings({
            botToken: settings.botToken,
            teamId: settings.teamId,
            teamName: settings.teamName,
            adminSlackId: null,
            adminDisplayName: null,
          });
        }
        return res.json({ success: true, adminSlackId: null, adminDisplayName: null });
      }
      
      // Validate the Slack ID by fetching user info
      const slackToken = await getSlackToken();
      if (!slackToken) {
        return res.status(400).json({ error: "Slack not connected" });
      }
      
      const userInfoResponse = await fetch(`https://slack.com/api/users.info?user=${adminSlackId}`, {
        headers: { "Authorization": `Bearer ${slackToken}` },
      });
      
      const userInfoData = await userInfoResponse.json() as { 
        ok: boolean; 
        error?: string;
        user?: { real_name?: string; profile?: { real_name?: string } } 
      };
      
      if (!userInfoData.ok) {
        return res.status(400).json({ error: userInfoData.error || "Invalid Slack user ID" });
      }
      
      const displayName = userInfoData.user?.real_name || userInfoData.user?.profile?.real_name || "Unknown";
      
      // Save to database
      const settings = await storage.getSlackSettings();
      if (settings) {
        await storage.saveSlackSettings({
          botToken: settings.botToken,
          teamId: settings.teamId,
          teamName: settings.teamName,
          adminSlackId,
          adminDisplayName: displayName,
        });
      }
      
      res.json({ success: true, adminSlackId, adminDisplayName: displayName });
    } catch (error) {
      console.error("Error updating admin contact:", error);
      res.status(500).json({ error: "Failed to update admin contact" });
    }
  });

  // Slack Contacts - Users imported from Slack who may become participants
  app.get("/api/slack/contacts", async (req, res) => {
    try {
      const contacts = await storage.getSlackContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching slack contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.post("/api/slack/contacts/import", async (req, res) => {
    try {
      const { users } = req.body as {
        users: Array<{
          id: string;
          name: string;
          realName: string;
          email?: string;
        }>;
      };

      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: "No users provided" });
      }

      const imported: string[] = [];
      const skipped: string[] = [];

      for (const user of users) {
        // Check if contact already exists
        const existing = await storage.getSlackContactByUserId(user.id);
        if (existing) {
          skipped.push(user.realName);
          continue;
        }

        await storage.createSlackContact({
          slackUserId: user.id,
          slackUsername: user.name,
          displayName: user.realName,
          email: user.email || null,
          status: CONTACT_STATUS.IMPORTED,
        });

        imported.push(user.realName);
      }

      res.json({
        success: true,
        imported: imported.length,
        skipped: skipped.length,
        importedNames: imported,
        skippedNames: skipped,
      });
    } catch (error) {
      console.error("Error importing slack contacts:", error);
      res.status(500).json({ error: "Failed to import contacts" });
    }
  });

  app.delete("/api/slack/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSlackContact(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting slack contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // Send invitation messages to all imported contacts
  app.post("/api/slack/invitations/send", async (req, res) => {
    try {
      const slackToken = await getSlackToken();
      if (!slackToken) {
        return res.status(400).json({ error: "Slack not configured" });
      }

      const contacts = await storage.getSlackContacts();
      const pendingContacts = contacts.filter(c => c.status === CONTACT_STATUS.IMPORTED);

      if (pendingContacts.length === 0) {
        return res.status(400).json({ error: "No contacts waiting for invitations" });
      }

      let sent = 0;
      let failed = 0;

      for (const contact of pendingContacts) {
        try {
          // Send invitation message
          const inviteMessage = `Hi ${contact.displayName}! 🎅\n\nYou've been invited to participate in our Secret Santa gift exchange!\n\nWould you like to join? Reply with:\n• *yes* - to participate\n• *no* - to decline\n\nIf you choose to participate, I'll ask for a few details to help your Secret Santa find the perfect gift!`;

          const dmResponse = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${slackToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: contact.slackUserId,
              text: inviteMessage,
            }),
          });

          const dmData = await dmResponse.json() as { ok: boolean; ts?: string };

          if (dmData.ok) {
            // Create onboarding session
            await storage.createOnboardingSession({
              slackContactId: contact.id,
              slackUserId: contact.slackUserId,
              conversationState: ONBOARDING_STATES.AWAITING_CONSENT,
              lastMessageTs: dmData.ts || null,
            });

            // Update contact status
            await storage.updateSlackContact(contact.id, {
              status: CONTACT_STATUS.INVITED,
              invitedAt: new Date(),
            });

            sent++;
          } else {
            failed++;
          }

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`Failed to send invitation to ${contact.displayName}:`, err);
          failed++;
        }
      }

      res.json({
        success: true,
        sent,
        failed,
        message: `Sent ${sent} invitations. ${failed > 0 ? `${failed} failed.` : ""}`,
      });
    } catch (error) {
      console.error("Error sending invitations:", error);
      res.status(500).json({ error: "Failed to send invitations" });
    }
  });

  // Resend invitation to a specific contact
  app.post("/api/slack/invitations/resend/:contactId", async (req, res) => {
    try {
      const { contactId } = req.params;
      const slackToken = await getSlackToken();
      
      if (!slackToken) {
        return res.status(400).json({ error: "Slack not configured" });
      }

      const contacts = await storage.getSlackContacts();
      const contact = contacts.find(c => c.id === contactId);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      const inviteMessage = `Hi ${contact.displayName}! 🎅\n\nJust a friendly reminder - you've been invited to participate in our Secret Santa gift exchange!\n\nWould you like to join? Reply with:\n• *yes* - to participate\n• *no* - to decline`;

      const dmResponse = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: contact.slackUserId,
          text: inviteMessage,
        }),
      });

      const dmData = await dmResponse.json() as { ok: boolean; ts?: string };

      if (dmData.ok) {
        await storage.updateSlackContact(contact.id, {
          status: CONTACT_STATUS.INVITED,
          invitedAt: new Date(),
        });

        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Failed to send message" });
      }
    } catch (error) {
      console.error("Error resending invitation:", error);
      res.status(500).json({ error: "Failed to resend invitation" });
    }
  });

  // Assignment gift status management
  app.patch("/api/assignments/:id/gift-status", async (req, res) => {
    try {
      const { id } = req.params;
      const { giftSent } = req.body as { giftSent: boolean };
      
      await storage.updateAssignmentGiftStatus(id, giftSent);
      
      // If gift is marked as sent by admin, notify the receiver
      if (giftSent) {
        const allAssignments = await storage.getAllAssignmentsWithDetails();
        const assignment = allAssignments.find(a => a.id === id);
        
        if (assignment && assignment.receiver.slackUserId && !assignment.receiverNotified) {
          const slackToken = await getSlackToken();
          if (slackToken) {
            const receiverMessage = `🎁 Good news! Your Secret Santa gift is on its way!\n\nStart watching for a delivery - your gift should arrive soon. Happy holidays! 🎅`;
            
            await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${slackToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                channel: assignment.receiver.slackUserId,
                text: receiverMessage,
              }),
            });
            
            await storage.updateAssignmentReceiverNotified(id);
          }
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating gift status:", error);
      res.status(500).json({ error: "Failed to update gift status" });
    }
  });

  // Get all assignments with full details (for admin view)
  app.get("/api/assignments/all", async (req, res) => {
    try {
      const allAssignments = await storage.getAllAssignmentsWithDetails();
      res.json(allAssignments);
    } catch (error) {
      console.error("Error fetching all assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Manually trigger gift reminders (for testing or manual send)
  app.post("/api/assignments/send-reminders", async (req, res) => {
    try {
      const result = await sendGiftReminders();
      res.json(result);
    } catch (error) {
      console.error("Error sending reminders:", error);
      res.status(500).json({ error: "Failed to send reminders" });
    }
  });

  // Slack Events webhook - receives messages from users
  app.post("/api/slack/events", async (req, res) => {
    try {
      // Handle Slack URL verification challenge
      if (req.body.type === "url_verification") {
        return res.json({ challenge: req.body.challenge });
      }

      // Handle event callbacks
      if (req.body.type === "event_callback") {
        const event = req.body.event;

        // Only process direct messages from users
        if (event.type === "message" && event.channel_type === "im" && !event.bot_id) {
          const userId = event.user;
          const messageText = (event.text || "").trim();

          // Process the message asynchronously
          processSlackMessage(userId, messageText).catch(err => {
            console.error("Error processing Slack message:", err);
          });
        }
      }

      // Always respond quickly to Slack
      res.json({ ok: true });
    } catch (error) {
      console.error("Error handling Slack event:", error);
      res.status(200).json({ ok: true }); // Always return 200 to Slack
    }
  });

  return httpServer;
}

// Handle gift confirmation responses from givers
async function handleGiftConfirmation(
  slackUserId: string, 
  lowerText: string, 
  slackToken: string
): Promise<{ handled: boolean }> {
  // Check if this user has a pending gift assignment (reminder was sent)
  const allAssignments = await storage.getAllAssignmentsWithDetails();
  const userAssignment = allAssignments.find(
    a => a.giver.slackUserId === slackUserId && 
         a.notified && 
         !a.giftSent && 
         a.lastReminderAt
  );

  if (!userAssignment) {
    return { handled: false };
  }

  // Check if message is a yes/no response
  const isYes = lowerText === "yes" || lowerText === "y" || lowerText.includes("sent") || lowerText.includes("done");
  const isNo = lowerText === "no" || lowerText === "n" || lowerText.includes("not yet");

  if (!isYes && !isNo) {
    return { handled: false };
  }

  if (isYes) {
    // Mark gift as sent
    await storage.updateAssignmentGiftStatus(userAssignment.id, true);

    // Notify the receiver
    if (userAssignment.receiver.slackUserId && !userAssignment.receiverNotified) {
      const receiverMessage = `🎁 Good news! Your Secret Santa gift is on its way!\n\nStart watching for a delivery - your gift should arrive soon. Happy holidays! 🎅`;
      
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${slackToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: userAssignment.receiver.slackUserId,
          text: receiverMessage,
        }),
      });
      
      await storage.updateAssignmentReceiverNotified(userAssignment.id);
    }

    // Thank the sender
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: slackUserId,
        text: `Thank you for confirming! 🎉 Your gift to *${userAssignment.receiver.name}* has been marked as sent. You've made someone's day brighter! Happy holidays! 🎄`,
      }),
    });

    return { handled: true };
  }

  if (isNo) {
    // Encourage them to send soon
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: slackUserId,
        text: `No worries! Please try to send your gift to *${userAssignment.receiver.name}* as soon as possible. 📦\n\nOnce you've sent it, just reply *yes* and I'll let them know it's on the way! 🎁`,
      }),
    });

    return { handled: true };
  }

  return { handled: false };
}

// Process incoming Slack messages for onboarding flow and gift confirmations
async function processSlackMessage(slackUserId: string, messageText: string): Promise<void> {
  const slackToken = await getSlackToken();
  if (!slackToken) return;

  const lowerText = messageText.toLowerCase().trim();

  // First, check if this is a gift confirmation response
  const giftConfirmationResult = await handleGiftConfirmation(slackUserId, lowerText, slackToken);
  if (giftConfirmationResult.handled) {
    return;
  }

  // Get the onboarding session for this user
  const session = await storage.getOnboardingSession(slackUserId);
  if (!session) {
    // No active session, ignore message
    return;
  }

  const contact = await storage.getSlackContactByUserId(slackUserId);
  if (!contact) return;

  let responseMessage = "";
  let newState = session.conversationState;
  const updates: Partial<typeof session> = {};
  
  switch (session.conversationState) {
    case ONBOARDING_STATES.AWAITING_CONSENT:
      if (lowerText.includes("yes") || lowerText.includes("yeah") || lowerText.includes("sure") || lowerText.includes("ok")) {
        responseMessage = "Great! I'm excited to have you join! 🎉\n\nFirst, what's your legal full name? (This will appear on the postal package)";
        newState = ONBOARDING_STATES.COLLECTING_NAME;
        await storage.updateSlackContact(contact.id, { status: CONTACT_STATUS.IN_PROGRESS });
      } else if (lowerText.includes("no") || lowerText.includes("nope") || lowerText.includes("decline")) {
        responseMessage = "No problem! Thanks for letting me know. If you change your mind, just let me know!";
        newState = ONBOARDING_STATES.DECLINED;
        await storage.updateSlackContact(contact.id, { status: CONTACT_STATUS.DECLINED, respondedAt: new Date() });
      } else {
        responseMessage = "Please reply with *yes* to join or *no* to decline.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_NAME:
      if (messageText.length >= 2 && messageText.length <= 100) {
        updates.collectedName = messageText.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        responseMessage = `Thanks, ${updates.collectedName}! 👋\n\nWhat country are you located in?`;
        newState = ONBOARDING_STATES.COLLECTING_COUNTRY;
      } else {
        responseMessage = "Please enter your full name (2-100 characters).";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_COUNTRY:
      if (messageText.length >= 2) {
        updates.collectedCountry = messageText.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        responseMessage = `Great! 🌍 What city do you live in?`;
        newState = ONBOARDING_STATES.COLLECTING_CITY;
      } else {
        responseMessage = "Please enter your country name.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_CITY:
      if (messageText.length >= 2) {
        updates.collectedCity = messageText.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        responseMessage = "Got it! 📍 What's your ZIP/postal code?";
        newState = ONBOARDING_STATES.COLLECTING_ZIP;
      } else {
        responseMessage = "Please enter your city name.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_ZIP:
      if (messageText.length >= 3) {
        updates.collectedZip = messageText.toUpperCase();
        responseMessage = `Now, what's your street address? (e.g., "123 Main Street, Apt 4B")`;
        newState = ONBOARDING_STATES.COLLECTING_STREET;
      } else {
        responseMessage = "Please enter your ZIP/postal code.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_STREET:
      if (messageText.length >= 5) {
        updates.collectedStreet = messageText;
        responseMessage = "Almost there! 📱 What's your phone number with international prefix? (e.g., +1 555 123 4567)";
        newState = ONBOARDING_STATES.COLLECTING_PHONE;
      } else {
        responseMessage = "Please enter your street address.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_PHONE:
      // Basic phone validation - at least 7 digits
      const digits = messageText.replace(/\D/g, "");
      if (digits.length >= 7) {
        updates.collectedPhone = messageText;
        responseMessage = "Great! 📝 Any additional notes for delivery?\n\nType *skip* if you have nothing to add.";
        newState = ONBOARDING_STATES.COLLECTING_NOTES;
      } else {
        responseMessage = "Please enter a valid phone number with at least 7 digits.";
      }
      break;

    case ONBOARDING_STATES.COLLECTING_NOTES:
      // Notes are optional - accept any input or skip
      const isSkip = lowerText === "skip" || lowerText === "none" || lowerText === "n/a";
      
      if (!isSkip && messageText.length > 0) {
        updates.collectedNotes = messageText;
      }
      
      newState = ONBOARDING_STATES.COMPLETED;

      // Create participant from collected data
      const fullAddress = `${session.collectedStreet}, ${session.collectedCity}, ${session.collectedZip}, ${session.collectedCountry}`;
      const collectedNotes = isSkip ? null : (messageText.length > 0 ? messageText : null);
      
      // Fetch user's timezone from Slack
      let userTimezone: string | undefined;
      let userTimezoneOffset: number | undefined;
      try {
        const slackToken = await getSlackToken();
        if (slackToken) {
          const userInfoResponse = await fetch(`https://slack.com/api/users.info?user=${contact.slackUserId}`, {
            headers: { "Authorization": `Bearer ${slackToken}` },
          });
          const userInfoData = await userInfoResponse.json() as { ok: boolean; user?: { tz?: string; tz_offset?: number } };
          if (userInfoData.ok && userInfoData.user) {
            userTimezone = userInfoData.user.tz;
            userTimezoneOffset = userInfoData.user.tz_offset;
          }
        }
      } catch (error) {
        console.error("Error fetching user timezone:", error);
      }
      
      await storage.createParticipant({
        name: session.collectedName || contact.displayName,
        email: contact.email || `${contact.slackUsername}@slack.local`,
        slackUserId: contact.slackUserId,
        address: fullAddress,
        country: session.collectedCountry,
        city: session.collectedCity,
        zip: session.collectedZip,
        street: session.collectedStreet,
        phone: session.collectedPhone || "",
        wishlist: null,
        notes: collectedNotes,
        timezone: userTimezone,
        timezoneOffset: userTimezoneOffset,
      });

      await storage.updateSlackContact(contact.id, { 
        status: CONTACT_STATUS.COMPLETED, 
        respondedAt: new Date() 
      });

      const notesDisplay = collectedNotes ? `\n• Delivery notes: ${collectedNotes}` : "";
      const adminMention = await getAdminContactMention();
      responseMessage = `🎉 You're all set! You've been added to the Secret Santa exchange.\n\n*Your details:*\n• Name: ${session.collectedName}\n• Country: ${session.collectedCountry}\n• City: ${session.collectedCity}\n• ZIP: ${session.collectedZip}\n• Street: ${session.collectedStreet}\n• Phone: ${session.collectedPhone}${notesDisplay}\n\nYou'll receive your Secret Santa assignment soon. Happy gifting! 🎁\n\nIf you have any questions or problems, please contact ${adminMention}.`;
      break;

    case ONBOARDING_STATES.COMPLETED:
    case ONBOARDING_STATES.DECLINED:
      // Session already finished
      return;

    default:
      return;
  }

  // Update session state
  await storage.updateOnboardingSession(session.id, {
    conversationState: newState,
    ...updates,
  });

  // Send response message
  if (responseMessage) {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: slackUserId,
        text: responseMessage,
      }),
    });
  }
}
