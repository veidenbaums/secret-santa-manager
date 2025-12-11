# Secret Santa App - Design Guidelines

## Design Approach

**System-Based with Festive Accents**: Using Material Design principles for a clean, functional admin tool with subtle holiday touches through typography and iconography. The focus is on usability and clarity for quick participant management while maintaining a warm, celebratory atmosphere.

## Typography

**Font Stack**: 
- Primary: Inter (Google Fonts) - for UI elements, forms, and body text
- Accent: Playfair Display (Google Fonts) - for headers and festive touches

**Hierarchy**:
- Page Headers: Playfair Display, 2.5rem (40px), Semi-bold
- Section Headers: Inter, 1.5rem (24px), Medium
- Card Titles: Inter, 1.125rem (18px), Medium
- Body Text: Inter, 1rem (16px), Regular
- Helper Text: Inter, 0.875rem (14px), Regular
- Button Text: Inter, 0.9375rem (15px), Medium

## Layout System

**Spacing Primitives**: Use Tailwind units of 3, 4, 6, 8, 12, and 16 for consistent spacing
- Component padding: p-6
- Section spacing: py-12 or py-16
- Card gaps: gap-6
- Form field spacing: space-y-4
- Button padding: px-6 py-3

**Container Strategy**:
- Main content: max-w-6xl mx-auto
- Form containers: max-w-2xl
- Cards: Full width within grid constraints

## Component Library

### Navigation
Fixed top navigation bar with app logo/title (left), main navigation links (center), and admin user indicator (right). Height: h-16. Include subtle shadow for depth.

### Dashboard Layout
Two-column grid on desktop (grid-cols-1 lg:grid-cols-2), single column on mobile:
- **Participants Management** (left): List of current participants with name, address, edit/delete actions
- **Secret Santa Control** (right): Date/time picker, participant count, trigger button, status indicator

### Participant Cards
Clean card design with:
- Participant name (bold, larger text)
- Full address (secondary text with icon)
- Action buttons (Edit icon, Delete icon) aligned right
- Subtle border, rounded corners (rounded-lg)
- Hover state with slight elevation

### Forms
**Add/Edit Participant Modal**:
- Centered modal overlay (max-w-md)
- Header with "Add Participant" or "Edit Participant" title
- Form fields:
  - Name input (full width)
  - Address input (full width, textarea for multi-line)
  - Save and Cancel buttons (inline, right-aligned)
- All inputs with clear labels above, proper spacing (space-y-4)

### Scheduling Section
Card containing:
- Large calendar icon
- Date picker input
- Time picker input
- "Participant count: X" indicator
- Prominent "Start Secret Santa" button
- Status badge showing "Not Started" / "Scheduled" / "Complete"

### Empty States
When no participants exist:
- Centered illustration area (use gift box or snowflake icon from Heroicons)
- "No participants yet" message
- "Add your first participant" subtext
- Large "Add Participant" button

### Notifications/Toasts
Top-right positioned toast notifications:
- Success: participant added/edited, Secret Santa sent
- Error: missing fields, Slack integration issues
- Info: scheduling confirmations

## Icons
**Icon Library**: Heroicons (CDN) exclusively

Key icons to use:
- User group icon for participants
- Calendar icon for scheduling
- Gift icon for Secret Santa features
- Plus icon for add actions
- Pencil icon for edit
- Trash icon for delete
- Check circle for success states
- Exclamation for errors

## Images

**Hero Section**: Small festive header banner (h-32 or h-40) at the top of the dashboard with a subtle winter/holiday pattern (snowflakes, ornaments). This is decorative, not a full viewport hero. Place the app title "Secret Santa Manager" centered over this banner with a semi-transparent backdrop blur for text readability.

**Empty State Illustrations**: Use Heroicons gift or sparkles icon at 4rem size for empty participant list state.

No other images required - this is a functional dashboard tool.

## Accessibility

- All form inputs include visible labels
- Buttons have clear, descriptive text
- Icons paired with text labels or aria-labels
- Focus states clearly visible on all interactive elements
- Sufficient contrast maintained throughout
- Modal traps focus appropriately

## Layout Patterns

**Main Dashboard Structure**:
1. Fixed navigation header (h-16)
2. Hero banner with app title (h-32)
3. Main content area (max-w-6xl, py-12)
   - Two-column grid for dashboard sections
   - Responsive: stacks to single column on mobile

**Responsive Breakpoints**:
- Mobile: Single column, full-width cards
- Tablet (md): Begin transitioning to two-column
- Desktop (lg): Full two-column layout with optimal spacing

**Visual Rhythm**:
- Consistent card elevation and spacing
- Grouped related actions
- Clear visual separation between management and control sections
- Breathing room around primary CTAs

This design balances holiday festivity with professional functionality, ensuring colleagues can quickly manage Secret Santa logistics while enjoying a pleasant, themed interface.