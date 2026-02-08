import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════
// PROFILE ENRICHMENT ENGINE
// Uses social handles to research and populate user profiles
// ═══════════════════════════════════════════════════════════

function getAnthropicToken() {
  const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const defaultProfile = auth.profiles['anthropic:default'];
    if (defaultProfile?.token && !defaultProfile.token.includes('Symbol')) {
      return defaultProfile.token;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function getClient() {
  const token = getAnthropicToken();
  if (!token) throw new Error('No Anthropic token available');
  return new Anthropic({ apiKey: token });
}

// ═══════════════════════════════════════════════════════════
// WEB SEARCH (using Brave via fetch)
// ═══════════════════════════════════════════════════════════

async function searchWeb(query) {
  // Simple Google scrape fallback
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const html = await response.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 15000);
    }
  } catch (e) {
    console.error('Search error:', e.message);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// LINKEDIN ENRICHMENT
// ═══════════════════════════════════════════════════════════

export async function enrichFromLinkedIn(userId, linkedinUrl) {
  console.log(`🔍 Enriching from LinkedIn: ${linkedinUrl}`);
  
  // Extract username from URL
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  if (!match) return { error: 'Invalid LinkedIn URL' };
  
  const username = match[1];
  
  // Search for public info about this person
  const searchResults = await searchWeb(`"${username}" site:linkedin.com`);
  const additionalSearch = await searchWeb(`"${username}" linkedin work experience education`);
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are a profile enrichment agent. Given search results about a LinkedIn profile, extract structured information.

Return JSON with these fields (use null if not found):
{
  "name_full": "Full name",
  "current_role": {
    "title": "Job title",
    "company": "Company name",
    "industry": "Industry",
    "started": "When they started (if known)"
  },
  "work_history": [
    {"title": "", "company": "", "industry": "", "location": "", "years": ""}
  ],
  "education": [
    {"institution": "", "degree": "", "field": "", "years": ""}
  ],
  "skills": [],
  "location": {"city": "", "country": ""},
  "headline": "Their LinkedIn headline",
  "connections_hint": "Number of connections if visible",
  "interests": [],
  "confidence": 0.0-1.0
}

Only include information you can verify from the search results. Be conservative.`,
    messages: [{
      role: 'user',
      content: `LinkedIn username: ${username}\n\nSearch Results:\n${searchResults}\n\nAdditional:\n${additionalSearch}`
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      
      // Save enrichment data
      await supabase.from('social_profiles').update({
        is_connected: true,
        last_enriched: new Date().toISOString(),
        enriched_data: data,
      }).eq('user_id', userId).eq('platform', 'linkedin');
      
      // Auto-populate work history if found
      if (data.work_history?.length > 0) {
        for (const work of data.work_history) {
          if (work.company) {
            await supabase.from('work_history').upsert({
              user_id: userId,
              company: work.company,
              title: work.title,
              industry: work.industry,
              location: work.location,
            }, { onConflict: 'user_id,company,title' });
          }
        }
      }
      
      // Auto-populate education if found
      if (data.education?.length > 0) {
        for (const edu of data.education) {
          if (edu.institution) {
            await supabase.from('education').upsert({
              user_id: userId,
              institution: edu.institution,
              degree: edu.degree,
              field_of_study: edu.field,
            }, { onConflict: 'user_id,institution' });
          }
        }
      }
      
      return { success: true, data };
    } catch (e) {
      return { error: 'Failed to parse enrichment data', raw: text };
    }
  }
  
  return { error: 'No data extracted' };
}

// ═══════════════════════════════════════════════════════════
// TWITTER/X ENRICHMENT
// ═══════════════════════════════════════════════════════════

export async function enrichFromTwitter(userId, handle) {
  console.log(`🔍 Enriching from Twitter: @${handle}`);
  
  const cleanHandle = handle.replace('@', '');
  
  // Search for public info
  const searchResults = await searchWeb(`"@${cleanHandle}" twitter`);
  const bioSearch = await searchWeb(`"${cleanHandle}" twitter bio interests`);
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a profile enrichment agent. Given search results about a Twitter/X profile, extract structured information.

Return JSON:
{
  "name": "Display name",
  "bio": "Twitter bio",
  "location": "Location from profile",
  "interests": ["Topics they tweet about"],
  "expertise": ["What they seem knowledgeable about"],
  "personality_signals": ["Communication style hints"],
  "communities": ["Groups/movements they're part of"],
  "notable": "Any notable achievements or affiliations",
  "confidence": 0.0-1.0
}

Focus on interests and personality — that's the gold for matching.`,
    messages: [{
      role: 'user',
      content: `Twitter handle: @${cleanHandle}\n\nSearch Results:\n${searchResults}\n\nBio Search:\n${bioSearch}`
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      
      // Save enrichment
      await supabase.from('social_profiles').update({
        is_connected: true,
        last_enriched: new Date().toISOString(),
        enriched_data: data,
      }).eq('user_id', userId).eq('platform', 'twitter');
      
      // Auto-add interests
      if (data.interests?.length > 0) {
        for (const interest of data.interests.slice(0, 5)) {
          await supabase.from('interests').upsert({
            user_id: userId,
            category: 'twitter_interest',
            name: interest,
            intensity: 'follow',
            interest_type: 'topic',
            details: { source: 'twitter_enrichment' },
          }, { onConflict: 'user_id,category,name' });
        }
      }
      
      return { success: true, data };
    } catch (e) {
      return { error: 'Failed to parse', raw: text };
    }
  }
  
  return { error: 'No data extracted' };
}

// ═══════════════════════════════════════════════════════════
// GITHUB ENRICHMENT
// ═══════════════════════════════════════════════════════════

export async function enrichFromGitHub(userId, username) {
  console.log(`🔍 Enriching from GitHub: ${username}`);
  
  // GitHub has a public API!
  try {
    const userRes = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'User-Agent': 'Connex-Brain' }
    });
    
    if (!userRes.ok) return { error: 'GitHub user not found' };
    
    const user = await userRes.json();
    
    // Get repos for tech stack analysis
    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=30&sort=updated`, {
      headers: { 'User-Agent': 'Connex-Brain' }
    });
    const repos = await reposRes.json();
    
    // Analyze tech stack
    const languages = {};
    const topics = new Set();
    
    for (const repo of repos) {
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
      }
      if (repo.topics) {
        repo.topics.forEach(t => topics.add(t));
      }
    }
    
    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang]) => lang);
    
    const data = {
      name: user.name,
      bio: user.bio,
      company: user.company,
      location: user.location,
      blog: user.blog,
      public_repos: user.public_repos,
      followers: user.followers,
      following: user.following,
      created_at: user.created_at,
      top_languages: topLanguages,
      topics: [...topics].slice(0, 15),
      profile_url: user.html_url,
    };
    
    // Save enrichment
    await supabase.from('social_profiles').update({
      is_connected: true,
      last_enriched: new Date().toISOString(),
      enriched_data: data,
    }).eq('user_id', userId).eq('platform', 'github');
    
    // Add tech interests
    for (const lang of topLanguages) {
      await supabase.from('interests').upsert({
        user_id: userId,
        category: 'tech',
        name: lang,
        intensity: 'enthusiast',
        skill_level: 'intermediate',
        interest_type: 'topic',
        details: { source: 'github_enrichment' },
      }, { onConflict: 'user_id,category,name' });
    }
    
    return { success: true, data };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// INSTAGRAM ENRICHMENT
// ═══════════════════════════════════════════════════════════

export async function enrichFromInstagram(userId, handle) {
  console.log(`🔍 Enriching from Instagram: @${handle}`);
  
  const cleanHandle = handle.replace('@', '');
  
  // Instagram is hard to scrape — search for public info
  const searchResults = await searchWeb(`"${cleanHandle}" instagram bio`);
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `Extract profile information from Instagram search results.

