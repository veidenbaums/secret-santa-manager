import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const slackSettings = pgTable("slack_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botToken: text("bot_token"),
  teamId: text("team_id"),
  teamName: text("team_name"),
  adminSlackId: text("admin_slack_id"),
  adminDisplayName: text("admin_display_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const slackContacts = pgTable("slack_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slackUserId: text("slack_user_id").notNull().unique(),
  slackUsername: text("slack_username").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  status: text("status").notNull().default("imported"),
  invitedAt: timestamp("invited_at"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const slackOnboardingSessions = pgTable("slack_onboarding_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slackContactId: varchar("slack_contact_id").notNull().references(() => slackContacts.id),
  slackUserId: text("slack_user_id").notNull(),
  conversationState: text("conversation_state").notNull().default("invited"),
  collectedName: text("collected_name"),
  collectedCountry: text("collected_country"),
  collectedStreet: text("collected_street"),
  collectedCity: text("collected_city"),
  collectedZip: text("collected_zip"),
  collectedPhone: text("collected_phone"),
  collectedNotes: text("collected_notes"),
  lastMessageTs: text("last_message_ts"),
  lastInteractionAt: timestamp("last_interaction_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const participants = pgTable("participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  slackUserId: text("slack_user_id"),
  address: text("address").notNull(),
  country: text("country"),
  city: text("city"),
  zip: text("zip"),
  street: text("street"),
  phone: text("phone"),
  wishlist: text("wishlist"),
  notes: text("notes"),
  timezone: text("timezone"),
  timezoneOffset: integer("timezone_offset"),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  scheduledDate: timestamp("scheduled_date"),
  status: text("status").notNull().default("draft"),
  matchingComplete: boolean("matching_complete").default(false),
  notificationsSent: boolean("notifications_sent").default(false),
  messageTemplate: text("message_template"),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  giverId: varchar("giver_id").notNull().references(() => participants.id),
  receiverId: varchar("receiver_id").notNull().references(() => participants.id),
  notified: boolean("notified").default(false),
  notifiedAt: timestamp("notified_at"),
  giftSent: boolean("gift_sent").default(false),
  giftSentAt: timestamp("gift_sent_at"),
  lastReminderAt: timestamp("last_reminder_at"),
  nextReminderAt: timestamp("next_reminder_at"),
  receiverNotified: boolean("receiver_notified").default(false),
});

export const exclusions = pgTable("exclusions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participantId: varchar("participant_id").notNull().references(() => participants.id),
  excludedParticipantId: varchar("excluded_participant_id").notNull().references(() => participants.id),
});

export const slackContactsRelations = relations(slackContacts, ({ many }) => ({
  onboardingSessions: many(slackOnboardingSessions),
}));

export const slackOnboardingSessionsRelations = relations(slackOnboardingSessions, ({ one }) => ({
  slackContact: one(slackContacts, { fields: [slackOnboardingSessions.slackContactId], references: [slackContacts.id] }),
}));

export const participantsRelations = relations(participants, ({ many }) => ({
  giverAssignments: many(assignments, { relationName: "giver" }),
  receiverAssignments: many(assignments, { relationName: "receiver" }),
  exclusions: many(exclusions, { relationName: "participant" }),
  excludedBy: many(exclusions, { relationName: "excluded" }),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  assignments: many(assignments),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  event: one(events, { fields: [assignments.eventId], references: [events.id] }),
  giver: one(participants, { fields: [assignments.giverId], references: [participants.id], relationName: "giver" }),
  receiver: one(participants, { fields: [assignments.receiverId], references: [participants.id], relationName: "receiver" }),
}));

export const exclusionsRelations = relations(exclusions, ({ one }) => ({
  participant: one(participants, { fields: [exclusions.participantId], references: [participants.id], relationName: "participant" }),
  excludedParticipant: one(participants, { fields: [exclusions.excludedParticipantId], references: [participants.id], relationName: "excluded" }),
}));

export const insertSlackSettingsSchema = createInsertSchema(slackSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSlackContactSchema = createInsertSchema(slackContacts).omit({ id: true, createdAt: true });
export const insertSlackOnboardingSessionSchema = createInsertSchema(slackOnboardingSessions).omit({ id: true, createdAt: true });
export const insertParticipantSchema = createInsertSchema(participants).omit({ id: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true, matchingComplete: true, notificationsSent: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true });
export const insertExclusionSchema = createInsertSchema(exclusions).omit({ id: true });

export type InsertSlackSettings = z.infer<typeof insertSlackSettingsSchema>;
export type SlackSettings = typeof slackSettings.$inferSelect;

export type InsertSlackContact = z.infer<typeof insertSlackContactSchema>;
export type SlackContact = typeof slackContacts.$inferSelect;

export type InsertSlackOnboardingSession = z.infer<typeof insertSlackOnboardingSessionSchema>;
export type SlackOnboardingSession = typeof slackOnboardingSessions.$inferSelect;

export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participants.$inferSelect;

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignments.$inferSelect;

export type InsertExclusion = z.infer<typeof insertExclusionSchema>;
export type Exclusion = typeof exclusions.$inferSelect;

export type AssignmentWithDetails = Assignment & {
  giver: Participant;
  receiver: Participant;
};

export const ONBOARDING_STATES = {
  INVITED: "invited",
  AWAITING_CONSENT: "awaiting_consent",
  COLLECTING_NAME: "collecting_name",
  COLLECTING_COUNTRY: "collecting_country",
  COLLECTING_CITY: "collecting_city",
  COLLECTING_ZIP: "collecting_zip",
  COLLECTING_STREET: "collecting_street",
  COLLECTING_PHONE: "collecting_phone",
  COLLECTING_NOTES: "collecting_notes",
  COMPLETED: "completed",
  DECLINED: "declined",
} as const;

export const CONTACT_STATUS = {
  IMPORTED: "imported",
  INVITED: "invited",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  DECLINED: "declined",
} as const;
