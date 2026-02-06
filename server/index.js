import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { supabase, upsertProfile, saveChat, getAllProfiles, getNetworkStats } from './supabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS for Vercel frontend
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://connex-app.vercel.app',
    /\.vercel\.app$/,
  ],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Load OAuth token from Clawdbot's auth store
function getAnthropicToken() {
  const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    // Try default first, then OAuth
    const defaultProfile = auth.profiles['anthropic:default'];
    if (defaultProfile?.token && !defaultProfile.token.includes('Symbol')) {
      return defaultProfile.token;
    }
    const oauthProfile = auth.profiles['anthropic:claude-cli'];
    if (oauthProfile?.access) {
      return oauthProfile.access;
    }
    throw new Error('No valid token found');
  } catch (err) {
    console.error('Failed to load Anthropic token:', err.message);
    return null;
  }
}

// Create Anthropic client
function getClient() {
  const token = getAnthropicToken();
  if (!token) throw new Error('No Anthropic token available');
  return new Anthropic({ apiKey: token });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ ANALYZE ENDPOINT ============
const ANALYZE_SYSTEM_PROMPT = `You are the Connex Brain — an expert at analyzing WhatsApp group chat exports to build rich member profiles.

Given a WhatsApp chat export, analyze every member and return structured JSON profiles.

For each member, extract as much as you can infer from their messages and the context of conversations about them:

PROFILE SCHEMA:
{
  "name": "Display Name from chat",
  "role": "Job title/role if mentioned or inferable",
  "company": "Company if mentioned",
  "industry": "Industry if inferable",
  "location": {
    "city": "Primary city (best guess from context)",
    "neighborhood": "If mentioned",
    "timezone": "Inferred timezone"
  },
  "interests": ["Array of specific interests mentioned or implied"],
  "expertise": ["What they seem to know deeply based on how they talk"],
  "affinities": {
    "sports": ["Teams or sports mentioned"],
    "food": ["Food preferences, restaurants, cuisines"],
    "other": ["Other hobbies, activities"]
  },
  "looking_for": ["What they seem to need — cofounder, advice, connections, etc."],
  "offering": ["What they could provide to others — expertise, introductions, resources"],
  "activity_score": 0.0,
  "personality_notes": "Brief personality read based on communication style",
  "context_sources": [
    {"type": "direct_statement|inference|mention_by_others", "detail": "what was said", "confidence": 0.0}
  ]
}

RULES:
1. Return ONLY valid JSON — an object with "profiles" and "group_insights" arrays
2. activity_score: 0.0-1.0 based on message volume relative to group
3. confidence in context_sources: 0.9+ for direct statements, 0.5-0.8 for strong inference
4. Be creative with inference
5. Every field should have a value if you can infer one. Use null only if truly unknown.`;

app.post('/api/analyze', async (req, res) => {
  try {
    const { chatContent, memberCount } = req.body;
    
    if (!chatContent) {
      return res.status(400).json({ error: 'chatContent is required' });
    }

    const client = getClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: ANALYZE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze this WhatsApp chat export (${memberCount || 'unknown'} members) and return structured JSON profiles for all members:\n\n${chatContent.slice(0, 100000)}`
      }]
    });

    const text = response.content[0]?.text || '';
    
    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 🗄️ PERSIST TO SUPABASE
        if (parsed.profiles && Array.isArray(parsed.profiles)) {
          console.log(`💾 Saving ${parsed.profiles.length} profiles to Supabase...`);
          for (const profile of parsed.profiles) {
            try {
              await upsertProfile(profile);
            } catch (dbErr) {
              console.error('Profile save error:', dbErr.message);
            }
          }
          console.log('✅ Profiles saved');
        }
        
        return res.json(parsed);
      } catch (e) {
        return res.json({ raw: text, parseError: e.message });
      }
    }
    
    res.json({ raw: text });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ MATCH ENDPOINT ============
const MATCH_PROMPT = `You are the Connex Brain — Match Evaluator.

Evaluate how likely a meaningful connection is between a user and a contact.

Return JSON:
{
  "match_score": 0-100,
  "match_tier": "strong|promising|weak|insufficient_data",
  "commonalities": [
    {"type": "school|company|location|interest|industry|lifestyle", "detail": "Specific commonality", "confidence": 0.0-1.0}
  ],
  "non_obvious": ["Things that aren't surface-level but could create real connection"],
  "connection_potential": "One paragraph: why these two should or shouldn't meet",
  "intro_angle": "If strong match: the specific angle for the introduction"
}`;

app.post('/api/match', async (req, res) => {
  try {
    const { userProfile, contactProfile } = req.body;
    
    const client = getClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: MATCH_PROMPT,
      messages: [{
        role: 'user',
        content: `USER PROFILE:\n${JSON.stringify(userProfile, null, 2)}\n\nCONTACT PROFILE:\n${JSON.stringify(contactProfile, null, 2)}`
      }]
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return res.json(JSON.parse(jsonMatch[0]));
      } catch (e) {
        return res.json({ raw: text });
      }
    }
    res.json({ raw: text });
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ SMART SEARCH ENDPOINT ============
app.post('/api/smart-search', async (req, res) => {
  try {
    const { userProfile, contacts, chatContext } = req.body;
    
    const client = getClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are the Connex Brain — Smart Search Agent.

Given a user profile and a list of contacts from a WhatsApp chat, identify the top matches.

Return JSON:
{
  "ranked_matches": [
    {
      "name": "Contact name",
      "match_score": 0-100,
      "reasons": ["Why they should connect"],
      "intro_angle": "Specific conversation starter",
      "evidence": ["Quotes or signals from chat that support this match"]
    }
  ],
  "insights": "Overall analysis of the network for this user"
}`,
      messages: [{
        role: 'user',
        content: `USER PROFILE:\n${JSON.stringify(userProfile, null, 2)}\n\nCONTACTS:\n${JSON.stringify(contacts, null, 2)}\n\nCHAT CONTEXT (sample):\n${chatContext?.slice(0, 30000) || 'None provided'}`
      }]
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return res.json(JSON.parse(jsonMatch[0]));
      } catch (e) {
        return res.json({ raw: text });
      }
    }
    res.json({ raw: text });
  } catch (err) {
    console.error('Smart search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ GENERIC CHAT ENDPOINT ============
app.post('/api/chat', async (req, res) => {
  try {
    const { system, messages, model = 'claude-sonnet-4-20250514', max_tokens = 4096 } = req.body;
    
    const client = getClient();
    
    const response = await client.messages.create({
      model,
      max_tokens,
      system: system || 'You are a helpful assistant.',
      messages: messages || []
    });

    res.json({
      content: response.content,
      usage: response.usage,
      model: response.model
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NETWORK DATA ENDPOINTS ============

// Get all profiles in the network
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await getAllProfiles();
    res.json({ profiles, count: profiles.length });
  } catch (err) {
    console.error('Get profiles error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get network stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getNetworkStats();
    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search profiles by name
app.get('/api/profiles/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ profiles: [] });
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`name.ilike.%${q}%,display_name.ilike.%${q}%,company.ilike.%${q}%`)
      .limit(20);
    
    res.json({ profiles: data || [] });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find cross-chat connections (people in multiple chats)
app.get('/api/connectors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_members')
      .select(`
        profile_id,
        profiles (name, company, location),
        chat_id
      `)
      .order('profile_id');
    
    // Group by profile and count chats
    const profileChats = {};
    (data || []).forEach(row => {
      if (!profileChats[row.profile_id]) {
        profileChats[row.profile_id] = { 
          profile: row.profiles, 
          chats: [] 
        };
      }
      profileChats[row.profile_id].chats.push(row.chat_id);
    });
    
    // Filter to people in 2+ chats
    const connectors = Object.entries(profileChats)
      .filter(([_, v]) => v.chats.length > 1)
      .map(([id, v]) => ({ 
        profile_id: id, 
        ...v.profile, 
        chat_count: v.chats.length 
      }))
      .sort((a, b) => b.chat_count - a.chat_count);
    
    res.json({ connectors });
  } catch (err) {
    console.error('Connectors error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🧠 Connex Brain server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Profiles: http://localhost:${PORT}/api/profiles`);
  console.log(`   Stats: http://localhost:${PORT}/api/stats`);
});
