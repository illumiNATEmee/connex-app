-- ═══════════════════════════════════════════════════════════
-- CONNEX USER PROFILE SCHEMA v2
-- Deep identity graph for sphere generation
-- ═══════════════════════════════════════════════════════════

-- Drop old simple profiles table if exists (we're upgrading)
-- ALTER TABLE profiles RENAME TO profiles_v1;

-- ═══════════════════════════════════════════════════════════
-- CORE USER (the "YOU" at center of everything)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core identity
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  name_full TEXT NOT NULL,
  name_preferred TEXT,
  nicknames TEXT[] DEFAULT '{}',
  
  -- Demographics
  birthday DATE,
  
  -- Location
  location_current JSONB DEFAULT '{}',  -- {city, country, timezone, coordinates}
  location_home JSONB DEFAULT '{}',
  locations_frequent JSONB DEFAULT '[]',  -- [{city, frequency}]
  travel_style TEXT,  -- settled | frequent_traveler | digital_nomad
  
  -- Personality & Style
  mbti TEXT,
  communication_prefs JSONB DEFAULT '{}',
  
  -- Meta
  profile_completeness FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- PROFESSIONAL HISTORY
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS work_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  title TEXT,
  company TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  
  start_date DATE,
  end_date DATE,  -- NULL = current
  is_current BOOLEAN DEFAULT false,
  
  description TEXT,
  highlights TEXT[] DEFAULT '{}',
  skills_used TEXT[] DEFAULT '{}',
  
  -- For sphere matching
  company_size TEXT,  -- startup | smb | enterprise
  role_level TEXT,  -- ic | lead | director | vp | c_level | founder
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- EDUCATION
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  institution TEXT NOT NULL,
  institution_type TEXT,  -- high_school | university | bootcamp | course
  degree TEXT,
  field_of_study TEXT,
  location TEXT,
  
  start_year INT,
  end_year INT,
  
  activities TEXT[] DEFAULT '{}',  -- clubs, sports, orgs
  honors TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- INTERESTS & AFFINITIES (high rapport surfaces)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  category TEXT NOT NULL,  -- sports | wellness | food | music | tech | etc
  subcategory TEXT,
  
  name TEXT NOT NULL,  -- "Golden State Warriors", "UFC", "sauna"
  
  -- Engagement level
  intensity TEXT,  -- casual | follow | enthusiast | die_hard
  frequency TEXT,  -- daily | weekly | monthly | occasionally
  skill_level TEXT,  -- beginner | intermediate | advanced | pro
  
  -- Type
  interest_type TEXT,  -- team | activity | topic | spectator | practice
  is_social BOOLEAN DEFAULT true,  -- do with others?
  
  -- Extra context
  details JSONB DEFAULT '{}',  -- league, favorite spots, etc
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, category, name)
);

-- ═══════════════════════════════════════════════════════════
-- GOALS & SEEKING (drives matching)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  goal_type TEXT NOT NULL,  -- professional | personal | seeking | offering
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Categorization
  category TEXT,  -- hire | fundraise | learn | health | relationship | etc
  
  -- Timeline
  timeline TEXT,  -- immediate | short_term | long_term | ongoing
  target_date DATE,
  
  -- For matching
  seeking_type TEXT,  -- person | opportunity | knowledge | resource
  seeking_criteria JSONB DEFAULT '{}',
  
  -- Status
  status TEXT DEFAULT 'active',  -- active | achieved | paused | abandoned
  priority INT DEFAULT 5,  -- 1-10
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- COMMUNITIES & GROUPS (existing spheres)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  community_type TEXT,  -- professional | social | hobby | alumni | mastermind
  
  -- Details
  platform TEXT,  -- whatsapp | slack | discord | in_person | etc
  role TEXT,  -- member | organizer | founder | moderator
  member_count INT,
  
  -- Engagement
  activity_level TEXT,  -- active | occasional | dormant
  joined_date DATE,
  
  -- Linking to imported chats
  chat_id UUID REFERENCES chats(id),
  
  -- Value
  value_provided TEXT,  -- what you get from this community
  value_contributed TEXT,  -- what you give
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- SOCIAL PROFILES (for enrichment)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  platform TEXT NOT NULL,  -- linkedin | twitter | instagram | github | etc
  handle TEXT,
  url TEXT,
  
  -- Enrichment status
  is_connected BOOLEAN DEFAULT false,
  last_enriched TIMESTAMPTZ,
  enriched_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, platform)
);

-- ═══════════════════════════════════════════════════════════
-- KNOWN RELATIONSHIPS (manual + imported)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- The other person
  contact_name TEXT NOT NULL,
  contact_profile_id UUID REFERENCES profiles(id),  -- link to profile if we have one
  
  -- Relationship details
  relationship_type TEXT,  -- friend | family | colleague | mentor | investor | etc
  closeness TEXT,  -- inner_circle | close | professional | acquaintance
  
  -- Context
  how_met TEXT,
  met_through TEXT,  -- person who introduced
  met_date DATE,
  shared_context TEXT[] DEFAULT '{}',  -- company, school, community names
  
  -- Interaction
  last_contact TIMESTAMPTZ,
  contact_frequency TEXT,  -- daily | weekly | monthly | yearly | dormant
  
  -- Value exchange
  can_intro_to TEXT[] DEFAULT '{}',  -- types of people they can intro you to
  intro_quality TEXT,  -- weak | decent | strong | exceptional
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- SPHERES (generated from profile + chats + relationships)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spheres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  sphere_type TEXT NOT NULL,  -- alumni | industry | geographic | interest | community | goal
  
  -- What defines this sphere
  matching_criteria JSONB DEFAULT '{}',  -- rules for who belongs
  
  -- Membership
  member_count INT DEFAULT 0,
  
  -- Your position
  your_strength FLOAT DEFAULT 0,  -- 0-1 how strong is your position here
  your_role TEXT,  -- outsider | member | connector | hub
  
  -- Value
  relevance_score FLOAT DEFAULT 0,  -- how relevant to your goals
  activity_level TEXT,
  
  -- Generated insights
  key_connectors TEXT[] DEFAULT '{}',
  bridge_opportunities JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sphere members (links profiles to spheres)
CREATE TABLE IF NOT EXISTS sphere_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sphere_id UUID REFERENCES spheres(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Their position in sphere
  role TEXT,  -- member | connector | hub
  influence_score FLOAT DEFAULT 0,
  
  -- Your relationship to them in this sphere
  connection_strength FLOAT DEFAULT 0,
  last_interaction TIMESTAMPTZ,
  
  UNIQUE(sphere_id, profile_id)
);

-- ═══════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_work_user ON work_history(user_id);
CREATE INDEX IF NOT EXISTS idx_work_company ON work_history(company);
CREATE INDEX IF NOT EXISTS idx_education_user ON education(user_id);
CREATE INDEX IF NOT EXISTS idx_education_institution ON education(institution);
CREATE INDEX IF NOT EXISTS idx_interests_user ON interests(user_id);
CREATE INDEX IF NOT EXISTS idx_interests_category ON interests(category);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_communities_user ON communities(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_spheres_user ON spheres(user_id);
CREATE INDEX IF NOT EXISTS idx_sphere_members_sphere ON sphere_members(sphere_id);
