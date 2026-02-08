import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════
// PROFILE WIZARD
// 
// Simple structured input → automatic profile population
// User provides minimal info, we organize and store it properly
// ═══════════════════════════════════════════════════════════

export async function processProfileInput(userId, input) {
  console.log(`\n📝 Processing profile input for ${userId}`);
  
  const results = {
    processed: [],
    errors: [],
  };

  // ─── BASIC INFO ───
  if (input.name || input.email || input.phone || input.birthday) {
    try {
      const update = {};
      if (input.name) update.name_full = input.name;
      if (input.email) update.email = input.email;
      if (input.phone) update.phone = input.phone;
      if (input.birthday) update.birthday = input.birthday;
      if (input.mbti) update.mbti = input.mbti.toUpperCase();
      
      await supabase.from('users').update(update).eq('id', userId);
      results.processed.push({ type: 'basic_info', data: update });
    } catch (e) {
      results.errors.push({ type: 'basic_info', error: e.message });
    }
  }

  // ─── LOCATION ───
  if (input.city || input.country || input.location) {
    try {
      const location = {
        city: input.city || input.location?.split(',')[0]?.trim(),
        country: input.country || input.location?.split(',')[1]?.trim(),
      };
      await supabase.from('users').update({ 
        location_current: location 
      }).eq('id', userId);
      results.processed.push({ type: 'location', data: location });
    } catch (e) {
      results.errors.push({ type: 'location', error: e.message });
    }
  }

  // ─── WORK HISTORY ───
  // Accept: "Company Name" or "Title at Company" or "Title, Company, Years"
  if (input.work || input.jobs || input.companies) {
    const workItems = [].concat(input.work || input.jobs || input.companies);
    
    for (const item of workItems) {
      try {
        let company, title, isCurrent = false;
        
        if (typeof item === 'string') {
          // Parse "Title at Company" or "Company"
          if (item.toLowerCase().includes(' at ')) {
            const parts = item.split(/ at /i);
            title = parts[0].trim();
            company = parts[1].trim();
          } else if (item.includes(',')) {
            const parts = item.split(',').map(s => s.trim());
            title = parts[0];
            company = parts[1];
          } else {
            company = item.trim();
          }
          
          // Check if current
          if (item.toLowerCase().includes('current') || item.toLowerCase().includes('present')) {
            isCurrent = true;
          }
        } else if (typeof item === 'object') {
          company = item.company;
          title = item.title;
          isCurrent = item.current || item.isCurrent;
        }
        
        if (company) {
          // Check if already exists
          const { data: existing } = await supabase
            .from('work_history')
            .select('id')
            .eq('user_id', userId)
            .eq('company', company.replace(/\(current\)/i, '').trim())
            .single();
          
          if (!existing) {
            await supabase.from('work_history').insert({
              user_id: userId,
              company: company.replace(/\(current\)/i, '').trim(),
              title: title,
              is_current: isCurrent,
            });
          }
          results.processed.push({ type: 'work', data: { company, title } });
        }
      } catch (e) {
        results.errors.push({ type: 'work', error: e.message, item });
      }
    }
  }

  // ─── EDUCATION ───
  // Accept: "School Name" or "Degree from School" or {school, degree, field}
  if (input.education || input.schools) {
    const eduItems = [].concat(input.education || input.schools);
    
    for (const item of eduItems) {
      try {
        let school, degree, field;
        
        if (typeof item === 'string') {
          if (item.toLowerCase().includes(' from ')) {
            const parts = item.split(/ from /i);
            degree = parts[0].trim();
            school = parts[1].trim();
          } else if (item.includes(',')) {
            const parts = item.split(',').map(s => s.trim());
            school = parts[0];
            degree = parts[1];
            field = parts[2];
          } else {
            school = item.trim();
          }
        } else if (typeof item === 'object') {
          school = item.school || item.institution;
          degree = item.degree;
          field = item.field || item.major;
        }
        
        if (school) {
          // Check if already exists
          const { data: existing } = await supabase
            .from('education')
            .select('id')
            .eq('user_id', userId)
            .ilike('institution', school)
            .single();
          
          if (!existing) {
            await supabase.from('education').insert({
              user_id: userId,
              institution: school,
              degree: degree,
              field_of_study: field,
              institution_type: 'university',
            });
          }
          results.processed.push({ type: 'education', data: { school, degree } });
        }
      } catch (e) {
        results.errors.push({ type: 'education', error: e.message, item });
      }
    }
  }

  // ─── INTERESTS ───
  // Accept: ["UFC", "crypto"] or {sports: ["Warriors"], food: ["ramen"]}
  if (input.interests) {
    const interests = input.interests;
    
    if (Array.isArray(interests)) {
      // Simple array of interests
      for (const interest of interests) {
        try {
          const category = categorizeInterest(interest);
          await supabase.from('interests').upsert({
            user_id: userId,
            category: category,
            name: interest,
            intensity: 'follow',
          }, { onConflict: 'user_id,category,name' });
          results.processed.push({ type: 'interest', data: { category, name: interest } });
        } catch (e) {
          results.errors.push({ type: 'interest', error: e.message, item: interest });
        }
      }
    } else if (typeof interests === 'object') {
      // Categorized interests
      for (const [category, items] of Object.entries(interests)) {
        const itemList = [].concat(items);
        for (const item of itemList) {
          try {
            await supabase.from('interests').upsert({
              user_id: userId,
              category: category,
              name: item,
              intensity: 'enthusiast',
            }, { onConflict: 'user_id,category,name' });
            results.processed.push({ type: 'interest', data: { category, name: item } });
          } catch (e) {
            results.errors.push({ type: 'interest', error: e.message });
          }
        }
      }
    }
  }

  // ─── SOCIAL PROFILES ───
  if (input.linkedin) {
    await addSocial(userId, 'linkedin', input.linkedin, results);
  }
  if (input.twitter) {
    await addSocial(userId, 'twitter', input.twitter, results);
  }
  if (input.github) {
    await addSocial(userId, 'github', input.github, results);
  }
  if (input.instagram) {
    await addSocial(userId, 'instagram', input.instagram, results);
  }

  // ─── GOALS ───
  if (input.goals || input.seeking || input.offering) {
    const goals = [].concat(input.goals || []);
    const seeking = [].concat(input.seeking || []);
    const offering = [].concat(input.offering || []);
    
    for (const goal of goals) {
      await addGoal(userId, 'professional', goal, results);
    }
    for (const item of seeking) {
      await addGoal(userId, 'seeking', item, results);
    }
    for (const item of offering) {
      await addGoal(userId, 'offering', item, results);
    }
  }

  console.log(`✅ Processed ${results.processed.length} items, ${results.errors.length} errors`);
  return results;
}

