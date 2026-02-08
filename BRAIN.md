# Connex Brain - Context Graph Engine

*Living document - always refining*

---

## 🎯 The Vision

**Planned Serendipity** - Meaningful connections happen automatically through contextual, frictionless suggestions.

### The Dream Flow:
1. Import a WhatsApp group chat
2. Connex profiles every member (role, location, interests, affinities)
3. The Brain suggests **activation events**:
   - 📍 Location-based coffee meetups
   - 📞 Zoom calls with contextual topics  
   - 🎤 Expert-led sessions (invite the right person to host)
   - ⚽ Affinity events (sports watch parties, UFC fights)
   - 🍻 IRL meetups for geographic clusters
4. Polls go out, people opt-in
5. Events happen, connections made
6. Success stories create FOMO → more engagement

**Key Insight:** Don't make people work. Automate the serendipity.

---

## 🧠 Working Backwards

### Desired Outcome
People in a group chat meet IRL or have meaningful conversations they wouldn't have had otherwise.

### What Drives That
- Right people matched (shared interests, complementary needs)
- Right format suggested (coffee vs call vs watch party)
- Right time/place found (calendars, locations)
- Low friction to say "yes"

### What Enables That

**Layer 1: Member Profiles**
- Identity: Name, role, company
- Location: City, timezone, neighborhoods
- Interests: Topics, hobbies, passions
- Expertise: What they know deeply
- Affinities: Sports teams, music, food preferences
- Needs: What they're looking for
- Offers: What they can provide
- Availability: Calendar patterns (optional)

**Layer 2: The Connex Brain (Matching Engine)**
- Cluster detection (who shares what)
- Geographic proximity scoring
- Complementary matching (needs ↔ offers)
- Affinity scoring
- Activity level weighting
- Recency bias (fresh context > stale)

**Layer 3: Activation Suggestions**
- Event type selection (based on cluster type)
- Participant curation (who should be there)
- Timing optimization
- Venue/platform suggestions

**Layer 4: Execution**
- Poll generation
- Calendar holds
- Venue booking (later)
- Reminder flows
- Post-event capture

**Layer 5: Flywheel**
- Success sharing (photos, testimonials)
- FOMO generation
- Profile enrichment from events
- Network expansion

---

## 🏗️ Build Priorities

### Phase 1: Parser + Profiler (COMPLETE)
**Goal:** Turn a WhatsApp export into rich member profiles

- [x] WhatsApp chat export parser
- [x] Member identification
- [x] LLM-powered profile extraction
- [x] Location detection
- [x] Interest/affinity detection
- [x] Store in structured format

**MVP Output:** JSON profiles for each member ✅

### Phase 1.5: Who Is This? (IN PROGRESS)
**Goal:** Contact memory — never forget where you met someone

- [x] Phone number normalization (E.164)
- [x] Phone metadata extraction (country, area code, likely city)
- [x] Contact save with context (timestamp + location + tags + category)
- [x] Lookup API: query by phone → full context card
- [x] Search API: query by name/context/tags
- [x] Related contacts (same time = same event inference)
- [x] Mystery contacts list (contacts with no context)
- [x] LLM-powered context inference from sparse signals
- [x] Bulk import endpoint
- [x] Stats endpoint
- [ ] Voice note transcription (Whisper integration)
- [ ] Calendar correlation engine (needs calendar API)
- [ ] Social enrichment (LinkedIn, Twitter by phone)
- [ ] Mutual contact detection
- [ ] Mobile UI for capture + lookup

**MVP Output:** "Who is +1-415-555-1234?" → Full context card ✅

### Phase 2: The Brain Core
**Goal:** Generate match scores and suggestions

- [ ] Cluster detection algorithm
- [ ] Geographic grouping
- [ ] Affinity matching
- [ ] Complementary needs matching
- [ ] Suggestion generation

**MVP Output:** "These 4 people should grab coffee in SF"

