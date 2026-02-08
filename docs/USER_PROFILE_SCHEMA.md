# User Profile Schema — Deep Identity Graph

## Philosophy

Your profile isn't just "name + job". It's a **multi-dimensional identity graph** that captures:
- Who you ARE (identity, background)
- Who you WERE (history, trajectory)  
- Who you KNOW (existing relationships)
- What you WANT (goals, seeking)
- What you OFFER (value, expertise)
- How you CONNECT (communication style, preferences)

Every dimension creates potential **match surfaces** with other people.

---

## Core Identity

```yaml
identity:
  name:
    full: "Nathan Huie"
    preferred: "Nathan"
    nicknames: []
    pronunciation: null  # helps with intros
  
  contact:
    phone: "+1-650-229-4434"
    email: "nathan.huie@gmail.com"
    emails_alt: []  # work, other accounts
  
  demographics:
    birthday: "1983-08-06"
    age: 42
    gender: null  # optional
    pronouns: null  # optional
  
  location:
    current:
      city: "Bangkok"
      country: "Thailand"
      timezone: "Asia/Bangkok"
      neighborhood: null
      coordinates: [13.7563, 100.5018]
    
    home_base:  # where you "really" live
      city: null
      country: "USA"
    
    frequent:  # cities you're often in
      - city: "San Francisco"
        frequency: "monthly"
      - city: "Los Angeles"
        frequency: "quarterly"
    
    travel_patterns:
      style: "digital_nomad"  # settled | frequent_traveler | digital_nomad
      upcoming: []  # known future trips
```

---

## Professional Identity

```yaml
professional:
  current_role:
    title: null
    company: null
    industry: null
    started: null
    description: null
  
  work_history:
    - title: null
      company: null
      industry: null
      location: null
      start_date: null
      end_date: null
      highlights: []
      connections_made: []  # people you know from here
  
  industries:
    primary: []  # industries you work in
    interested: []  # industries you follow
    expertise: []  # industries you know deeply
  
  skills:
    technical: []
    business: []
    soft: []
    languages: []
  
  achievements:
    - type: null  # award | milestone | press | speaking
      title: null
      date: null
      url: null
  
  investor_profile:  # if applicable
    type: null  # angel | vc | lp | none
    check_size: null
    thesis: null
    portfolio: []
  
  founder_profile:  # if applicable
    companies: []
    exits: []
    currently_building: null
    fundraising: false
```

---

## Education & Credentials

```yaml
education:
  schools:
    - name: null
      type: "university"  # high_school | university | bootcamp | course
      degree: null
      field: null
      location: null
      start_year: null
      end_year: null
      activities: []  # clubs, sports, etc.
      notable_connections: []  # people you know from here
  
  certifications: []
  
  courses:  # notable online courses, programs
    - name: null
      platform: null
      year: null
  
  alumni_networks:  # active memberships
    - school: null
      chapter: null
      active: true
```

---

## Interests & Affinities

```yaml
interests:
  # These create "instant rapport" surfaces
  
  sports:
    teams:
      - name: "Golden State Warriors"
        league: "NBA"
        intensity: "die_hard"  # casual | follow | die_hard
      - name: "San Francisco 49ers"
        league: "NFL"
        intensity: "follow"
    
    activities:
      - name: "golf"
        level: "beginner"  # beginner | intermediate | advanced
        frequency: null
      - name: "UFC"
        type: "spectator"
    
    fantasy_leagues: []
  
  wellness:
    practices:
      - type: "sauna"
        frequency: "weekly"
      - type: "ice_bath"
        frequency: "weekly"
    fitness: []
    diet: null
  
  food:
    cuisines: ["Thai", "Japanese", "boat noodles"]
    dietary: null  # vegan | vegetarian | etc
    favorite_spots: []  # by city
    cooking: false
  
  entertainment:
    music:
      genres: []
      artists: []
      concerts: true
    
    movies_tv:
      genres: []
      favorites: []
    
    podcasts: []
    books: []
    games: []
  
  hobbies:
    - name: null
      level: null
      social: true  # do with others?
  
  causes:  # things you care about
    - topic: null
      involvement: null  # aware | donor | volunteer | leader
```