Return JSON:
{
  "name": "Display name",
  "bio": "Bio text",
  "interests": ["Interests visible from posts/bio"],
  "lifestyle": ["Lifestyle signals - travel, food, fitness, etc"],
  "location_signals": ["Places they seem to be"],
  "aesthetic": "Brief description of their vibe/style",
  "confidence": 0.0-1.0
}`,
    messages: [{
      role: 'user',
      content: `Instagram: @${cleanHandle}\n\nSearch Results:\n${searchResults}`
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      
      await supabase.from('social_profiles').update({
        is_connected: true,
        last_enriched: new Date().toISOString(),
        enriched_data: data,
      }).eq('user_id', userId).eq('platform', 'instagram');
      
      // Add lifestyle interests
      if (data.lifestyle?.length > 0) {
        for (const item of data.lifestyle.slice(0, 5)) {
          await supabase.from('interests').upsert({
            user_id: userId,
            category: 'lifestyle',
            name: item,
            intensity: 'follow',
            interest_type: 'topic',
            details: { source: 'instagram_enrichment' },
          }, { onConflict: 'user_id,category,name' });
        }
      }
      
      return { success: true, data };
    } catch (e) {
      return { error: 'Failed to parse' };
    }
  }
  
  return { error: 'No data extracted' };
}

// ═══════════════════════════════════════════════════════════
// NAME + EMAIL ENRICHMENT (find social profiles)
// ═══════════════════════════════════════════════════════════

export async function enrichFromNameEmail(userId, name, email) {
  console.log(`🔍 Enriching from name/email: ${name} <${email}>`);
  
  // Search for this person
  const searchResults = await searchWeb(`"${name}" ${email?.split('@')[0] || ''}`);
  const linkedinSearch = await searchWeb(`"${name}" site:linkedin.com`);
  const twitterSearch = await searchWeb(`"${name}" site:twitter.com OR site:x.com`);
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are finding social profiles for a person. Given search results, identify their profiles.

Return JSON:
{
  "likely_profiles": {
    "linkedin": "URL if found",
    "twitter": "handle if found",
    "github": "username if found",
    "instagram": "handle if found",
    "other": [{"platform": "", "url": ""}]
  },
  "professional_info": {
    "current_company": "",
    "title": "",
    "industry": ""
  },
  "education": [],
  "location": "",
  "interests": [],
  "confidence": 0.0-1.0,
  "notes": "Any disambiguation notes"
}

Be careful not to confuse different people with the same name.`,
    messages: [{
      role: 'user',
      content: `Name: ${name}\nEmail: ${email || 'unknown'}\n\nGeneral Search:\n${searchResults}\n\nLinkedIn Search:\n${linkedinSearch}\n\nTwitter Search:\n${twitterSearch}`
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      
      // Auto-add discovered social profiles
      if (data.likely_profiles) {
        for (const [platform, value] of Object.entries(data.likely_profiles)) {
          if (value && platform !== 'other') {
            await supabase.from('social_profiles').upsert({
              user_id: userId,
              platform,
              url: platform === 'linkedin' ? value : null,
              handle: platform !== 'linkedin' ? value : null,
            }, { onConflict: 'user_id,platform' });
          }
        }
      }
      
      return { success: true, data };
    } catch (e) {
      return { error: 'Failed to parse' };
    }
  }
  
  return { error: 'No data extracted' };
}

