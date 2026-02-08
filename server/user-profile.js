import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════
// USER PROFILE OPERATIONS
// ═══════════════════════════════════════════════════════════

export async function createOrUpdateUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .upsert({
      phone: userData.phone,
      email: userData.email,
      name_full: userData.name_full,
      name_preferred: userData.name_preferred,
      nicknames: userData.nicknames || [],
      birthday: userData.birthday,
      location_current: userData.location_current || {},
      location_home: userData.location_home || {},
      locations_frequent: userData.locations_frequent || [],
      travel_style: userData.travel_style,
      mbti: userData.mbti,
      communication_prefs: userData.communication_prefs || {},
      updated_at: new Date().toISOString(),
    }, {
      onConflict: userData.phone ? 'phone' : 'email',
    })
    .select()
    .single();

  if (error) console.error('User upsert error:', error);
  return data;
}

export async function getUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function getUserByPhone(phone) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();
  return data;
}

// ═══════════════════════════════════════════════════════════
// WORK HISTORY
// ═══════════════════════════════════════════════════════════

export async function addWorkHistory(userId, work) {
  const { data, error } = await supabase
    .from('work_history')
    .insert({
      user_id: userId,
      title: work.title,
      company: work.company,
      industry: work.industry,
      location: work.location,
      start_date: work.start_date,
      end_date: work.end_date,
      is_current: work.is_current || !work.end_date,
      description: work.description,
      highlights: work.highlights || [],
      skills_used: work.skills_used || [],
      company_size: work.company_size,
      role_level: work.role_level,
    })
    .select()
    .single();

  if (error) console.error('Work history error:', error);
  return data;
}

