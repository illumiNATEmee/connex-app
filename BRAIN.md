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

### Phase 1: Parser + Profiler (CURRENT)
**Goal:** Turn a WhatsApp export into rich member profiles

- [ ] WhatsApp chat export parser
- [ ] Member identification
- [ ] LLM-powered profile extraction
- [ ] Location detection
- [ ] Interest/affinity detection
- [ ] Store in structured format

**MVP Output:** JSON profiles for each member

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

**Stats:** ~2,500 lines of code, 7.7MB total (mostly node_modules)

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