// ═══════════════════════════════════════════════════════════
// FULL ENRICHMENT PIPELINE
// ═══════════════════════════════════════════════════════════

export async function runFullEnrichment(userId) {
  console.log(`\n🧠 Running full enrichment for user ${userId}\n`);
  
  // Get user's social profiles
  const { data: profiles } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('user_id', userId);
  
  const results = {};
  
  for (const profile of profiles || []) {
    if (profile.is_connected) {
      console.log(`  ⏭️ Skipping ${profile.platform} (already enriched)`);
      continue;
    }
    
    try {
      switch (profile.platform) {
        case 'linkedin':
          if (profile.url) {
            results.linkedin = await enrichFromLinkedIn(userId, profile.url);
          }
          break;
        case 'twitter':
          if (profile.handle) {
            results.twitter = await enrichFromTwitter(userId, profile.handle);
          }
          break;
        case 'github':
          if (profile.handle) {
            results.github = await enrichFromGitHub(userId, profile.handle);
          }
          break;
        case 'instagram':
          if (profile.handle) {
            results.instagram = await enrichFromInstagram(userId, profile.handle);
          }
          break;
      }
    } catch (e) {
      results[profile.platform] = { error: e.message };
    }
  }
  
  // Update completeness
  const { data: user } = await supabase
    .from('users')
    .select('name_full, email')
    .eq('id', userId)
    .single();
  
  // If we have name but missing profiles, try to find them
  if (user?.name_full && Object.keys(results).length === 0) {
    results.discovery = await enrichFromNameEmail(userId, user.name_full, user.email);
  }
  
  console.log(`\n✅ Enrichment complete\n`);
  return results;
}

export default {
  enrichFromLinkedIn,
  enrichFromTwitter,
  enrichFromGitHub,
  enrichFromInstagram,
  enrichFromNameEmail,
  runFullEnrichment,
};
