import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════
// PROFILE OPERATIONS
// ═══════════════════════════════════════════════════════════

export async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      phone: profile.phone || null,
      name: profile.name,
      display_name: profile.display_name || profile.name,
      role: profile.role,
      company: profile.company,
      industry: profile.industry,
      location: profile.location || {},
      interests: profile.interests || [],
      expertise: profile.expertise || [],
      affinities: profile.affinities || {},
      looking_for: profile.looking_for || [],
      offering: profile.offering || [],
      personality_notes: profile.personality_notes,
      activity_score: profile.activity_score || 0,
      confidence_score: profile.confidence_score || 0,
      sources: profile.context_sources || [],
      raw_signals: profile.raw_signals || {},
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'phone',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error && error.code !== '23505') {
    console.error('Profile upsert error:', error);
  }
  return data;
}

export async function getProfileByPhone(phone) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone', phone)
    .single();
  
  return data;
}

export async function getProfileByName(name) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name', `%${name}%`)
    .limit(5);
  
  return data || [];
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('updated_at', { ascending: false });
  
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// CHAT OPERATIONS
// ═══════════════════════════════════════════════════════════

export async function saveChat(chat, profiles) {
  // Hash the chat content to detect duplicates
  const rawHash = Buffer.from(JSON.stringify({
    members: chat.members?.length,
    messages: chat.stats?.totalMessages,
  })).toString('base64').slice(0, 32);

  const { data: chatData, error: chatError } = await supabase
    .from('chats')
    .upsert({
      name: chat.groupName || 'Unknown Group',
      platform: 'whatsapp',
      member_count: chat.members?.length || 0,
      message_count: chat.stats?.totalMessages || 0,
      date_range: chat.stats?.dateRange || {},
      raw_hash: rawHash,
    }, {
      onConflict: 'raw_hash',
    })
    .select()
    .single();

  if (chatError) {
    console.error('Chat save error:', chatError);
    return null;
  }

  // Link profiles to chat
  for (const profile of profiles) {
    const savedProfile = await upsertProfile(profile);
    if (savedProfile && chatData) {
      await supabase
        .from('chat_members')
        .upsert({
          chat_id: chatData.id,
          profile_id: savedProfile.id,
          message_count: profile.message_count || 0,
        }, {
          onConflict: 'chat_id,profile_id',
        });
    }
  }

  return chatData;
}

// ═══════════════════════════════════════════════════════════
// MATCH OPERATIONS
// ═══════════════════════════════════════════════════════════

export async function saveMatch(userProfileId, matchProfileId, matchData) {
  const { data, error } = await supabase
    .from('matches')
    .upsert({
      user_profile_id: userProfileId,
      match_profile_id: matchProfileId,
      score: matchData.match_score || matchData.score,
      tier: matchData.match_tier || matchData.tier,
      reasons: matchData.reasons || [],
      intro_angle: matchData.intro_angle,
      evidence: matchData.evidence || [],
    }, {
      onConflict: 'user_profile_id,match_profile_id',
    })
    .select()
    .single();

  return data;
}

export async function getMatchesForUser(userProfileId) {
  const { data, error } = await supabase
    .from('matches')
    .select(`
      *,
      match_profile:match_profile_id (*)
    `)
    .eq('user_profile_id', userProfileId)
    .order('score', { ascending: false });

  return data || [];
}

// ═══════════════════════════════════════════════════════════
// CROSS-CHAT INTELLIGENCE
// ═══════════════════════════════════════════════════════════

export async function findCrossReferences(name) {
  // Find profiles that appear in multiple chats
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      chat_members (
        chat_id,
        chats (name, member_count)
      )
    `)
    .ilike('name', `%${name}%`);

  return data || [];
}

// ═══════════════════════════════════════════════════════════
// BUILT PROFILE STORAGE
// For ProfileBuilder-created profiles
// ═══════════════════════════════════════════════════════════

export async function saveBuiltProfile(builtResult) {
  // Extract from ProfileBuilder result
  const merged = builtResult.merged_profile || {};
  const phoneInfo = builtResult.phone_info || {};
  const verifications = builtResult.verifications || {};
  
  const profileData = {
    // Core identity
    phone: merged.phone || builtResult.input?.phone || null,
    name: merged.name || builtResult.input?.name,
    display_name: merged.name || builtResult.input?.name,
    email: builtResult.input?.email || null,
    
    // Location from phone signals
    location: {
      city: phoneInfo.city,
      state: phoneInfo.state,
      region: phoneInfo.region,
      country: phoneInfo.country,
      source: 'phone_area_code',
      confidence: phoneInfo.confidence,
    },
    
    // Social handles
    social_handles: {
      linkedin: verifications.linkedin?.exists ? {
        url: builtResult.input?.linkedin,
        verified: true,
      } : null,
      instagram: verifications.instagram?.exists ? {
        handle: builtResult.input?.instagram,
        verified: true,
      } : null,
      x: verifications.x?.exists ? {
        handle: builtResult.input?.x,
        verified: true,
      } : null,
    },
    
    // Work info if enriched
    role: merged.work?.title || null,
    company: merged.work?.company || null,
    
    // Interests and skills
    interests: merged.interests || [],
    expertise: merged.skills || [],
    
    // Metadata
    confidence_score: builtResult.completeness / 100,
    sources: ['profile_builder'],
    raw_signals: {
      phone_info: phoneInfo,
      verifications: verifications,
      gaps: builtResult.gaps,
    },
    updated_at: new Date().toISOString(),
  };
  
  // Use phone as unique key if available, otherwise generate one
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profileData, {
      onConflict: 'phone',
      ignoreDuplicates: false,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Save built profile error:', error);
    // Try insert without conflict resolution
    const { data: insertData, error: insertError } = await supabase
      .from('profiles')
      .insert(profileData)
      .select()
      .single();
    
    if (insertError) {
      console.error('Insert profile error:', insertError);
      return null;
    }
    return insertData;
  }
  
  return data;
}

export async function getBuiltProfiles(options = {}) {
  const { limit = 50, offset = 0 } = options;
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .contains('sources', ['profile_builder'])
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  return data || [];
}

export async function getNetworkStats() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' });
  
  const { data: chats } = await supabase
    .from('chats')
    .select('id', { count: 'exact' });
  
  const { data: matches } = await supabase
    .from('matches')
    .select('id', { count: 'exact' });

  return {
    totalProfiles: profiles?.length || 0,
    totalChats: chats?.length || 0,
    totalMatches: matches?.length || 0,
  };
}

export default supabase;