### Phase 3: Activation Layer
**Goal:** Make suggestions actionable

- [ ] Poll generation
- [ ] Simple scheduling
- [ ] Venue suggestions (Google Places API)
- [ ] WhatsApp message formatting

**MVP Output:** Ready-to-send polls and invites

### Phase 4: Feedback Loop
**Goal:** Learn and improve

- [ ] Track opt-ins
- [ ] Capture event outcomes
- [ ] Refine matching weights
- [ ] Build success stories

---

## 📊 Profile Schema

```json
{
  "id": "phone_or_hash",
  "name": "Sarah Chen",
  "phone": "+1...",
  "role": "Product Designer",
  "company": "Stripe",
  "industry": "Fintech",
  "location": {
    "city": "San Francisco",
    "neighborhood": "SOMA",
    "timezone": "America/Los_Angeles",
    "coordinates": [37.78, -122.41]
  },
  "interests": ["AI", "design systems", "meditation"],
  "expertise": ["UX research", "prototyping", "design ops"],
  "affinities": {
    "sports": ["Warriors", "49ers"],
    "food": ["ramen", "natural wine"],
    "other": ["running", "book clubs"]
  },
  "looking_for": ["technical cofounder", "ML engineers"],
  "offering": ["design mentorship", "portfolio reviews"],
  "activity_score": 0.8,
  "last_active": "2026-01-28",
  "context_sources": [
    {"type": "intro", "confidence": 0.9, "date": "2026-01-15"},
    {"type": "mention", "confidence": 0.7, "date": "2026-01-20"}
  ]
}
```

---

## 🎪 Activation Types

| Type | Trigger | Size | Format |
|------|---------|------|--------|
| Coffee Chat | 2 people, same city, complementary | 2 | IRL, casual venue |
| Expert Call | Someone has expertise others need | 3-8 | Zoom, structured |
| Watch Party | Shared affinity (sports/UFC) | 4-12 | Bar/home, social |
| Topic Dinner | Interest cluster | 4-8 | Restaurant, discussion |
| Coworking Day | Same city, remote workers | 3-6 | Café/space, work |
| Walking Meeting | 2 people, need to talk | 2 | Outdoor, movement |

---

## 🔍 Matching Signals (Weighted)

| Signal | Weight | Source |
|--------|--------|--------|
| Same city | 0.9 | Location |
| Shared interest | 0.7 | Interests |
| Complementary need | 0.8 | Looking for ↔ Offering |
| Same affinity | 0.6 | Sports, hobbies |
| Recent activity | 0.5 | Message recency |
| Direct mention | 0.8 | One mentioned other |
| Same industry | 0.4 | Company/role |

---

## 🔬 Creative Data Extraction

**Key insight:** Unique, hard-to-find facts build the strongest relationships. Get creative.

### Phone Number Signals
- **Area codes** → Original or current city (with caveat: people move but keep numbers)
- **Country codes** → International members (+852 HK, +65 SG, +886 Taiwan)
- **Confidence:** Low for location, high for "has ties to" region

### Message Timing Patterns  
- Peak activity hours → Timezone inference
- Response speed → Engagement level
- Day-of-week patterns → Work schedule hints

### Text Extraction
- **Location mentions:** "I'll be in Tokyo next week", "Based in SF"
- **Travel patterns:** "Just landed", "Flying to", "Visiting"
- **Role/company signals:** "I'm a VP at...", "Work at Stripe"
- **Birthday/age:** "Turning 40", "March 12 birthday"
- **Family status:** Spouse names, kids mentioned

### Email Domain Signals
- Corporate domains → Company (stripe.com, google.com)
- .edu domains → University/school
- Country TLDs → Location hints (.hk, .sg, .tw)

### Link Sharing
- LinkedIn profiles → Full professional context
- Personal sites → Deeper interests
- Company links → What they're building

### Affinity Detection
- Sports team mentions → Watch party potential
- Food/restaurant mentions → Dinner group curation
- Hobby mentions → Activity matching
- Health/wellness → Shared lifestyle

