-- CONNEX DATABASE SCHEMA
-- Copy this entire file and paste into Supabase SQL Editor

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE,
  name TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  company TEXT,
  industry TEXT,
  location JSONB DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  expertise TEXT[] DEFAULT '{}',
  affinities JSONB DEFAULT '{}',
  looking_for TEXT[] DEFAULT '{}',
  offering TEXT[] DEFAULT '{}',
  personality_notes TEXT,
  activity_score FLOAT DEFAULT 0,
  confidence_score FLOAT DEFAULT 0,
  sources JSONB DEFAULT '[]',
  raw_signals JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  platform TEXT DEFAULT 'whatsapp',
  member_count INT,
  message_count INT,
  date_range JSONB DEFAULT '{}',
  uploaded_by TEXT,
  raw_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message_count INT DEFAULT 0,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  UNIQUE(chat_id, profile_id)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES profiles(id),
  match_profile_id UUID REFERENCES profiles(id),
  score INT,
  tier TEXT,
  reasons TEXT[] DEFAULT '{}',
  intro_angle TEXT,
  evidence JSONB DEFAULT '[]',
  status TEXT DEFAULT 'suggested',
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_profile_id, match_profile_id)
);

CREATE TABLE enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT,
  url TEXT,
  data JSONB DEFAULT '{}',
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
