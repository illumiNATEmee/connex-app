# Connex — Product Flow (Definitive)

## New User Journey

```
1. REGISTER    → Google OAuth (one tap)
2. ENRICH      → Provide LinkedIn URL, X handle, IG username
3. UPLOAD      → WhatsApp group export (.txt)
4. BRAIN       → Scrapes all sources, builds YOUR profile + profiles everyone in the group
5. MATCH       → Cross-references you against all group members
6. CONNECT     → Shows ranked connections with ready-to-send intro messages
```

## Step 1: Google OAuth Registration

- One-tap sign up / login
- Gets: name, email, profile photo
- Creates Connex account
- Future: Calendar access (availability), Contacts (network graph)

## Step 2: Profile Enrichment (Scrapers)

User provides 3 URLs/handles. Brain scrapes each:

### LinkedIn Scraper
- **Input:** LinkedIn profile URL
- **Extracts:** Role, company, industry, skills, education, experience history
- **Infers:** Expertise depth, career trajectory, alumni networks, looking_for, offering
- **Endpoint:** `/api/linkedin`

### X/Twitter Scraper  
- **Input:** @handle
- **Extracts:** Bio, interests, opinions, communities, tone, who they engage with
- **Infers:** Personality, values, niche interests, conversation style
- **Endpoint:** `/api/twitter`

### Instagram Scraper
- **Input:** @username
- **Extracts:** Bio, location, content themes, lifestyle signals
- **Infers:** Travel patterns, hobbies, food preferences, social style, aesthetic/vibe
- **Endpoint:** `/api/instagram`

### Profile Merge
Brain combines all sources into ONE rich profile:
```json
{
  "identity": { "name", "email", "photo" },           // Google
  "professional": { "role", "company", "skills" },     // LinkedIn
  "personality": { "tone", "opinions", "interests" },  // X/Twitter
  "lifestyle": { "travel", "food", "hobbies" },        // Instagram
  "behavior": { "communication_style", "activity" },   // WhatsApp
  "needs": { "looking_for", "offering" },              // Inferred from ALL
  "connection_hooks": []                                // Non-obvious gems
}
```

## Step 3: WhatsApp Upload

- User uploads `.txt` export from a group chat
- Brain profiles every member from their messages
- Enriches with any available LinkedIn/X/IG data for members (future: auto-lookup)

## Step 4: Brain Analysis

For EACH member in the group, Brain asks:
1. Who is this person? (from chat messages)
2. What do they care about?
3. Where are they?
4. What do they need? What can they offer?

Then cross-references against the USER'S enriched profile:
5. What do they have in common?
6. What's complementary?
7. What's the non-obvious connection?
8. What would they talk about?

## Step 5: Connection Output

Ranked list of matches:
- **Who:** Name + mini profile
- **Score:** Match percentage
- **Why:** Specific reasons (shared + complementary)
- **Starter:** What to talk about
- **Intro message:** Ready to copy and send to the connector

## Architecture

```
┌──────────────┐
│  Google OAuth │ ─→ Account + basic identity
└──────┬───────┘
       │
┌──────┴───────┐
│  Scraper Hub │
│  ├─ LinkedIn │ ─→ Professional profile
│  ├─ X/Twitter│ ─→ Personality + interests  
│  ├─ Instagram│ ─→ Lifestyle + vibes
│  └─ WhatsApp │ ─→ Communication + behavior
└──────┬───────┘
       │
┌──────┴───────┐
│ Connex Brain │ ─→ Merged profile + matching
│  (Claude AI) │
└──────┬───────┘
       │
┌──────┴───────┐
│  Connections │ ─→ Ranked matches + intro messages
└──────────────┘
```

## Data Storage (Vercel + DB)

- **User accounts:** Supabase or Firebase (free tier)
- **Profiles:** Stored after enrichment (don't re-scrape every time)
- **Chat analysis:** Cached results per group
- **Connections:** Saved matches + status (intro sent, connected, met IRL)

---

*Defined: 2026-02-04*
