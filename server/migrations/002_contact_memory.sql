-- Contact Memory Table
-- "Who Is This?" - Never forget where you met someone

CREATE TABLE IF NOT EXISTS contact_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core identity
  phone TEXT NOT NULL,              -- E.164 format: +14155551234
  name TEXT,                        -- Display name
  user_id UUID NOT NULL,            -- Who saved this contact (references users table)
  
  -- Context capture
  context_raw TEXT,                 -- Voice note transcription or typed note
  tags TEXT[] DEFAULT '{}',         -- Searchable tags: #devcon, #crypto, #bangkok
  category TEXT,                    -- work, social, dating, service, random
  
  -- Time & place
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  saved_location JSONB,             -- { lat, lng, venue, city, accuracy }
  calendar_correlation JSONB,       -- { event, location, confidence }
  
  -- Media
  photo_url TEXT,                   -- Photo together
  
  -- Phone metadata
  phone_info JSONB,                 -- { countryCode, country, areaCode, likelyCity }
  
  -- Enrichment (background)
  enrichment JSONB DEFAULT '{}',    -- { linkedin, twitter, company, role, mutual_contacts }
  
  -- Interaction tracking
  first_message JSONB,              -- { date, text, direction }
  last_contacted TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique per user+phone
  UNIQUE(phone, user_id)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_contact_memory_phone ON contact_memory(phone);
CREATE INDEX IF NOT EXISTS idx_contact_memory_user ON contact_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_memory_name ON contact_memory USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_contact_memory_context ON contact_memory USING gin(to_tsvector('english', context_raw));
CREATE INDEX IF NOT EXISTS idx_contact_memory_tags ON contact_memory USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contact_memory_saved_at ON contact_memory(saved_at);
CREATE INDEX IF NOT EXISTS idx_contact_memory_category ON contact_memory(category);

-- Enable Row Level Security
ALTER TABLE contact_memory ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own contacts
CREATE POLICY "Users can view own contacts" ON contact_memory
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own contacts" ON contact_memory
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own contacts" ON contact_memory
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own contacts" ON contact_memory
  FOR DELETE USING (user_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contact_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS contact_memory_updated_at ON contact_memory;
CREATE TRIGGER contact_memory_updated_at
  BEFORE UPDATE ON contact_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_memory_updated_at();

-- Comments
COMMENT ON TABLE contact_memory IS 'Contact memory - captures context when contacts are saved';
COMMENT ON COLUMN contact_memory.phone IS 'E.164 format phone number';
COMMENT ON COLUMN contact_memory.context_raw IS 'User-provided context (voice note or typed)';
COMMENT ON COLUMN contact_memory.saved_location IS 'GPS location when contact was saved';
COMMENT ON COLUMN contact_memory.calendar_correlation IS 'Inferred calendar event correlation';
COMMENT ON COLUMN contact_memory.phone_info IS 'Parsed phone number metadata (country, area code, likely city)';
