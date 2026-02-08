# Profile Builder

**Manual Input → Rich Profile Pipeline**

Built: 2026-02-07 | Status: ✅ **IMPLEMENTED**

## What's Working Now
- Phone number parsing → area code → city/region inference
- Social handle verification (Instagram, X, LinkedIn)
- User profile lookup from Supabase
- Completeness scoring
- Gap identification
- **Batch import** with CSV parsing

## Overview

Takes basic user inputs (name, phone, social handles) and builds a complete profile through:
1. Phone number parsing → city/region inference
2. Handle verification → check if profiles exist
3. Social enrichment → fetch bios, work history, interests from each platform
4. Profile merge → combine all data into unified view

## API Endpoints

### Full Profile Build
```
POST /api/profile/build
```

**Request:**
```json
{
  "name": "Sarah Chen",
  "phone": "+14155551234",
  "email": "sarah@example.com",
  "linkedin": "https://linkedin.com/in/sarahchen",
  "instagram": "sarahchen_sf",
  "x": "sarahchen"
}
```

**Response:**
```json
{
  "input": { ... },
  "user": { "id": "uuid", ... },
  "phone_info": {
    "area_code": "415",
    "city": "San Francisco",
    "state": "CA",
    "region": "Bay Area",
    "confidence": 0.7
  },
  "verifications": {
    "linkedin": { "exists": true, "username": "sarahchen" },
    "instagram": { "exists": true, "handle": "sarahchen_sf" },
    "x": { "exists": true, "handle": "sarahchen" }
  },
  "enrichments": {
    "linkedin": { "success": true, "data": { ... } },
    "instagram": { "success": true, "data": { ... } },
    "x": { "success": true, "data": { ... } }
  },
  "merged_profile": {
    "id": "uuid",
    "name": "Sarah Chen",
    "phone": "+14155551234",
    "phone_signals": { ... },
    "social": { ... },
    "work": { "title": "Product Designer", "company": "Stripe" },
    "education": [ ... ],
    "location": "San Francisco, CA",
    "interests": ["AI", "design", "yoga"],
    "skills": ["UX", "Figma", "prototyping"]
  },
  "completeness": 85,
  "gaps": ["email", "birthday"]
}
```

### Quick Profile Check (no enrichment)
```
POST /api/profile/quick
```

Same request format, but only runs verification (no LLM enrichment).
Faster, cheaper, good for initial validation.

### Phone Parser
```
GET /api/profile/phone/:phone
```

Parse a phone number and infer location.

**Example:**
```
GET /api/profile/phone/+16502294434

{
  "area_code": "650",
  "city": "San Mateo/Palo Alto",
  "state": "CA",
  "region": "Bay Area",
  "country": "USA/Canada",
  "confidence": 0.7
}
```

### Handle Verification
```
GET /api/profile/verify/:platform/:handle
```

Check if a handle exists on a platform.

**Platforms:** `instagram`, `ig`, `twitter`, `x`, `linkedin`

**Example:**
```
GET /api/profile/verify/x/elonmusk

{
  "handle": "elonmusk",
  "exists": true,
  "url": "https://x.com/elonmusk"
}
```

### Batch Import
```
POST /api/profile/batch
```

Process multiple profiles at once.

**Request:**
```json
{
  "profiles": [
    {"name": "Sarah Chen", "phone": "+14155551234", "instagram": "sarahchen_sf"},
    {"name": "Mike Wang", "phone": "+12125551234", "x": "mikew"}
  ],
  "quickMode": true,
  "concurrency": 3
}
```

**Response:**
```json
{
  "results": [
    {"index": 0, "input": {...}, "result": {...}, "success": true},
    {"index": 1, "input": {...}, "result": {...}, "success": true}
  ],
  "errors": [],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "avgCompleteness": 85
  }
}
```

### CSV Parse
```
POST /api/profile/parse-csv
```

Parse CSV text into profile objects.

**Request:**
```json
{
  "csv": "name,phone,linkedin,instagram,x\nSarah Chen,+14155551234,,,sarahchen"
}
```

**Response:**
```json
{
  "profiles": [{"name": "Sarah Chen", "phone": "+14155551234", "x": "sarahchen"}],
  "count": 1,
  "fields": ["name", "phone", "x"]
}
```

## Phone Area Code Coverage

- **California:** SF (415, 628), South Bay (650, 408), East Bay (510, 925), LA (213, 310, 323, 424, 818, 626), OC (949, 714), SD (858, 619)
- **New York:** NYC (212, 646, 917, 718, 347, 929), Long Island (516, 631), Westchester (914)
- **Texas:** Austin (512, 737), Dallas (214, 972, 469), Houston (713, 832, 281)
- **Florida:** Miami (305, 786), Fort Lauderdale (954), Orlando (407), Tampa (813)
- **Illinois:** Chicago (312, 773, 872, 847, 630)
- **Washington:** Seattle (206, 425), Tacoma (253)
- **Massachusetts:** Boston (617, 857, 781, 339)
- **Colorado:** Denver (303, 720)
- **Arizona:** Phoenix (480, 602, 623)
- **Georgia:** Atlanta (404, 678, 770)
- **DC Metro:** DC (202), NoVA (703, 571), Maryland (301, 240)

**International:**
- HK (852), Singapore (65), China (86), Japan (81), Korea (82), Taiwan (886)
- UK (44), Germany (49), France (33), Switzerland (41)
- Australia (61), Thailand (66), India (91), UAE (971)

## Files

- `profile-builder.js` — Main module with all functions
- `enrichment.js` — Social platform enrichment (LinkedIn, X, Instagram, GitHub)
- `index.js` — API endpoints

## Usage

```javascript
import { buildProfile, quickBuildProfile, parsePhoneNumber } from './profile-builder.js';

// Full build with enrichment
const result = await buildProfile({
  name: "Nathan Pang",
  phone: "+16502294434",
  linkedin: "https://linkedin.com/in/nathanielpang",
  x: "nathanpang"
});

// Quick verification only
const quick = await quickBuildProfile({
  name: "Test",
  phone: "+14155551234",
  instagram: "testuser"
});

// Just parse phone
const phoneInfo = parsePhoneNumber("+85212345678");
// → { country: "Hong Kong", region: "Asia Pacific" }
```

## Notes

- Instagram verification may fail due to rate limiting/blocking
- LinkedIn enrichment works best with public profiles
- Enrichment uses Claude for parsing search results
- All data saved to Supabase automatically