### Name Patterns
- Chinese names → Cultural background, potential language skills
- Nicknames → Personality hints, how they want to be known

### Interaction Patterns
- Who replies to whom → Relationship strength
- Who gets mentioned → Social capital
- Who organizes → Natural leaders

---

## 🔗 2nd Degree Network Intelligence

### The Insight
"I know Arul. Arul knows 30 people. Who in his network should I meet — and why?"

**This is the killer use case.** Not just "help groups coordinate" but "unlock your 2nd-degree network through intelligent matching."

### How It Works

**Input:**
1. YOUR profile (interests, location, expertise, needs, offers) — entered manually or extracted from your own chats
2. A FRIEND'S group chat export — their network you want to tap into

**Process:**
1. Brain profiles everyone in the group
2. Scores each person against YOUR profile:
   - Shared interests → potential friendship
   - Complementary needs/offers → potential collaboration
   - Same city → easy to meet IRL
   - Same industry → professional value
   - Shared affinities → instant rapport (sports, food, hobbies)
3. Ranks matches by relevance + ease of intro

**Output:**
- Ranked list: "Top 5 people Arul should introduce you to"
- For each match: WHO they are, WHY you'd click, WHAT to talk about
- Pre-written intro request message: "Hey Arul, could you intro me to Chris? We're both into crypto and he's in Bangkok next month"
- Pre-written intro message for Arul to forward

### Match Scoring

```
match_score = (
  shared_interests * 0.25 +
  complementary_needs * 0.30 +    # Highest weight — mutual value
  geographic_proximity * 0.20 +
  industry_overlap * 0.15 +
  affinity_match * 0.10
)
```

### Trust Layer (from TRUST_TRANSFER.md)
- Your trust in the connector (Arul) weights the suggestions
- High trust connector → suggest more intimate intros (1:1 coffee)
- Low trust connector → suggest group settings first
- Connector's "intro track record" shown alongside suggestions

### User Flow (MVP)
```
1. "I want to find connections through a friend"
2. Enter YOUR profile (name, city, interests, looking_for)
3. Upload FRIEND'S group chat
4. Connex Brain analyzes → matches → ranks
5. Shows: "Top matches for you in Arul's network"
6. Copy intro request message → send to Arul
```

### Why This Wins
- LinkedIn shows you 2nd-degree connections but with ZERO context
- Connex has the ACTUAL conversation data — what people care about, how they talk, what they need
- A WhatsApp chat reveals more about someone than their LinkedIn profile ever will

---

## 📊 Profile Enrichment Sources

### LinkedIn (Priority 1 — Built)
- User pastes LinkedIn URL or profile text
- Brain extracts: role, company, skills, education, experience
- Infers: looking_for, offering, connection_hooks
- **Power move:** Alumni networks + past company overlap = non-obvious connections
- **API endpoint:** `/api/linkedin`

### Future Sources (Priority 2+)
- **X/Twitter** — interests, opinions, who they follow
- **Google OAuth** — calendar (availability), contacts (network mapping)
- **Spotify** — music taste for affinity matching
- **Multi-chat upload** — cross-reference across groups to find hidden connectors
- **Manual form** — quick onboarding wizard as fallback

### Enrichment Pipeline
```
Upload chat → Profile everyone from messages
    ↓
Optional: Add LinkedIn URLs for key members
    ↓
Brain merges chat behavior + professional background
    ↓
DEEP matching: not just "both like UFC" but "both Stanford MBA,
   one needs a CTO, the other just left Google, both in Bangkok"
```

---

## 🔍 Who Is This? — Contact Memory

### The Problem
You saved a contact months ago. Now they text you. You have no idea who they are, where you met, or why you have their number.

This is **universal** — everyone has mystery contacts. And it's a trust killer: replying "sorry, who is this?" is awkward and damages relationships.

### The Solution
Connex becomes your **contact memory** — capturing context when you add contacts and recalling it when you need it.