// ─── HELPERS ───

function categorizeInterest(interest) {
  const lower = interest.toLowerCase();
  
  const categories = {
    sports: ['basketball', 'football', 'soccer', 'golf', 'tennis', 'ufc', 'mma', 'warriors', '49ers', 'nba', 'nfl'],
    tech: ['ai', 'crypto', 'blockchain', 'coding', 'programming', 'startup', 'saas', 'web3'],
    wellness: ['yoga', 'meditation', 'fitness', 'gym', 'running', 'sauna', 'health'],
    food: ['cooking', 'restaurant', 'foodie', 'wine', 'coffee', 'ramen', 'sushi'],
    travel: ['travel', 'backpacking', 'adventure'],
    music: ['music', 'concert', 'festival', 'guitar', 'piano'],
    business: ['investing', 'finance', 'real estate', 'entrepreneurship'],
  };
  
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return cat;
    }
  }
  
  return 'general';
}

async function addSocial(userId, platform, value, results) {
  try {
    const handle = value.replace(/^@/, '').replace(/https?:\/\/(www\.)?(twitter|linkedin|github|instagram)\.com\/(in\/)?/i, '');
    const url = platform === 'linkedin' 
      ? `https://linkedin.com/in/${handle}`
      : platform === 'twitter'
        ? `https://twitter.com/${handle}`
        : platform === 'github'
          ? `https://github.com/${handle}`
          : `https://instagram.com/${handle}`;
    
    await supabase.from('social_profiles').upsert({
      user_id: userId,
      platform,
      handle,
      url,
    }, { onConflict: 'user_id,platform' });
    results.processed.push({ type: 'social', data: { platform, handle } });
  } catch (e) {
    results.errors.push({ type: 'social', error: e.message });
  }
}

async function addGoal(userId, type, goal, results) {
  try {
    const title = typeof goal === 'string' ? goal : goal.title;
    const desc = typeof goal === 'object' ? goal.description : null;
    
    await supabase.from('goals').insert({
      user_id: userId,
      goal_type: type,
      title: title,
      description: desc,
      status: 'active',
    });
    results.processed.push({ type: 'goal', data: { type, title } });
  } catch (e) {
    results.errors.push({ type: 'goal', error: e.message });
  }
}

export default { processProfileInput };
