# Secret Santa Manager

## Overview

A web application for organizing and managing Secret Santa gift exchanges. The system allows administrators to manage participants, set exclusion rules (e.g., spouses shouldn't be matched), automatically generate gift assignments using a backtracking algorithm, and prepare for Slack notifications. The application features a festive Material Design-inspired interface with a focus on usability and clean system aesthetics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server, providing fast HMR and optimized production builds
- Wouter for lightweight client-side routing (single route dashboard application)

**UI Component Strategy**
- Shadcn/ui component library (New York style) with Radix UI primitives for accessible, composable components
- Tailwind CSS for utility-first styling with custom design tokens
- Class Variance Authority (CVA) for type-safe component variant management
- Custom CSS variables for theme consistency (festive holiday colors in light mode, adapted for dark mode)

**State Management**
- TanStack Query (React Query) for server state management, caching, and automatic refetching
- React Hook Form with Zod validation for form state and client-side validation
- Local component state for UI interactions (dialogs, dropdowns, etc.)

**Design System**
- Typography: Inter (UI/body) and Playfair Display (headers/accents) from Google Fonts
- Spacing system based on Tailwind units (3, 4, 6, 8, 12, 16)
- Responsive grid layout: two-column on desktop (participants management + control panel), single column on mobile
- Festive color palette with primary red (#D93C49) and secondary green, using HSL color space for theme flexibility

### Backend Architecture

**Server Framework**
- Express.js for HTTP server with middleware-based request handling
- Custom logging middleware for request/response tracking
- Static file serving for production builds

**API Design**
- RESTful API structure with resource-based endpoints:
  - `/api/participants` - CRUD operations for participant management (now includes phone field)
  - `/api/events` - Event creation and scheduling
  - `/api/assignments` - Gift assignment generation and retrieval
  - `/api/exclusions` - Exclusion pair management
  - `/api/slack/status` - Check Slack connection status
  - `/api/slack/settings` - Save/manage Slack bot token via UI (stored in database)
  - `/api/slack/users` - Fetch workspace users (with cursor-based pagination)
  - `/api/slack/contacts` - Manage imported Slack users as contacts before they become participants
  - `/api/slack/contacts/import` - Import selected Slack users as contacts
  - `/api/slack/invitations/send` - Send bot invitations to all pending contacts
  - `/api/slack/invitations/resend/:id` - Resend invitation to specific contact
  - `/api/slack/events` - Webhook endpoint for Slack Events API (receives bot responses)
  - `/api/message-template` - CRUD for customizable notification message template
- JSON request/response format with Zod schema validation
- Error handling with descriptive status codes and messages

**Business Logic**
- Secret Santa matching algorithm using Fisher-Yates shuffle with backtracking
- Exclusion constraints prevent specific pairs from being matched
- Assignment validation ensures no self-assignments and respects exclusion rules
- Event state management tracks matching completion and notification status

**Data Storage Layer**
- Storage abstraction interface (`IStorage`) allows for flexible data persistence
- `DatabaseStorage` implementation using Drizzle ORM for type-safe database queries
- Repository pattern separates data access from business logic

### Data Storage Solutions

**Database**
- PostgreSQL via Neon serverless (configured via `@neondatabase/serverless`)
- WebSocket support for connection pooling and performance optimization
- Database schema defined with Drizzle ORM for type-safe migrations

**Schema Design**
- `participants` table: stores participant information (name, email, Slack user ID, address, phone, wishlist)
- `events` table: tracks Secret Santa events with scheduling and status information
- `assignments` table: stores giver-receiver pairs with notification tracking
- `exclusions` table: defines forbidden participant pairings
- `slack_settings` table: stores Slack bot token (in database instead of env vars)
- `slack_contacts` table: imported Slack users pending bot onboarding (status: imported, invited, in_progress, completed, declined)
- `slack_onboarding_sessions` table: tracks bot conversation state machine for each contact
- Relationships defined using Drizzle relations for join operations

**Type Safety**
- Shared schema definitions between client and server (`shared/schema.ts`)
- Drizzle-Zod integration generates Zod schemas from database schema
- TypeScript types inferred from Drizzle schema definitions

### External Dependencies

**Third-Party Services**
- **Slack Integration**: Fully implemented notification system with conversational bot onboarding
  - Bot token stored in database (no env variable required) - configured via UI
  - Conversational bot flow: imports Slack users as contacts, sends invitations, collects participant details (name, address, phone) through interactive Slack DMs
  - 7-state conversation machine: Invited → AwaitingConsent → CollectingName → CollectingStreet → CollectingCity → CollectingZip → CollectingPhone → Completed
  - Admin can manually edit participant details after bot collection
  - Webhook endpoint `/api/slack/events` receives bot responses from Slack Events API
  - Sends formatted notification messages with assignment details, address, and wishlist
  
**Scheduling System**
- Event scheduling with date/time picker
- Background interval checks every minute for scheduled events
- Automatic notification sending when scheduled time arrives and matching is complete

**Core Libraries**
- **Drizzle ORM**: Type-safe database queries and migrations
- **Neon Serverless**: Serverless PostgreSQL database connection
- **Zod**: Runtime validation and type inference for forms and API requests
- **TanStack Query**: Async state management with intelligent caching
- **React Hook Form**: Performant form management with minimal re-renders
- **Radix UI**: Accessible component primitives (dialogs, popovers, dropdowns, etc.)
- **Lucide React**: Icon library for consistent iconography
- **date-fns**: Date manipulation and formatting utilities

**Development Tools**
- **ESBuild**: Fast bundling for server-side code in production
- **Vite plugins**: Runtime error overlay, Replit-specific development enhancements
- **TypeScript**: Static type checking across the entire codebase
- **PostCSS/Autoprefixer**: CSS processing for browser compatibility

**Authentication & Security**
- Session management dependencies present (`connect-pg-simple`, `express-session`) but authentication not currently implemented
- Application currently operates as single-admin tool without user authentication

## Recent Changes

**November 2025 - Timezone-Aware Gift Reminders**
- Added timezone fields to participants table (timezone, timezoneOffset)
- Added nextReminderAt field to assignments table for scheduled reminders
- Reminders are sent at 10:00 AM in the user's local timezone (never during night hours)
- First reminder: 7 days after notification at 10:00 AM local time
- Subsequent reminders: Daily at 10:00 AM local time until gift is marked as sent
- Timezone fetched from Slack API during user import/onboarding
- Scheduler runs every 15 minutes for responsive delivery
- Uses date-fns-tz library for timezone-aware date calculations

**November 2025 - Conversational Bot Onboarding**
- Added Slack bot token storage in database (no more env variable required)
- New Slack settings UI allows saving token directly in the app
- Implemented conversational bot flow for participant onboarding:
  - Admin imports Slack users as "contacts" (not yet participants)
  - Admin sends invitation messages to contacts via bot
  - Bot collects consent, name, street address, city, ZIP, and phone via DM conversation
  - Upon completion, contact becomes a full participant with collected details
- 7-state conversation machine handles the entire onboarding flow
- Admin can manually edit participant details at any time (phone field added)
- Contact management UI shows invitation status (Imported, Invited, In Progress, Completed, Declined)
- Webhook endpoint `/api/slack/events` receives responses from Slack Events API

**November 2025 - Slack Import & Message Template Features**
- Added Slack user import functionality with cursor-based pagination for large workspaces
- Implemented customizable message template for notification text with placeholder support
- Template placeholders: {{giver_name}}, {{receiver_name}}, {{receiver_address}}, {{receiver_wishlist}}
- Conditional block support with {{#if receiver_wishlist}}...{{/if}} syntax
- Preview and reset functionality for message templates
- Message templates persist to database across restarts

**November 2025 - MVP Complete**
- Built complete Secret Santa web application with festive holiday design
- Implemented participant management (add, edit, delete) with name, email, address, and wishlist
- Created robust Secret Santa matching algorithm using Fisher-Yates shuffle with backtracking
- Added exclusion rules to prevent specific people from being paired together
- Implemented event scheduling with date/time picker
- Built Slack notification integration for sending assignments
- Added match reveal feature to view all assignments
- Comprehensive error handling and loading states throughout

## Environment Variables

**Database (Auto-configured):**
- `DATABASE_URL` - PostgreSQL connection string

**Optional (Legacy - Token can now be stored via UI):**
- `SLACK_BOT_TOKEN` - Slack Bot OAuth token (fallback if database token not set)