### Data Capture (Save Time)

**Automatic signals:**
- **Timestamp** — When you saved the contact
- **Location** — Where you were (GPS/approximate)
- **Calendar correlation** — What event was happening? (Conference? Dinner?)
- **Recent messages** — Did they text you first? What did they say?
- **Nearby WiFi/venue** — "Saved at Devcon Bangkok" (if detectable)

**Prompted context (low friction):**
- Quick voice note: "Met at Devcon, works on DeFi infrastructure"
- Photo together (optional)
- Tags: `#devcon` `#defi` `#bangkok`
- One-tap categories: Work / Social / Dating / Service / Random

**Enrichment (background):**
- Reverse phone lookup (carrier, region)
- Social search (LinkedIn, Twitter, Instagram by phone)
- Mutual connections (do any of your contacts know them?)
- WhatsApp profile photo + status

### Data Recall (Lookup Time)

**Query:** "Who is +1-415-555-1234?"

**Response:**
```
📱 Sarah Chen
━━━━━━━━━━━━━━━━━━━━━━━━
📍 Met: Devcon Bangkok, Nov 12 2024
📝 Context: "DeFi infrastructure, interested in institutional tools"
🏢 LinkedIn: Product @ Stripe
📸 [Photo from that night]
💬 First message: "Hey! Great meeting you at the party"
🔗 Mutual: You both know @ArulM, @Kevin_FF
━━━━━━━━━━━━━━━━━━━━━━━━
```

### Integration Points

**Phone-level (ideal):**
- iOS Shortcuts / Android automation on contact save
- Trigger Connex capture flow

**App-level (MVP):**
- Manual add: paste number + voice note
- Batch import: scan contacts, enrich what's possible
- Lookup: search by number, name, or context

**WhatsApp integration:**
- When someone messages, auto-lookup in Connex
- Show context card before you reply

### Smart Features

**1. Time-Location Correlation**
- "You saved this contact on March 15, 2024"
- "You were at SXSW Austin that week"
- "Your calendar shows 'Drinks with Austin crypto people' that evening"
- → **Inference:** Probably met at SXSW crypto meetup

**2. Message Archaeology**
- Search your chat history with this number
- First message often reveals context
- "Hey, great meeting you at John's wedding!"

**3. Social Graph Lookup**
- Check if mutual friends know them
- "Ask Kevin — you were both at that dinner"

**4. Degraded Recall**
Even with NO context captured, Connex can still help:
- Area code analysis: "Bay Area number, saved while you were in SF"
- Calendar check: "You had 3 events that day — any ring a bell?"
- Contact proximity: "Saved within 5 min of saving 'Mike Crypto' — same event?"

### Privacy Model

- All data stored locally (or encrypted cloud)
- No sharing of contact context without explicit consent
- "Who Is This?" lookup is private — only you see it
- Optional: Ask the person directly with a friendly template

### User Flows

**Flow 1: Save with Context**
```
[Save contact in phone]
     ↓
[Connex notification: "Add context for Sarah Chen?"]
     ↓
[Tap → voice note / photo / tags / skip]
     ↓
[Context saved with timestamp + location]
```

**Flow 2: Lookup Mystery Contact**
```
[Get text from unknown number]
     ↓
[Open Connex → "Who Is This?"]
     ↓
[See full context card]
     ↓
[Reply confidently]
```

**Flow 3: Batch Enrich**
```
[Import contacts to Connex]
     ↓
[Brain enriches: LinkedIn, socials, mutual connections]
     ↓
[Flag contacts with zero context]
     ↓
[Prompt: "You have 47 mystery contacts. Want to review?"]
```

### Why This Wins

1. **Universal problem** — Everyone has mystery contacts
2. **Immediate value** — No network effect needed, works solo
3. **Trust builder** — Remembering context = stronger relationships
4. **Data moat** — Your contact memory becomes invaluable over time
5. **Connex hook** — Users engage daily, not just for events