---

## Social Graph (Existing Relationships)

```yaml
relationships:
  # Who you already know — manual + imported
  
  inner_circle:  # would call at 2am
    - name: null
      relationship: null  # friend | family | mentor
      context: null  # how you met
      location: null
  
  professional_network:
    - name: null
      relationship: null  # colleague | investor | advisor
      company: null
      last_contact: null
  
  communities:  # groups you're part of
    - name: "FF Fraternity"
      type: "professional"  # professional | social | hobby | alumni
      role: "member"  # member | organizer | founder
      size: 28
      activity: "active"
      platform: "WhatsApp"
  
  connectors:  # super-networkers you know
    - name: null
      spheres: []  # what worlds they connect
      intro_quality: null  # how good are their intros
```

---

## Goals & Seeking

```yaml
goals:
  # What you're trying to achieve — drives matching
  
  professional:
    short_term:  # next 3-6 months
      - goal: null
        type: null  # hire | fundraise | learn | launch
        specifics: null
    
    long_term:
      - goal: null
        timeline: null
  
  personal:
    - goal: "lose 10-15 lbs"
      timeline: null
      accountability: "weekly"
  
  seeking:  # who/what you're looking for
    people:
      - type: "technical_cofounder"
        criteria: null
        urgency: null
      - type: "friends_in_bangkok"
        criteria: null
    
    opportunities:
      - type: null  # job | investment | partnership
        criteria: null
    
    knowledge:
      - topic: null
        depth: null  # intro | deep_dive
  
  offering:  # what you can provide others
    expertise:
      - topic: null
        availability: null  # coffee_chat | advisory | consulting
    
    introductions:
      - to_whom: null  # types of people you can intro
        quality: null
    
    resources:
      - type: null  # funding | tools | space
```

---

## Communication Style

```yaml
communication:
  # How you prefer to connect — affects suggestions
  
  preferences:
    intro_style: "warm"  # warm | direct | group_first
    meeting_preference: "in_person"  # in_person | video | async
    response_time: "within_day"
    best_times: ["morning", "evening"]
  
  personality:
    mbti: "ENTP"
    working_style: "fast_paced"  # methodical | fast_paced | flexible
    social_energy: "extrovert"
    
  topics_love: []  # conversation topics you enjoy
  topics_avoid: []  # things you don't discuss
  
  icebreakers:  # things that work well when meeting you
    - "Ask about latest startup idea"
    - "UFC fights"
    - "Bangkok recommendations"
```

---

## Social Profiles (for enrichment)

```yaml
social:
  linkedin:
    url: null
    connected: false  # have we scraped?
  
  twitter:
    handle: null
    connected: false
  
  instagram:
    handle: null
    connected: false
  
  github:
    handle: "illumiNATEmee"
  
  other:
    - platform: null
      handle: null
```

---

## Meta & Confidence

```yaml
meta:
  created_at: null
  updated_at: null
  completeness: 0.0  # 0-1 how complete is profile
  
  sources:
    - type: "manual"  # manual | linkedin | chat_import | enrichment
      date: null
      fields_updated: []
  
  confidence:
    # Per-field confidence scores
    location: 0.9
    professional: 0.5
    interests: 0.7
```

---

## Sphere Generation Logic

With this profile, we can generate spheres:

**Alumni Sphere:**
- Match: Same school + overlapping years
- Signal: Shared activities, mutual connections

**Industry Sphere:**
- Match: Same industry + role level
- Signal: Complementary skills, similar challenges

**Geographic Sphere:**
- Match: Same city + similar interests
- Signal: Easy to meet IRL

**Interest Sphere:**
- Match: Shared hobby/team/cause
- Signal: Instant rapport, natural conversation

**Goal Sphere:**
- Match: Complementary seeking/offering
- Signal: Mutual value exchange

---

## Implementation Priority

1. **Core Identity** — name, contact, location
2. **Professional** — current + history (LinkedIn import)
3. **Interests** — sports, wellness, food (high rapport value)
4. **Goals** — seeking/offering (drives matching)
5. **Social Graph** — existing relationships
6. **Communication** — preferences (better suggestions)
