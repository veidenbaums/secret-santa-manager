# Secret Santa Manager

A web application for organizing workplace gift exchanges with Slack bot integration. Features conversational onboarding, automatic matching, and timezone-aware gift reminders.

## Features

- **Participant Management** - Add, edit, and delete participants with full address details
- **Slack Bot Integration** - Import users from Slack and collect details via interactive DM conversations
- **Smart Matching** - Fisher-Yates shuffle algorithm with backtracking to handle exclusion rules
- **Exclusion Rules** - Prevent specific people from being matched (e.g., spouses, managers)
- **Customizable Messages** - Edit notification templates with placeholders
- **Timezone-Aware Reminders** - Send reminders at 10:00 AM in each user's local time
- **Gift Tracking** - Track which gifts have been sent
- **Password Protection** - Secure admin access with session-based authentication

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Integration**: Slack API (Bot Token)

---

## Manual Setup Guide

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Slack workspace with admin access (for bot setup)

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/secret-santa-manager.git
cd secret-santa-manager
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up PostgreSQL Database

1. Create a new PostgreSQL database:

```bash
createdb secret_santa
```

Or use a hosted PostgreSQL service (Neon, Supabase, Railway, etc.)

2. Note your database connection URL in this format:
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
```

### Step 4: Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration (Required)
DATABASE_URL=postgresql://username:password@localhost:5432/secret_santa

# Session Secret (Required) - Generate a random string
SESSION_SECRET=your-random-session-secret-at-least-32-characters

# App Password (Required) - Password to access the admin dashboard
APP_PASSWORD=your-secure-password

# Slack Bot Token (Optional) - Can also be configured via UI
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
```

#### Generating a Session Secret

You can generate a secure session secret using:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Set Up the Database Schema

Push the database schema to your PostgreSQL database:

```bash
npm run db:push
```

This creates all necessary tables:
- `participants` - Stores participant information
- `events` - Tracks Secret Santa events
- `assignments` - Gift giver/receiver pairs
- `exclusions` - Forbidden matching pairs
- `slack_settings` - Slack bot configuration
- `slack_contacts` - Imported Slack users
- `slack_onboarding_sessions` - Bot conversation state

### Step 6: Create a Slack Bot (Optional but Recommended)

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click **Create New App** > **From scratch**
3. Name your app (e.g., "Secret Santa Bot") and select your workspace

#### Configure Bot Permissions

1. Go to **OAuth & Permissions** in the sidebar
2. Under **Scopes** > **Bot Token Scopes**, add:
   - `chat:write` - Send messages
   - `users:read` - Read user info
   - `users:read.email` - Read user emails
   - `im:write` - Open DM channels
   - `im:history` - Read DM history

#### Enable Events (for Bot Conversations)

1. Go to **Event Subscriptions**
2. Enable Events
3. Set Request URL to: `https://YOUR_DOMAIN/api/slack/events`
4. Under **Subscribe to bot events**, add:
   - `message.im` - Receive DM messages

#### Install the App

1. Go to **Install App** in the sidebar
2. Click **Install to Workspace**
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 7: Start the Application

#### Development Mode

```bash
npm run dev
```

The app will be available at `http://localhost:5000`

#### Production Mode

```bash
npm run build
npm start
```

### Step 8: Access the Dashboard

1. Open `http://localhost:5000` in your browser
2. Enter your `APP_PASSWORD` to log in
3. Configure Slack (if not done via environment variable):
   - Click **Connect Slack**
   - Paste your Bot Token
   - Set an Admin Contact person for notifications

---

## Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for session encryption (32+ chars) |
| `APP_PASSWORD` | Yes | Password to access the admin dashboard |
| `SLACK_BOT_TOKEN` | No | Slack bot token (can be set via UI instead) |
| `PORT` | No | Server port (default: 5000) |

### Slack Bot Configuration via UI

You can configure the Slack bot directly in the app:

1. Click **Connect Slack** on the dashboard
2. Paste your Bot Token
3. Click **Set Admin Contact** to choose who receives support messages
4. Test the connection

---

## Usage Guide

### Adding Participants

**Option 1: Manual Entry**
1. Click **Add** on the Participants card
2. Fill in name, email, address, phone, and optional wishlist
3. Click **Save**

**Option 2: Import from Slack**
1. Click **Import from Slack**
2. Select users to import as contacts
3. Click **Send Invitations** to start bot onboarding
4. Bot collects: name, country, city, ZIP, street, phone, delivery notes
5. Completed contacts become participants automatically

### Setting Exclusions

1. Click **Manage Exclusions**
2. Select two people who should NOT be matched
3. Add the exclusion (add both directions if needed)

### Running the Matching

1. Ensure you have at least 3 participants
2. Click **Run Matching**
3. Review matches by clicking **Reveal All Matches**

### Sending Notifications

1. Click **Message Template** to customize the notification
2. Available placeholders:
   - `{{giver_name}}` - Gift giver's name
   - `{{receiver_name}}` - Recipient's name
   - `{{receiver_street}}`, `{{receiver_city}}`, `{{receiver_zip}}`, `{{receiver_country}}`
   - `{{receiver_phone}}`, `{{receiver_notes}}`
   - `{{admin_contact}}` - Admin contact mention
3. Click **Send Notifications** to notify all participants via Slack DM

### Gift Reminders

- First reminder: 7 days after notification at 10:00 AM local time
- Subsequent reminders: Daily at 10:00 AM local time
- Reminders stop when gift is marked as sent

---

## Troubleshooting

### Database Connection Issues

```bash
# Test your connection
psql $DATABASE_URL -c "SELECT 1"

# Check if tables exist
psql $DATABASE_URL -c "\dt"
```

### Slack Bot Not Responding

1. Verify the bot token is correct
2. Check that Event Subscriptions are enabled
3. Ensure the Request URL is publicly accessible
4. Check server logs for webhook errors

### Session Not Persisting

1. Ensure `SESSION_SECRET` is set
2. Check that cookies are enabled in your browser
3. Clear cookies and try logging in again

---

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utilities
├── server/                 # Express backend
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # API routes
│   └── storage.ts          # Database operations
├── shared/                 # Shared types
│   └── schema.ts           # Database schema & types
├── package.json
├── tsconfig.json
├── vite.config.ts
└── drizzle.config.ts
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with password |
| GET | `/api/auth/check` | Check authentication |
| GET | `/api/participants` | List all participants |
| POST | `/api/participants` | Create participant |
| PATCH | `/api/participants/:id` | Update participant |
| DELETE | `/api/participants/:id` | Delete participant |
| GET | `/api/events/current` | Get current event |
| POST | `/api/events/match` | Run matching algorithm |
| POST | `/api/events/notify` | Send notifications |
| GET | `/api/assignments` | Get all assignments |
| GET | `/api/exclusions` | List exclusions |
| POST | `/api/exclusions` | Add exclusion |
| GET | `/api/slack/status` | Check Slack connection |
| POST | `/api/slack/settings` | Save Slack settings |
| GET | `/api/slack/users` | Fetch Slack users |
| POST | `/api/slack/events` | Slack webhook endpoint |

---

## License

MIT License - Feel free to use and modify for your own Secret Santa events!