### Technical Notes

**Phone number normalization:**
- Store E.164 format: +14155551234
- Handle: (415) 555-1234, 415-555-1234, +1 415 555 1234
- International: +852, +65, +44 etc.

**Fuzzy matching:**
- Name variations: "Sarah", "Sarah Chen", "S. Chen"
- Number variations: With/without country code
- Nickname matching: "Big Mike" → "Michael Thompson"

### Schema Addition

```json
{
  "contact_memory": {
    "phone": "+14155551234",
    "name": "Sarah Chen",
    "saved_at": "2024-11-12T22:30:00Z",
    "saved_location": {
      "lat": 13.7563,
      "lng": 100.5018,
      "venue": "Devcon Bangkok",
      "city": "Bangkok"
    },
    "capture_method": "voice_note",
    "context_raw": "Met at Devcon, works on DeFi infrastructure at Stripe",
    "tags": ["devcon", "defi", "bangkok", "work"],
    "category": "work",
    "photo_url": null,
    "calendar_correlation": {
      "event": "Devcon Bangkok - Day 2",
      "confidence": 0.85
    },
    "enrichment": {
      "linkedin": "linkedin.com/in/sarahchen",
      "twitter": "@sarahbuilds",
      "company": "Stripe",
      "role": "Product Manager",
      "mutual_contacts": ["+1234...", "+5678..."]
    },
    "first_message": {
      "date": "2024-11-13",
      "text": "Hey! Great meeting you at the party last night",
      "direction": "inbound"
    },
    "last_contacted": "2025-01-15",
    "interaction_count": 12
  }
}
```

---

## ❓ Open Questions

- How to get calendar data? (Cal.com integration? Calendly?)
- WhatsApp bot limitations (official API vs workarounds)
- Privacy: How to handle profile visibility?
- Cold start: What if chat history is sparse?
- Multi-group: Same person in multiple groups?
- How to measure success? (survey? activity tracking?)

---

## 💡 Key Principles

1. **Inference > Asking** - Build profiles from behavior, not forms
2. **Opt-in activation** - Profiles auto-build, events require consent  
3. **Show don't tell** - Success stories > feature explanations
4. **Frictionless first** - One-tap responses, pre-filled everything
5. **FOMO as feature** - Public wins drive engagement

---

## 📦 Current Build Status (MVP)

### Completed Components
- ✅ `parser.js` - WhatsApp export → structured data
- ✅ `profiler.js` - LLM-powered profile extraction
- ✅ `extractors.js` - Phone, location, travel, affinity extraction
- ✅ `enrich.js` - Profile enrichment + interaction graph + network analysis
- ✅ `smart-suggester.js` - Scored activation suggestions
- ✅ `poll-generator.js` - Ready-to-send WhatsApp messages + reports
- ✅ `visualize.js` - Interactive D3.js network graph
- ✅ `location-map.js` - Geographic cluster visualization
- ✅ `index.js` - Main API entry point
- ✅ `run-pipeline.sh` - One-command pipeline runner
- ✅ `contact-memory.js` - Who Is This? contact memory engine (NEW)
- ✅ `migrations/002_contact_memory.sql` - Database schema (NEW)

**Stats:** ~3,000+ lines of code

### Test Results (FF Fraternity Chat)
- 28 members profiled
- 186 interactions mapped
- **Key insights:**
  - Lawrence Liu: 6 messages but mentioned by 20 people (hidden hub)
  - Howie FF: 3 messages but mentioned by 16 (valuable lurker)
  - Ewing & Kelvin: Both 5-handicap golfers at TD Bank (unexpected match)
  - 6 LA members never met IRL despite 8 months in chat

### Next Priorities
1. Fix duplicate handling in affinity clustering
2. Add phone number enrichment to profiles
3. Build simple HTML network visualization
4. Test with more chat exports
5. Add calendar signal extraction

---

*Last updated: 2026-01-30*
