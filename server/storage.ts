import {
  participants,
  events,
  assignments,
  exclusions,
  slackSettings,
  slackContacts,
  slackOnboardingSessions,
  type Participant,
  type InsertParticipant,
  type Event,
  type InsertEvent,
  type Assignment,
  type InsertAssignment,
  type Exclusion,
  type InsertExclusion,
  type AssignmentWithDetails,
  type SlackSettings,
  type InsertSlackSettings,
  type SlackContact,
  type InsertSlackContact,
  type SlackOnboardingSession,
  type InsertSlackOnboardingSession,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Participants
  getParticipants(): Promise<Participant[]>;
  getParticipant(id: string): Promise<Participant | undefined>;
  getParticipantByEmail(email: string): Promise<Participant | undefined>;
  createParticipant(participant: InsertParticipant): Promise<Participant>;
  updateParticipant(id: string, participant: Partial<InsertParticipant>): Promise<Participant | undefined>;
  deleteParticipant(id: string): Promise<void>;

  // Events
  getCurrentEvent(): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<Event>): Promise<Event | undefined>;

  // Assignments
  getAssignments(eventId: string): Promise<AssignmentWithDetails[]>;
  getAllAssignmentsWithDetails(): Promise<AssignmentWithDetails[]>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  clearAssignments(eventId: string): Promise<void>;
  updateAssignmentNotified(id: string): Promise<void>;
  updateAssignmentGiftStatus(id: string, giftSent: boolean): Promise<void>;
  updateAssignmentReminderSent(id: string, nextReminderAt: Date): Promise<void>;
  updateAssignmentNextReminder(id: string, nextReminderAt: Date): Promise<void>;
  updateAssignmentReceiverNotified(id: string): Promise<void>;
  getAssignmentsNeedingReminder(): Promise<AssignmentWithDetails[]>;

  // Exclusions
  getExclusions(): Promise<(Exclusion & { participantName: string; excludedName: string })[]>;
  getExclusionPairs(): Promise<Array<{ participantId: string; excludedParticipantId: string }>>;
  createExclusion(exclusion: InsertExclusion): Promise<Exclusion>;
  deleteExclusion(id: string): Promise<void>;

  // Slack Settings
  getSlackSettings(): Promise<SlackSettings | undefined>;
  saveSlackSettings(settings: InsertSlackSettings): Promise<SlackSettings>;

  // Slack Contacts
  getSlackContacts(): Promise<SlackContact[]>;
  getSlackContactByUserId(slackUserId: string): Promise<SlackContact | undefined>;
  createSlackContact(contact: InsertSlackContact): Promise<SlackContact>;
  updateSlackContact(id: string, contact: Partial<SlackContact>): Promise<SlackContact | undefined>;
  deleteSlackContact(id: string): Promise<void>;

  // Slack Onboarding Sessions
  getOnboardingSession(slackUserId: string): Promise<SlackOnboardingSession | undefined>;
  createOnboardingSession(session: InsertSlackOnboardingSession): Promise<SlackOnboardingSession>;
  updateOnboardingSession(id: string, session: Partial<SlackOnboardingSession>): Promise<SlackOnboardingSession | undefined>;

  // Reset (keeps Slack settings)
  resetAll(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Participants
  async getParticipants(): Promise<Participant[]> {
    return db.select().from(participants).orderBy(participants.name);
  }

  async getParticipant(id: string): Promise<Participant | undefined> {
    const [participant] = await db.select().from(participants).where(eq(participants.id, id));
    return participant || undefined;
  }

  async getParticipantByEmail(email: string): Promise<Participant | undefined> {
    const [participant] = await db.select().from(participants).where(eq(participants.email, email));
    return participant || undefined;
  }

  async createParticipant(participant: InsertParticipant): Promise<Participant> {
    const [created] = await db.insert(participants).values(participant).returning();
    return created;
  }

  async updateParticipant(id: string, participant: Partial<InsertParticipant>): Promise<Participant | undefined> {
    const [updated] = await db
      .update(participants)
      .set(participant)
      .where(eq(participants.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteParticipant(id: string): Promise<void> {
    await db.delete(exclusions).where(eq(exclusions.participantId, id));
    await db.delete(exclusions).where(eq(exclusions.excludedParticipantId, id));
    await db.delete(assignments).where(eq(assignments.giverId, id));
    await db.delete(assignments).where(eq(assignments.receiverId, id));
    await db.delete(participants).where(eq(participants.id, id));
  }

  // Events
  async getCurrentEvent(): Promise<Event | undefined> {
    const [event] = await db
      .select()
      .from(events)
      .orderBy(events.id)
      .limit(1);
    return event || undefined;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const existing = await this.getCurrentEvent();
    if (existing) {
      const [updated] = await db
        .update(events)
        .set(event)
        .where(eq(events.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async updateEvent(id: string, event: Partial<Event>): Promise<Event | undefined> {
    const [updated] = await db
      .update(events)
      .set(event)
      .where(eq(events.id, id))
      .returning();
    return updated || undefined;
  }

  // Assignments
  async getAssignments(eventId: string): Promise<AssignmentWithDetails[]> {
    const result = await db.query.assignments.findMany({
      where: eq(assignments.eventId, eventId),
      with: {
        giver: true,
        receiver: true,
      },
    });
    return result as AssignmentWithDetails[];
  }

  async createAssignment(assignment: InsertAssignment): Promise<Assignment> {
    const [created] = await db.insert(assignments).values(assignment).returning();
    return created;
  }

  async clearAssignments(eventId: string): Promise<void> {
    await db.delete(assignments).where(eq(assignments.eventId, eventId));
  }

  async updateAssignmentNotified(id: string): Promise<void> {
    await db.update(assignments).set({ notified: true, notifiedAt: new Date() }).where(eq(assignments.id, id));
  }

  async getAllAssignmentsWithDetails(): Promise<AssignmentWithDetails[]> {
    const result = await db.query.assignments.findMany({
      with: {
        giver: true,
        receiver: true,
      },
    });
    return result as AssignmentWithDetails[];
  }

  async updateAssignmentGiftStatus(id: string, giftSent: boolean): Promise<void> {
    await db.update(assignments).set({
      giftSent,
      giftSentAt: giftSent ? new Date() : null,
    }).where(eq(assignments.id, id));
  }

  async updateAssignmentReminderSent(id: string, nextReminderAt: Date): Promise<void> {
    await db.update(assignments).set({ 
      lastReminderAt: new Date(),
      nextReminderAt 
    }).where(eq(assignments.id, id));
  }

  async updateAssignmentNextReminder(id: string, nextReminderAt: Date): Promise<void> {
    await db.update(assignments).set({ nextReminderAt }).where(eq(assignments.id, id));
  }

  async updateAssignmentReceiverNotified(id: string): Promise<void> {
    await db.update(assignments).set({ receiverNotified: true }).where(eq(assignments.id, id));
  }

  async getAssignmentsNeedingReminder(): Promise<AssignmentWithDetails[]> {
    const result = await db.query.assignments.findMany({
      where: and(
        eq(assignments.notified, true),
        eq(assignments.giftSent, false)
      ),
      with: {
        giver: true,
        receiver: true,
      },
    });
    return result as AssignmentWithDetails[];
  }

  // Exclusions
  async getExclusions(): Promise<(Exclusion & { participantName: string; excludedName: string })[]> {
    const result = await db.query.exclusions.findMany({
      with: {
        participant: true,
        excludedParticipant: true,
      },
    });

    return result.map((e) => ({
      ...e,
      participantName: e.participant.name,
      excludedName: e.excludedParticipant.name,
    }));
  }

  async getExclusionPairs(): Promise<Array<{ participantId: string; excludedParticipantId: string }>> {
    return db.select({
      participantId: exclusions.participantId,
      excludedParticipantId: exclusions.excludedParticipantId,
    }).from(exclusions);
  }

  async createExclusion(exclusion: InsertExclusion): Promise<Exclusion> {
    const [created] = await db.insert(exclusions).values(exclusion).returning();
    return created;
  }

  async deleteExclusion(id: string): Promise<void> {
    await db.delete(exclusions).where(eq(exclusions.id, id));
  }

  // Slack Settings
  async getSlackSettings(): Promise<SlackSettings | undefined> {
    const [settings] = await db.select().from(slackSettings).limit(1);
    return settings || undefined;
  }

  async saveSlackSettings(settings: InsertSlackSettings): Promise<SlackSettings> {
    const existing = await this.getSlackSettings();
    if (existing) {
      const [updated] = await db
        .update(slackSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(slackSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(slackSettings).values(settings).returning();
    return created;
  }

  // Slack Contacts
  async getSlackContacts(): Promise<SlackContact[]> {
    return db.select().from(slackContacts).orderBy(slackContacts.displayName);
  }

  async getSlackContactByUserId(slackUserId: string): Promise<SlackContact | undefined> {
    const [contact] = await db.select().from(slackContacts).where(eq(slackContacts.slackUserId, slackUserId));
    return contact || undefined;
  }

  async createSlackContact(contact: InsertSlackContact): Promise<SlackContact> {
    const [created] = await db.insert(slackContacts).values(contact).returning();
    return created;
  }

  async updateSlackContact(id: string, contact: Partial<SlackContact>): Promise<SlackContact | undefined> {
    const [updated] = await db
      .update(slackContacts)
      .set(contact)
      .where(eq(slackContacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSlackContact(id: string): Promise<void> {
    await db.delete(slackOnboardingSessions).where(eq(slackOnboardingSessions.slackContactId, id));
    await db.delete(slackContacts).where(eq(slackContacts.id, id));
  }

  // Slack Onboarding Sessions
  async getOnboardingSession(slackUserId: string): Promise<SlackOnboardingSession | undefined> {
    const [session] = await db
      .select()
      .from(slackOnboardingSessions)
      .where(eq(slackOnboardingSessions.slackUserId, slackUserId))
      .orderBy(slackOnboardingSessions.createdAt)
      .limit(1);
    return session || undefined;
  }

  async createOnboardingSession(session: InsertSlackOnboardingSession): Promise<SlackOnboardingSession> {
    const [created] = await db.insert(slackOnboardingSessions).values(session).returning();
    return created;
  }

  async updateOnboardingSession(id: string, session: Partial<SlackOnboardingSession>): Promise<SlackOnboardingSession | undefined> {
    const [updated] = await db
      .update(slackOnboardingSessions)
      .set({ ...session, lastInteractionAt: new Date() })
      .where(eq(slackOnboardingSessions.id, id))
      .returning();
    return updated || undefined;
  }

  // Reset all data except Slack settings
  async resetAll(): Promise<void> {
    await db.delete(assignments);
    await db.delete(exclusions);
    await db.delete(participants);
    await db.delete(events);
    await db.delete(slackOnboardingSessions);
    await db.delete(slackContacts);
  }
}

export const storage = new DatabaseStorage();
