/**
 * DEEP RESEARCH
 * 
 * Given a name → actually research them → return rich context
 * Goal: Find the non-obvious stuff that creates "I need to meet this person"
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load OAuth token from Clawdbot's auth store
function getAnthropicToken() {
  const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const defaultProfile = auth.profiles['anthropic:default'];
    if (defaultProfile?.token && !defaultProfile.token.includes('Symbol')) {
      return defaultProfile.token;
    }
    const oauthProfile = auth.profiles['anthropic:claude-cli'];
    if (oauthProfile?.access) {
      // Check if expired
      const expires = oauthProfile.expires || 0;
      if (Date.now() < expires) {
        return oauthProfile.access;
      }
    }
    throw new Error('No valid token found or token expired');
  } catch (err) {
    console.error('Failed to load Anthropic token:', err.message);
    return null;
  }
}

function getClient() {
  const token = getAnthropicToken();
  if (!token) throw new Error('No Anthropic token available');
  return new Anthropic({ apiKey: token });
}

// Web search using Brave API (via Clawdbot's .env)
async function webSearch(query) {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 
    fs.readFileSync(path.join(process.env.HOME, '.clawdbot/.env'), 'utf-8')
      .match(/BRAVE_API_KEY=([^\n]+)/)?.[1];
  
  if (!BRAVE_API_KEY) {
    return { results: [], error: 'No Brave API key' };
  }
  
  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY }
    });
    
    const data = await response.json();
    return {
      results: (data.web?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description
      }))
    };
  } catch (e) {
    return { results: [], error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// RESEARCH A PERSON
// ═══════════════════════════════════════════════════════════

export async function researchPerson(name, hints = {}) {
  console.log(`\n🔍 DEEP RESEARCH: ${name}`);
  console.log(`   Hints: ${JSON.stringify(hints)}`);
  
  // Build search context from hints
  const contextParts = [];
  if (hints.city) contextParts.push(`based in ${hints.city}`);
  if (hints.company) contextParts.push(`works at ${hints.company}`);
  if (hints.role) contextParts.push(`${hints.role}`);
  if (hints.linkedin) contextParts.push(`LinkedIn: ${hints.linkedin}`);
  if (hints.twitter) contextParts.push(`Twitter/X: @${hints.twitter}`);
  if (hints.context) contextParts.push(hints.context);
  
  const contextStr = contextParts.length > 0 
    ? `Known context: ${contextParts.join(', ')}`
    : 'No additional context provided';

  const prompt = `Research this person and build a comprehensive profile:

NAME: ${name}
${contextStr}

Search for and compile:

1. **PROFESSIONAL BACKGROUND**
   - Current role and company
   - Previous companies/roles (career trajectory)
   - Notable achievements or exits
   - Industry expertise

2. **WHAT THEY'RE BUILDING/DOING NOW**
   - Current projects or focus
   - Recent announcements or launches
   - What problems are they solving?

3. **INVESTMENT/ADVISORY ACTIVITY** (if applicable)
   - Companies they've invested in
   - Boards they sit on
   - Advisory roles

4. **INTERESTS & PASSIONS**
   - What do they post about?
   - Side projects or hobbies
   - Communities they're active in

5. **RECENT ACTIVITY**
   - Recent tweets, posts, or interviews
   - What are they thinking about RIGHT NOW?
   - Any asks or needs they've expressed?

6. **CONNECTION OPPORTUNITIES**
   - What kind of people would they want to meet?
   - What could they offer others?
   - Any specific asks or needs?

7. **SURPRISING/NON-OBVIOUS FACTS**
   - Anything unexpected about their background
   - Hidden connections or interests
   - Things that would make someone say "I didn't know that!"

Return as JSON:
{
  "name": "Full Name",
  "headline": "One-line description that captures who they are",
  "current": {
    "role": "...",
    "company": "...",
    "focus": "What they're working on now"
  },
  "background": {
    "trajectory": "Career story in 2-3 sentences",
    "notable": ["Achievement 1", "Achievement 2"],
    "education": "..."
  },
  "investments": ["Company 1", "Company 2"],
  "interests": ["Interest 1", "Interest 2"],
  "recent_activity": {
    "summary": "What they've been up to lately",
    "hot_topics": ["Topic they're thinking about"],
    "asks": ["Any needs or asks they've expressed"]
  },
  "connection_value": {
    "can_offer": ["What they bring to the table"],
    "looking_for": ["What they might want"],
    "intro_angles": ["Specific reasons someone should meet them"]
  },
  "surprises": ["Non-obvious fact 1", "Non-obvious fact 2"],
  "sources": ["Where this info came from"],
  "confidence": 0.0-1.0
}`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const text = response.content[0]?.text || '';
    
    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const profile = JSON.parse(jsonMatch[0]);
      console.log(`   ✓ Research complete: ${profile.headline || 'No headline'}`);
      return { success: true, profile };
    }
    
    return { success: false, error: 'Could not parse research results', raw: text };
  } catch (e) {
    console.error(`   ✗ Research failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// FIND DEEP CONNECTIONS
// Given two researched profiles, find non-obvious connections
// ═══════════════════════════════════════════════════════════

export async function findDeepConnections(profileA, profileB) {
  console.log(`\n🔗 FINDING DEEP CONNECTIONS`);
  console.log(`   ${profileA.name} ↔ ${profileB.name}`);
  
  const prompt = `You are a world-class connector who finds non-obvious reasons why two people should meet.

PERSON A:
${JSON.stringify(profileA, null, 2)}

PERSON B:
${JSON.stringify(profileB, null, 2)}

Find the DEEP, NON-OBVIOUS connections. Not just "they're both in tech" — find the specific, compelling reasons they should meet.

Think about:
1. **Timing** — Is there something happening RIGHT NOW that makes this intro perfect?
2. **Mutual value** — What specific value can each provide the other?
3. **Hidden overlaps** — Same investors? Same communities? Worked at same company years apart?
4. **Complementary needs** — Does one need exactly what the other offers?
5. **Serendipity** — Any surprising connections that would make them both go "no way!"

Return JSON:
{
  "connection_strength": "weak" | "moderate" | "strong" | "perfect",
  "headline": "One compelling sentence about why they should meet",
  "deep_connections": [
    {
      "type": "timing" | "mutual_value" | "hidden_overlap" | "complementary" | "serendipity",
      "insight": "The specific connection",
      "why_it_matters": "Why this is compelling"
    }
  ],
  "intro_message": "A ready-to-send intro message that highlights the non-obvious connection",
  "conversation_starters": ["Specific topic they could discuss"],
  "potential_outcomes": ["What could come from this connection"],
  "urgency": "none" | "low" | "medium" | "high",
  "urgency_reason": "Why now (if applicable)"
}`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const connections = JSON.parse(jsonMatch[0]);
      console.log(`   ✓ Found ${connections.deep_connections?.length || 0} deep connections`);
      console.log(`   Strength: ${connections.connection_strength}`);
      return { success: true, connections };
    }
    
    return { success: false, error: 'Could not parse connections', raw: text };
  } catch (e) {
    console.error(`   ✗ Connection finding failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// RESEARCH + MATCH PIPELINE
// Full flow: names → research → deep match
// ═══════════════════════════════════════════════════════════

export async function deepMatch(userProfile, candidateName, candidateHints = {}) {
  console.log(`\n════════════════════════════════════════════`);
  console.log(`DEEP MATCH: ${userProfile.name} ↔ ${candidateName}`);
  console.log(`════════════════════════════════════════════`);
  
  // Research the candidate
  const research = await researchPerson(candidateName, candidateHints);
  
  if (!research.success) {
    return { 
      success: false, 
      candidate: candidateName,
      error: research.error 
    };
  }
  
  // Find deep connections
  const connections = await findDeepConnections(userProfile, research.profile);
  
  if (!connections.success) {
    return {
      success: false,
      candidate: candidateName,
      research: research.profile,
      error: connections.error
    };
  }
  
  return {
    success: true,
    candidate: candidateName,
    research: research.profile,
    connections: connections.connections,
  };
}

// ═══════════════════════════════════════════════════════════
// BATCH RESEARCH + RANK
// Research multiple candidates and find best matches
// ═══════════════════════════════════════════════════════════

export async function findBestMatches(userProfile, candidates, options = {}) {
  const { maxCandidates = 5, parallel = 2 } = options;
  
  console.log(`\n🎯 FINDING BEST MATCHES FOR: ${userProfile.name}`);
  console.log(`   Candidates: ${candidates.length}`);
  
  const results = [];
  
  // Process in batches
  for (let i = 0; i < Math.min(candidates.length, maxCandidates); i += parallel) {
    const batch = candidates.slice(i, i + parallel);
    
    const batchResults = await Promise.all(
      batch.map(c => deepMatch(userProfile, c.name, c.hints || {}))
    );
    
    results.push(...batchResults);
    
    // Rate limiting
    if (i + parallel < candidates.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // Rank by connection strength
  const strengthOrder = { perfect: 4, strong: 3, moderate: 2, weak: 1 };
  
  const ranked = results
    .filter(r => r.success)
    .sort((a, b) => {
      const aStrength = strengthOrder[a.connections?.connection_strength] || 0;
      const bStrength = strengthOrder[b.connections?.connection_strength] || 0;
      return bStrength - aStrength;
    });
  
  console.log(`\n✅ MATCHING COMPLETE`);
  console.log(`   Successful: ${ranked.length}/${results.length}`);
  if (ranked.length > 0) {
    console.log(`   Top match: ${ranked[0].candidate} (${ranked[0].connections?.connection_strength})`);
  }
  
  return {
    matches: ranked,
    errors: results.filter(r => !r.success),
  };
}

export default {
  researchPerson,
  findDeepConnections,
  deepMatch,
  findBestMatches,
};
