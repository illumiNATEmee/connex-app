# Connex — MVP Specification

## The Question We're Testing

> Can a "third party" (Connex) reduce social friction enough to measurably increase real-world meetups among existing friend groups?

## MVP Hypothesis

If we make it effortless to:
1. Form a temporary group
2. Get a relevant activity suggestion
3. See commitment momentum build
4. Actually meet up

Then people will meet up MORE than they would have otherwise.

## Smallest Testable Version

### Option A: Telegram Bot (Recommended for v0)

**Why Telegram:**
- Rich bot API (buttons, inline keyboards)
- Easy to add to existing groups
- No app store approval
- Quick to iterate
- Users already have it

**What the bot does:**

1. **Add to group chat**
   - `/start` in any group → Connex joins
   - Reads group name, member count

2. **Suggest activity**
   - Trigger: Someone says "we should do something" OR `/suggest`
   - Bot asks: "What vibe? 🏃 Active / ☕ Chill / 🧘 Wellness / 🍽️ Food / 🎲 Surprise me"
   - Bot suggests 1-2 options based on vibe (hardcoded local options for MVP city)

3. **Commitment poll**
   - Inline buttons: "I'm in ✓" / "Maybe 🤔" / "Can't ✗"
   - Shows count in real-time
   - Bot nudges after 30 min: "2 people are in, 1 maybe. [Name], you in?"

4. **Make it happen**
   - Once 3+ commit: "Awesome! [Activity] at [Time]. Here's the location: [link]"
   - Reminder 1 hour before

**What it doesn't do (v0):**
- No location awareness (user specifies city/area)
- No mood inference (user picks)
- No trust graph (all equal)
- No cross-group suggestions
- No calendar integration

### Option B: WhatsApp (Harder but bigger reach)

**Challenge:** WhatsApp Business API is restrictive. Would need:
- Business account approval
- Template messages
- 24-hour response windows

**Could work for:** Founder-led beta with manual setup

### Option C: Web App with SMS/Link

**Flow:**
1. You create a "hangout" at connex.app/new
2. Add friends via phone number or share link
3. They get SMS or open link
4. Vote on activity + time
5. Connex confirms when quorum reached

**Pro:** No app download
**Con:** Less sticky, more friction than bot-in-chat

---

## Recommended MVP: Telegram Bot

### Build scope:

| Feature | Effort | Priority |
|---------|--------|----------|
| Bot setup + add to group | 2 days | P0 |
| Vibe selection UI | 1 day | P0 |
| Hardcoded activity suggestions (1 city) | 1 day | P0 |
| Commitment poll with counts | 2 days | P0 |
| Basic reminder | 1 day | P1 |
| Simple analytics (groups, polls, completions) | 1 day | P1 |

**Total:** ~1-2 weeks to functional MVP

### Test plan:

1. **Recruit 5-10 friend groups** (Nathan's network)
   - Mix: travel friends, work crews, hobby groups
   - Ideally in 1-2 cities to start (Bangkok + one other?)

2. **Success metrics:**
   - % of suggestions that lead to commitment
   - % of commitments that lead to actual meetup
   - Repeat usage (do groups use it again?)
   - Qualitative: "Did this make it easier?"

3. **Timeline:**
   - Week 1-2: Build bot
   - Week 3-4: Test with 5 groups
   - Week 5: Analyze, iterate

---

## What MVP Proves (or Disproves)

**If it works:**
- People DO want a third party to reduce friction
- Commitment momentum IS a real lever
- Activity suggestion adds value
→ Build toward full vision (app, trust graph, cross-sphere)

**If it fails:**
- Maybe group chat IS good enough
- Maybe suggestions don't add value
- Maybe the friction is elsewhere (finding time, not finding activity)
→ Learn and pivot

---

## Post-MVP Roadmap (if successful)

| Phase | What | Why |
|-------|------|-----|
| v0.1 | Telegram bot, 1 city, manual suggestions | Test core hypothesis |
| v0.2 | Location-aware suggestions (API: Yelp, Google Places) | Remove manual work |
| v0.3 | Cross-group: "Jake from [other group] is nearby" | Test trust graph lite |
| v1.0 | Native app, calendar integration, mood inference | Full experience |
| v2.0 | Trust graph, pattern breaking, planned serendipity | The real vision |

---

## Technical Stack (Telegram Bot MVP)

**Simple:**
- Node.js or Python
- Telegram Bot API (grammy or python-telegram-bot)
- Postgres or SQLite for state
- Hosted on Railway/Fly.io/Render

**Later:**
- Location APIs (Google Places, Yelp)
- Calendar APIs (Google Calendar, CalDAV)
- Push notifications (for native app)

---

---

## MVP v2 — WhatsApp Chat Analyzer (Pivoted Feb 4, 2026)

**Why the pivot:** Simpler, no bot APIs, no real-time infra. Just file processing + analysis.

### Technical Flow
1. User uploads `.txt` WhatsApp export file
2. Parser extracts messages, identifies members
3. Profile enrichment finds interests, locations, network roles
4. Smart suggestions generate meetup recommendations
5. Activity coordinator creates copy/paste poll messages

### Core Functions
- `parseWhatsAppText(fileContent)` → messages, members
- `enrichProfiles()` → interests, locations, activity levels
- `generateSmartSuggestions()` → meetup recommendations
- Message templates for group coordination

### MVP Goal
Upload chat → get actionable meetup suggestions

### Platform
Web app (likely built with Claude's help via GitHub repo `illumiNATEmee/connex-app`)

---

*Draft v1 — 2026-01-29*
*Updated v2 — 2026-02-04 (WhatsApp analyzer pivot)*