export async function getWorkHistory(userId) {
  const { data, error } = await supabase
    .from('work_history')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// EDUCATION
// ═══════════════════════════════════════════════════════════

export async function addEducation(userId, edu) {
  const { data, error } = await supabase
    .from('education')
    .insert({
      user_id: userId,
      institution: edu.institution,
      institution_type: edu.institution_type,
      degree: edu.degree,
      field_of_study: edu.field_of_study,
      location: edu.location,
      start_year: edu.start_year,
      end_year: edu.end_year,
      activities: edu.activities || [],
      honors: edu.honors || [],
    })
    .select()
    .single();

  if (error) console.error('Education error:', error);
  return data;
}

export async function getEducation(userId) {
  const { data, error } = await supabase
    .from('education')
    .select('*')
    .eq('user_id', userId)
    .order('end_year', { ascending: false });
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// INTERESTS
// ═══════════════════════════════════════════════════════════

export async function addInterest(userId, interest) {
  const { data, error } = await supabase
    .from('interests')
    .upsert({
      user_id: userId,
      category: interest.category,
      subcategory: interest.subcategory,
      name: interest.name,
      intensity: interest.intensity,
      frequency: interest.frequency,
      skill_level: interest.skill_level,
      interest_type: interest.interest_type,
      is_social: interest.is_social ?? true,
      details: interest.details || {},
    }, {
      onConflict: 'user_id,category,name',
    })
    .select()
    .single();

  if (error) console.error('Interest error:', error);
  return data;
}

export async function getInterests(userId) {
  const { data, error } = await supabase
    .from('interests')
    .select('*')
    .eq('user_id', userId)
    .order('category');
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════

export async function addGoal(userId, goal) {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      goal_type: goal.goal_type,
      title: goal.title,
      description: goal.description,
      category: goal.category,
      timeline: goal.timeline,
      target_date: goal.target_date,
      seeking_type: goal.seeking_type,
      seeking_criteria: goal.seeking_criteria || {},
      status: goal.status || 'active',
      priority: goal.priority || 5,
    })
    .select()
    .single();

  if (error) console.error('Goal error:', error);
  return data;
}

export async function getGoals(userId, type = null) {
  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (type) query = query.eq('goal_type', type);
  
  const { data, error } = await query.order('priority', { ascending: false });
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// COMMUNITIES
// ═══════════════════════════════════════════════════════════

export async function addCommunity(userId, community) {
  const { data, error } = await supabase
    .from('communities')
    .insert({
      user_id: userId,
      name: community.name,
      community_type: community.community_type,
      platform: community.platform,
      role: community.role,
      member_count: community.member_count,
      activity_level: community.activity_level,
      joined_date: community.joined_date,
      chat_id: community.chat_id,
      value_provided: community.value_provided,
      value_contributed: community.value_contributed,
    })
    .select()
    .single();

  if (error) console.error('Community error:', error);
  return data;
}

export async function getCommunities(userId) {
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('user_id', userId)
    .order('activity_level');
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// SOCIAL PROFILES
// ═══════════════════════════════════════════════════════════

export async function addSocialProfile(userId, profile) {
  const { data, error } = await supabase
    .from('social_profiles')
    .upsert({
      user_id: userId,
      platform: profile.platform,
      handle: profile.handle,
      url: profile.url,
      is_connected: profile.is_connected || false,
    }, {
      onConflict: 'user_id,platform',
    })
    .select()
    .single();

  if (error) console.error('Social profile error:', error);
  return data;
}

export async function getSocialProfiles(userId) {
  const { data, error } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('user_id', userId);
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// RELATIONSHIPS
// ═══════════════════════════════════════════════════════════

export async function addRelationship(userId, rel) {
  const { data, error } = await supabase
    .from('relationships')
    .insert({
      user_id: userId,
      contact_name: rel.contact_name,
      contact_profile_id: rel.contact_profile_id,
      relationship_type: rel.relationship_type,
      closeness: rel.closeness,
      how_met: rel.how_met,
      met_through: rel.met_through,
      met_date: rel.met_date,
      shared_context: rel.shared_context || [],
      last_contact: rel.last_contact,
      contact_frequency: rel.contact_frequency,
      can_intro_to: rel.can_intro_to || [],
      intro_quality: rel.intro_quality,
      notes: rel.notes,
    })
    .select()
    .single();

  if (error) console.error('Relationship error:', error);
  return data;
}

export async function getRelationships(userId, type = null) {
  let query = supabase
    .from('relationships')
    .select('*')
    .eq('user_id', userId);
  
  if (type) query = query.eq('relationship_type', type);
  
  const { data, error } = await query.order('closeness');
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// FULL PROFILE
// ═══════════════════════════════════════════════════════════

export async function getFullProfile(userId) {
  const [user, work, education, interests, goals, communities, social, relationships] = await Promise.all([
    getUser(userId),
    getWorkHistory(userId),
    getEducation(userId),
    getInterests(userId),
    getGoals(userId),
    getCommunities(userId),
    getSocialProfiles(userId),
    getRelationships(userId),
  ]);

  return {
    ...user,
    work_history: work,
    education,
    interests,
    goals,
    communities,
    social_profiles: social,
    relationships,
  };
}

// ═══════════════════════════════════════════════════════════
// PROFILE COMPLETENESS
// ═══════════════════════════════════════════════════════════

export async function calculateCompleteness(userId) {
  const profile = await getFullProfile(userId);
  
  let score = 0;
  let total = 0;
  
  // Core identity (20%)
  total += 20;
  if (profile.name_full) score += 5;
  if (profile.phone || profile.email) score += 5;
  if (profile.location_current?.city) score += 5;
  if (profile.birthday) score += 2;
  if (profile.mbti) score += 3;
  
  // Professional (25%)
  total += 25;
  if (profile.work_history?.length > 0) score += 15;
  if (profile.work_history?.length > 2) score += 5;
  if (profile.work_history?.some(w => w.is_current)) score += 5;
  
  // Education (10%)
  total += 10;
  if (profile.education?.length > 0) score += 10;
  
  // Interests (20%)
  total += 20;
  if (profile.interests?.length > 0) score += 5;
  if (profile.interests?.length >= 3) score += 5;
  if (profile.interests?.length >= 5) score += 5;
  if (profile.interests?.some(i => i.category === 'sports')) score += 2.5;
  if (profile.interests?.some(i => i.category === 'wellness')) score += 2.5;
  
  // Goals (15%)
  total += 15;
  if (profile.goals?.length > 0) score += 10;
  if (profile.goals?.some(g => g.goal_type === 'seeking')) score += 5;
  
  // Social (10%)
  total += 10;
  if (profile.social_profiles?.length > 0) score += 5;
  if (profile.social_profiles?.length >= 2) score += 5;
  
  const completeness = score / total;
  
  // Update user record
  await supabase
    .from('users')
    .update({ profile_completeness: completeness })
    .eq('id', userId);
  
  return { completeness, score, total };
}
