# Connex — WhatsApp Group Chat Intelligence

**Analyze WhatsApp group chat exports to generate meetup suggestions and coordination tools.**

## What It Does

Connex is a static chat analysis tool (not a real-time app). Upload a `.txt` WhatsApp export and get:

1. **Member Profiles** — activity level, interests, location, network role
2. **Network Analysis** — hubs (most referenced), connectors (most engaging), lurkers
3. **Smart Meetup Suggestions** — grouped by city + shared interest with confidence scores
4. **Activity Coordinator** — pre-filled poll messages ready to copy/paste into WhatsApp
5. **DM Strategy** — ranked "who to message first" based on influence scoring

## Flow

```
📁 Upload .txt  →  🧠 Parse & Enrich  →  🎯 Suggestions  →  📋 Copy Poll Message
```

## Architecture

```
connex-app/
├── src/
│   ├── connex-engine.js    # Core analysis pipeline (standalone, no dependencies)
│   └── ConnexApp.jsx       # React UI (single-file, uses engine inline)
├── README.md
└── package.json            # For local dev (optional)
```

### Engine Pipeline

```javascript
parseWhatsAppText(chatText)   // → { messages, members, stats }
enrichProfiles(parsedChat)     // → [{ interests, location, mentions, activity_level }]
analyzeNetwork(profiles)       // → { hubs, connectors, lurkers, nodeMetrics }
generateSuggestions(profiles)  // → [{ type, participants, location, confidence }]
getDMStrategy(profiles)        // → [{ rank, name, reasons }]
```

### Key Design Decisions

- **Keyword-based extraction** — interests/locations found via keyword matching against message text (no NLP/ML dependencies)
- **Confidence scoring** — based on keyword hit ratio per category and group size
- **Activity mapping** — suggestions map to specific activity templates (e.g., `tech → co-working`, `sports → UFC watch party`)
- **Single-file React** — entire UI + engine in one `.jsx` for easy deployment as a Claude artifact or standalone app

## Interest Categories

| Category | Keywords (sample) | Maps To |
|----------|-------------------|---------|
| Sports | ufc, mma, warriors, golf, basketball | 🥊 UFC Watch Party |
| Crypto | bitcoin, ethereum, trading, blockchain | ₿ Crypto Discussion |
| Food | dim sum, sushi, brunch, restaurant | 🍜 Food Meetup |
| Wellness | sauna, ice bath, yoga, meditation | 🧘 Wellness Session |
| Tech | ai, startup, coding, engineering | 💻 Co-working Day |
| Business | fundraising, investor, funding, strategy | ☕ Business Coffee |

## Running Locally

```bash
# Option 1: Use with any React setup (Vite, CRA, Next.js)
# Copy ConnexApp.jsx into your project and import it

# Option 2: Quick local dev
npm install
npm run dev
```

## How to Use

1. Open WhatsApp → Group Chat → ⋮ → Export Chat → Without Media
2. Upload the `.txt` file (or click "Load Demo Data")
3. Browse tabs: Overview → Members → Meetups → DM Strategy
4. Click "Use This →" on any suggestion to load the Activity Coordinator
5. Customize activity type, remove participants if needed
6. Click "Copy Message" and paste into your WhatsApp group

## Known Limitations

- Keyword matching is English-only and case-insensitive
- Location detection relies on city name mentions (no GPS/geolocation)
- Confidence scores are heuristic, not ML-based
- Single-word city abbreviations (LA, SF, HK) may produce false positives
- `findMentions` uses first-name matching which can create false positives for common names

## Future Ideas

- [ ] LLM-powered interest extraction (use Claude API for semantic analysis)
- [ ] Multi-chat analysis (merge exports from multiple groups)
- [ ] Time-based activity patterns (when are people most active?)
- [ ] Venue suggestions via Google Places API
- [ ] Export profiles as JSON/CSV
- [ ] Persistent storage for tracking meetup outcomes

## License

MIT
