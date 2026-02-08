import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { supabase, upsertProfile, saveChat, getAllProfiles, getNetworkStats } from './supabase.js';
import * as userProfile from './user-profile.js';
import * as enrichment from './enrichment.js';
import { runResearchLoop } from './research-loop.js';
import { autoResearch, quickResearch } from './auto-research.js';
import { processProfileInput } from './profile-wizard.js';
import { whoToTalkTo } from './who-to-talk-to.js';
import { extractIntents, extractTimingSignals, discoverConnections } from './discovery-engine.js';
import * as contactMemory from './contact-memory.js';
import * as matchEngine from './match-engine.js';
import * as deepResearch from './deep-research.js';
import * as webResearch from './web-research.js';
import * as identityResolver from './identity-resolver.js';

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

// ============ USER PROFILE ENDPOINTS ============

// Create or update user
app.post('/api/user', async (req, res) => {
  try {
    const user = await userProfile.createOrUpdateUser(req.body);
    res.json({ user });
  } catch (err) {
    console.error('User create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user by phone
app.get('/api/user/:phone', async (req, res) => {
  try {
    const user = await userProfile.getUserByPhone(req.params.phone);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full profile
app.get('/api/user/:userId/full', async (req, res) => {
  try {
    const profile = await userProfile.getFullProfile(req.params.userId);
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add work history
app.post('/api/user/:userId/work', async (req, res) => {
  try {
    const work = await userProfile.addWorkHistory(req.params.userId, req.body);
    res.json({ work });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add education
app.post('/api/user/:userId/education', async (req, res) => {
  try {
    const edu = await userProfile.addEducation(req.params.userId, req.body);
    res.json({ education: edu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add interest
app.post('/api/user/:userId/interest', async (req, res) => {
  try {
    const interest = await userProfile.addInterest(req.params.userId, req.body);
    res.json({ interest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add goal
app.post('/api/user/:userId/goal', async (req, res) => {
  try {
    const goal = await userProfile.addGoal(req.params.userId, req.body);
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add community
app.post('/api/user/:userId/community', async (req, res) => {
  try {
    const community = await userProfile.addCommunity(req.params.userId, req.body);
    res.json({ community });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add social profile
app.post('/api/user/:userId/social', async (req, res) => {
  try {
    const social = await userProfile.addSocialProfile(req.params.userId, req.body);
    res.json({ social });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add relationship
app.post('/api/user/:userId/relationship', async (req, res) => {
  try {
    const rel = await userProfile.addRelationship(req.params.userId, req.body);
    res.json({ relationship: rel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get profile completeness
app.get('/api/user/:userId/completeness', async (req, res) => {
  try {
    const result = await userProfile.calculateCompleteness(req.params.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ENRICHMENT ENDPOINTS ============

// Enrich from LinkedIn
app.post('/api/user/:userId/enrich/linkedin', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'LinkedIn URL required' });
    const result = await enrichment.enrichFromLinkedIn(req.params.userId, url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrich from Twitter
app.post('/api/user/:userId/enrich/twitter', async (req, res) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: 'Twitter handle required' });
    const result = await enrichment.enrichFromTwitter(req.params.userId, handle);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrich from GitHub
app.post('/api/user/:userId/enrich/github', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'GitHub username required' });
    const result = await enrichment.enrichFromGitHub(req.params.userId, username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrich from Instagram
app.post('/api/user/:userId/enrich/instagram', async (req, res) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: 'Instagram handle required' });
    const result = await enrichment.enrichFromInstagram(req.params.userId, handle);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Discover profiles from name/email
app.post('/api/user/:userId/enrich/discover', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await enrichment.enrichFromNameEmail(req.params.userId, name, email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run full enrichment pipeline
app.post('/api/user/:userId/enrich/all', async (req, res) => {
  try {
    const result = await enrichment.runFullEnrichment(req.params.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run recursive research loop (requires Claude API)
app.post('/api/user/:userId/research', async (req, res) => {
  try {
    const { maxIterations = 5 } = req.body;
    const result = await runResearchLoop(req.params.userId, { maxIterations });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-research from inputs (no API key needed)
app.post('/api/user/:userId/auto-research', async (req, res) => {
  try {
    const inputs = req.body; // { name, email, phone, city, company, ... }
    const result = await autoResearch(req.params.userId, inputs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick research using existing user data
app.post('/api/user/:userId/quick-research', async (req, res) => {
  try {
    const result = await quickResearch(req.params.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Profile wizard - structured input processing
app.post('/api/user/:userId/wizard', async (req, res) => {
  try {
    const result = await processProfileInput(req.params.userId, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DISCOVERY ENGINE ENDPOINTS ============

// Main endpoint: Who should I talk to?
app.post('/api/discover', async (req, res) => {
  try {
    const { profile, chatData, options = {} } = req.body;
    
    if (!profile || !profile.name) {
      return res.status(400).json({ error: 'Profile with name is required' });
    }
    if (!chatData || !chatData.messages) {
      return res.status(400).json({ error: 'Chat data with messages is required' });
    }
    
    console.log(`\n🔍 Discovery request for ${profile.name}`);
    console.log(`   Messages: ${chatData.messages.length}`);
    console.log(`   Members: ${chatData.members?.length || 'unknown'}`);
    
    const result = await whoToTalkTo(profile, chatData, options);
    
    res.json(result);
  } catch (err) {
    console.error('Discovery error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Extract intents from messages (standalone)
app.post('/api/discover/intents', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    const intents = extractIntents(messages);
    
    // Group by sender for readability
    const bySender = {};
    intents.forEach(i => {
      if (!bySender[i.sender]) bySender[i.sender] = [];
      bySender[i.sender].push(i);
    });
    
    res.json({ 
      total: intents.length,
      intents,
      by_sender: bySender,
    });
  } catch (err) {
    console.error('Intent extraction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Extract timing signals from messages (standalone)
app.post('/api/discover/timing', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    const signals = extractTimingSignals(messages);
    
    // Group by sender
    const bySender = {};
    signals.forEach(s => {
      if (!bySender[s.sender]) bySender[s.sender] = [];
      bySender[s.sender].push(s);
    });
    
    res.json({
      total: signals.length,
      signals,
      by_sender: bySender,
    });
  } catch (err) {
    console.error('Timing extraction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run discovery with pre-built brain (for testing)
app.post('/api/discover/match', async (req, res) => {
  try {
    const { profile, candidates, brain = {}, options = {} } = req.body;
    
    if (!profile || !candidates) {
      return res.status(400).json({ error: 'Profile and candidates required' });
    }
    
    const recommendations = discoverConnections(profile, candidates, brain, options);
    
    res.json({
      count: recommendations.length,
      recommendations,
    });
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ CONTACT MEMORY ENDPOINTS ============
// "Who Is This?" - Never forget where you met someone

// Save a new contact with context
app.post('/api/contacts', async (req, res) => {
  try {
    const { phone, name, context, tags, category, location, calendarEvent, photoUrl, userId } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const contact = await contactMemory.saveContact({
      phone,
      name,
      contextRaw: context,
      tags,
      category,
      savedLocation: location,
      calendarEvent,
      photoUrl,
      userId,
    });
    
    res.json({ contact });
  } catch (err) {
    console.error('Save contact error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Who Is This? - Lookup a contact by phone number
app.get('/api/contacts/lookup/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    
    const card = await contactMemory.generateContextCard(phone, userId);
    res.json(card);
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search contacts by name or context
app.get('/api/contacts/search', async (req, res) => {
  try {
    const { q, userId, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    if (!q) {
      return res.json({ contacts: [] });
    }
    
    const contacts = await contactMemory.searchContacts(q, userId, parseInt(limit));
    res.json({ contacts, count: contacts.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all contacts for a user
app.get('/api/contacts', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    
    const contacts = await contactMemory.getAllContacts(userId);
    res.json({ contacts, count: contacts.length });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get mystery contacts (no context)
app.get('/api/contacts/mystery', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    
    const contacts = await contactMemory.getMysteryContacts(userId, parseInt(limit));
    res.json({ contacts, count: contacts.length });
  } catch (err) {
    console.error('Mystery contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get contact memory stats
app.get('/api/contacts/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    
    const stats = await contactMemory.getStats(userId);
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find contacts saved around the same time (same event inference)
app.get('/api/contacts/:phone/related', async (req, res) => {
  try {
    const { phone } = req.params;
    const { userId, windowMinutes = 30 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query param required' });
    }
    
    const related = await contactMemory.findRelatedContacts(phone, userId, parseInt(windowMinutes));
    res.json({ related, count: related.length });
  } catch (err) {
    console.error('Related contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Use LLM to infer context from sparse signals
app.post('/api/contacts/:phone/infer', async (req, res) => {
  try {
    const { phone } = req.params;
    const { userId, additionalSignals = {} } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const contact = await contactMemory.lookupByPhone(phone, userId);
    if (!contact) {
      // Create basic info from phone number
      const phoneInfo = contactMemory.parsePhoneInfo(phone);
      const inference = await contactMemory.inferContext({ phone, phoneInfo }, additionalSignals);
      return res.json({ contact: null, inference });
    }
    
    const inference = await contactMemory.inferContext(contact, additionalSignals);
    res.json({ contact, inference });
  } catch (err) {
    console.error('Infer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parse phone number info (no auth required - utility)
app.get('/api/phone/parse/:phone', (req, res) => {
  try {
    const { phone } = req.params;
    const info = contactMemory.parsePhoneInfo(phone);
    res.json(info);
  } catch (err) {
    console.error('Phone parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk import contacts
app.post('/api/contacts/import', async (req, res) => {
  try {
    const { contacts, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'contacts array is required' });
    }
    
    const results = await contactMemory.importContacts(contacts, userId);
    res.json(results);
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update contact enrichment
app.patch('/api/contacts/:phone/enrichment', async (req, res) => {
  try {
    const { phone } = req.params;
    const { userId, enrichment } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const updated = await contactMemory.updateEnrichment(phone, userId, enrichment);
    res.json({ contact: updated });
  } catch (err) {
    console.error('Update enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ PROFILE BUILDER ENDPOINTS ============
// Manual input → rich profile pipeline

import * as profileBuilder from './profile-builder.js';

// Build a full profile from manual inputs
// POST /api/profile/build
// Body: { name, phone, linkedin, instagram, x, email }
app.post('/api/profile/build', async (req, res) => {
  try {
    const { name, phone, linkedin, instagram, x, email } = req.body;
    
    if (!name && !phone && !email) {
      return res.status(400).json({ 
        error: 'At least one of name, phone, or email is required' 
      });
    }
    
    const result = await profileBuilder.buildProfile({
      name,
      phone,
      linkedin,
      instagram,
      x,
      email,
    });
    
    res.json(result);
  } catch (err) {
    console.error('Profile build error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quick profile check (verification only, no enrichment)
// POST /api/profile/quick
// Body: { name, phone, linkedin, instagram, x }
app.post('/api/profile/quick', async (req, res) => {
  try {
    const { name, phone, linkedin, instagram, x } = req.body;
    
    const result = await profileBuilder.quickBuildProfile({
      name,
      phone,
      linkedin,
      instagram,
      x,
    });
    
    res.json(result);
  } catch (err) {
    console.error('Quick profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parse a phone number (utility endpoint)
// GET /api/profile/phone/:phone
app.get('/api/profile/phone/:phone', (req, res) => {
  try {
    const { phone } = req.params;
    const info = profileBuilder.parsePhoneNumber(decodeURIComponent(phone));
    res.json(info);
  } catch (err) {
    console.error('Phone parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch import profiles
// POST /api/profile/batch
// Body: { profiles: [{name, phone, ...}, ...], quickMode: boolean }
app.post('/api/profile/batch', async (req, res) => {
  try {
    const { profiles, quickMode = false, concurrency = 3 } = req.body;
    
    if (!profiles || !Array.isArray(profiles)) {
      return res.status(400).json({ error: 'profiles array is required' });
    }
    
    if (profiles.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 profiles per batch' });
    }
    
    const result = await profileBuilder.batchBuildProfiles(profiles, {
      quickMode,
      concurrency: Math.min(concurrency, 5), // Cap at 5
    });
    
    res.json(result);
  } catch (err) {
    console.error('Batch import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parse CSV and preview profiles
// POST /api/profile/parse-csv
// Body: { csv: "name,phone,linkedin\n..." }
app.post('/api/profile/parse-csv', (req, res) => {
  try {
    const { csv } = req.body;
    
    if (!csv) {
      return res.status(400).json({ error: 'csv text is required' });
    }
    
    const profiles = profileBuilder.parseCSV(csv);
    res.json({ 
      profiles, 
      count: profiles.length,
      fields: profiles.length > 0 ? Object.keys(profiles[0]) : [],
    });
  } catch (err) {
    console.error('CSV parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify a single handle
// GET /api/profile/verify/:platform/:handle
app.get('/api/profile/verify/:platform/:handle', async (req, res) => {
  try {
    const { platform, handle } = req.params;
    
    let result;
    switch (platform.toLowerCase()) {
      case 'instagram':
      case 'ig':
        result = await profileBuilder.verifyInstagramHandle(handle);
        break;
      case 'twitter':
      case 'x':
        result = await profileBuilder.verifyTwitterHandle(handle);
        break;
      case 'linkedin':
        result = await profileBuilder.verifyLinkedInUrl(handle);
        break;
      default:
        return res.status(400).json({ error: `Unknown platform: ${platform}` });
    }
    
    res.json(result);
  } catch (err) {
    console.error('Verify handle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ SAVED PROFILES ENDPOINTS ============

import { saveBuiltProfile, getBuiltProfiles, getAllProfiles as getAllSavedProfiles } from './supabase.js';

// Get all saved profiles (from Profile Builder)
app.get('/api/profiles', async (req, res) => {
  try {
    const { source, limit = 50, offset = 0 } = req.query;
    
    let profiles;
    if (source === 'builder') {
      profiles = await getBuiltProfiles({ limit: parseInt(limit), offset: parseInt(offset) });
    } else {
      profiles = await getAllSavedProfiles();
    }
    
    res.json({ 
      profiles, 
      count: profiles.length,
    });
  } catch (err) {
    console.error('Get profiles error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ MATCH ENGINE ENDPOINTS ============
// Find connections between profiles

// Find all matches in a set of profiles
// POST /api/match/find
// Body: { profiles: [...], options: { minScore, maxMatches } }
app.post('/api/match/find', (req, res) => {
  try {
    const { profiles, options = {} } = req.body;
    
    if (!profiles || !Array.isArray(profiles)) {
      return res.status(400).json({ error: 'profiles array is required' });
    }
    
    if (profiles.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 profiles to find matches' });
    }
    
    const matches = matchEngine.findMatches(profiles, options);
    
    res.json({
      matches,
      count: matches.length,
      profiles_analyzed: profiles.length,
    });
  } catch (err) {
    console.error('Match find error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find matches for a specific person against a pool
// POST /api/match/for
// Body: { target: {...}, candidates: [...], options: {} }
app.post('/api/match/for', (req, res) => {
  try {
    const { target, candidates, options = {} } = req.body;
    
    if (!target) {
      return res.status(400).json({ error: 'target profile is required' });
    }
    if (!candidates || !Array.isArray(candidates)) {
      return res.status(400).json({ error: 'candidates array is required' });
    }
    
    const matches = matchEngine.findMatchesFor(target, candidates, options);
    
    res.json({
      target: target.name || target.display_name,
      matches,
      count: matches.length,
    });
  } catch (err) {
    console.error('Match for error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Score a specific pair
// POST /api/match/score
// Body: { profileA: {...}, profileB: {...} }
app.post('/api/match/score', (req, res) => {
  try {
    const { profileA, profileB } = req.body;
    
    if (!profileA || !profileB) {
      return res.status(400).json({ error: 'Both profileA and profileB are required' });
    }
    
    const result = matchEngine.scoreMatch(profileA, profileB);
    const intro = matchEngine.generateIntroSuggestion(profileA, profileB, result);
    
    res.json({
      ...result,
      intro_suggestion: intro,
    });
  } catch (err) {
    console.error('Match score error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate intro message for a match
// POST /api/match/intro
// Body: { profileA, profileB, matchResult }
app.post('/api/match/intro', (req, res) => {
  try {
    const { profileA, profileB, matchResult } = req.body;
    
    if (!profileA || !profileB) {
      return res.status(400).json({ error: 'Both profiles are required' });
    }
    
    // If no matchResult provided, calculate it
    const result = matchResult || matchEngine.scoreMatch(profileA, profileB);
    const intro = matchEngine.generateIntroSuggestion(profileA, profileB, result);
    
    res.json({
      intro,
      match: result,
    });
  } catch (err) {
    console.error('Intro generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find matches using saved profiles
// GET /api/match/network
// Returns matches across all saved profiles
app.get('/api/match/network', async (req, res) => {
  try {
    const { minScore = 20, maxMatches = 50 } = req.query;
    
    // Get all saved profiles
    const profiles = await getAllSavedProfiles();
    
    if (profiles.length < 2) {
      return res.json({ 
        matches: [], 
        count: 0, 
        profiles_analyzed: profiles.length,
        message: 'Need at least 2 profiles to find matches',
      });
    }
    
    // Find matches
    const matches = matchEngine.findMatches(profiles, {
      minScore: parseInt(minScore),
      maxMatches: parseInt(maxMatches),
    });
    
    res.json({
      matches,
      count: matches.length,
      profiles_analyzed: profiles.length,
    });
  } catch (err) {
    console.error('Network match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ DEEP RESEARCH ENDPOINTS ============
// Real research → non-obvious connections

// ============ IDENTITY RESOLVER ENDPOINTS ============

// Extract identity signals from chat for a person
// POST /api/identity/extract
app.post('/api/identity/extract', (req, res) => {
  try {
    const { personName, messages, members } = req.body;
    
    if (!personName) {
      return res.status(400).json({ error: 'personName is required' });
    }
    
    const context = identityResolver.enrichFromChatContext(
      personName, 
      messages || [], 
      members || []
    );
    
    const confidence = identityResolver.calculateIdentityConfidence({
      phone_verified: context.phones_found?.length > 0,
      linkedin_handle: context.handles_found?.linkedin?.[0],
      linkedin_source: context.handles_found?.linkedin?.[0] ? 'direct' : null,
      twitter_handle: context.handles_found?.twitter?.[0],
      twitter_source: context.handles_found?.twitter?.[0] ? 'direct' : null,
    });
    
    res.json({
      ...context,
      identity_confidence: confidence,
    });
  } catch (err) {
    console.error('Identity extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Build a verified profile with user input
// POST /api/identity/verify
app.post('/api/identity/verify', (req, res) => {
  try {
    const { chatProfile, additionalData } = req.body;
    
    if (!chatProfile) {
      return res.status(400).json({ error: 'chatProfile is required' });
    }
    
    const verified = identityResolver.buildVerifiedProfile(chatProfile, additionalData || {});
    res.json(verified);
  } catch (err) {
    console.error('Identity verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate verification questions for a profile
// POST /api/identity/questions
app.post('/api/identity/questions', async (req, res) => {
  try {
    const { profile, includeSearch = true } = req.body;
    
    if (!profile) {
      return res.status(400).json({ error: 'profile is required' });
    }
    
    let searchResults = [];
    if (includeSearch && profile.display_name) {
      const search = await webResearch.researchPerson(profile.display_name, {
        city: profile.city,
        context: profile.context,
      });
      searchResults = search.searches?.linkedin || [];
    }
    
    const questions = identityResolver.generateVerificationQuestions(profile, searchResults);
    res.json({ questions, searchResults });
  } catch (err) {
    console.error('Identity questions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Web search a person (no LLM, just raw search)
// POST /api/research/web
app.post('/api/research/web', async (req, res) => {
  try {
    const { name, hints = {} } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const result = await webResearch.researchPerson(name, hints);
    res.json(result);
  } catch (err) {
    console.error('Web research error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Research a single person (with LLM)
// POST /api/research/person
app.post('/api/research/person', async (req, res) => {
  try {
    const { name, hints = {} } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const result = await deepResearch.researchPerson(name, hints);
    res.json(result);
  } catch (err) {
    console.error('Research error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find deep connections between two profiles
// POST /api/research/connect
app.post('/api/research/connect', async (req, res) => {
  try {
    const { profileA, profileB } = req.body;
    
    if (!profileA || !profileB) {
      return res.status(400).json({ error: 'Both profiles required' });
    }
    
    const result = await deepResearch.findDeepConnections(profileA, profileB);
    res.json(result);
  } catch (err) {
    console.error('Connect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Full deep match pipeline
// POST /api/research/deep-match
app.post('/api/research/deep-match', async (req, res) => {
  try {
    const { userProfile, candidateName, candidateHints = {} } = req.body;
    
    if (!userProfile || !candidateName) {
      return res.status(400).json({ error: 'userProfile and candidateName required' });
    }
    
    const result = await deepResearch.deepMatch(userProfile, candidateName, candidateHints);
    res.json(result);
  } catch (err) {
    console.error('Deep match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Find best matches from a list
// POST /api/research/best-matches
app.post('/api/research/best-matches', async (req, res) => {
  try {
    const { userProfile, candidates, options = {} } = req.body;
    
    if (!userProfile || !candidates) {
      return res.status(400).json({ error: 'userProfile and candidates required' });
    }
    
    const result = await deepResearch.findBestMatches(userProfile, candidates, options);
    res.json(result);
  } catch (err) {
    console.error('Best matches error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ UNIFIED BRAIN ENDPOINTS ============
// The integrated intelligence layer

// Import the unified brain (dynamic import for ES module compatibility)
let UnifiedBrain = null;
import('../src/unified-brain.js').then(module => {
  UnifiedBrain = module.default;
  console.log('   ✓ Unified Brain loaded');
}).catch(err => {
  console.error('   ✗ Failed to load Unified Brain:', err.message);
});

// Connex project root (two levels up from server/)
const CONNEX_ROOT = path.join(process.cwd(), '..', '..');

// Load user context from file
function loadUserContext() {
  const contextPath = path.join(CONNEX_ROOT, 'nathan-context.json');
  try {
    return JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
  } catch (err) {
    console.warn('Could not load user context:', err.message);
    return null;
  }
}

// Save user context to file
function saveUserContext(context) {
  const contextPath = path.join(CONNEX_ROOT, 'nathan-context.json');
  context._meta = context._meta || {};
  context._meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
  return context;
}

// Load network profiles from local JSON (fallback when Supabase unavailable)
function loadLocalProfiles() {
  const profilesPath = path.join(CONNEX_ROOT, 'network-profiles.json');
  try {
    const data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    return data.profiles || [];
  } catch (err) {
    console.warn('Could not load local profiles:', err.message);
    return [];
  }
}

// Save profiles to local JSON
function saveLocalProfiles(profiles) {
  const profilesPath = path.join(CONNEX_ROOT, 'network-profiles.json');
  const data = {
    profiles,
    _meta: {
      lastUpdated: new Date().toISOString(),
      source: 'Connex Brain',
    },
  };
  fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
  return profiles;
}

// Get all profiles (try Supabase first, fall back to local)
async function getProfiles() {
  try {
    const supabaseProfiles = await getAllProfiles();
    if (supabaseProfiles && supabaseProfiles.length > 0) {
      return supabaseProfiles;
    }
  } catch (err) {
    console.warn('Supabase unavailable, using local profiles');
  }
  return loadLocalProfiles();
}

// GET /api/brain/status - Check brain status
app.get('/api/brain/status', (req, res) => {
  const context = loadUserContext();
  
  // Count interests (handle both array and object formats)
  let interestCount = 0;
  if (context?.interests) {
    if (Array.isArray(context.interests)) {
      interestCount = context.interests.length;
    } else {
      // Object format: {obsessions, strong, casual}
      interestCount = (context.interests.obsessions?.length || 0) +
                      (context.interests.strong?.length || 0) +
                      (context.interests.casual?.length || 0);
    }
  }
  
  res.json({
    status: UnifiedBrain ? 'ready' : 'loading',
    userContext: context ? {
      name: context.name,
      location: context.location?.current,
      interests: interestCount,
      lookingFor: context.lookingFor?.length || 0,
    } : null,
  });
});

// GET /api/brain/context - Get current user context
app.get('/api/brain/context', (req, res) => {
  const context = loadUserContext();
  if (!context) {
    return res.status(404).json({ error: 'No user context found' });
  }
  res.json(context);
});

// PUT /api/brain/context - Update user context
app.put('/api/brain/context', (req, res) => {
  try {
    const current = loadUserContext() || {};
    const updated = { ...current, ...req.body };
    saveUserContext(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/brain/learn - Learn from a message
app.post('/api/brain/learn', (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    const { message, source = 'chat' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const context = loadUserContext();
    const brain = new UnifiedBrain(context);
    const updates = brain.learn(message, source);
    
    if (updates.length > 0) {
      saveUserContext(brain.exportContext());
    }
    
    res.json({
      updates,
      updatedContext: updates.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/brain/scan - The main intelligence endpoint
// Takes profiles and returns recommendations
app.post('/api/brain/scan', async (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    const {
      profiles = [],
      options = {},
      useStoredProfiles = false,
    } = req.body;
    
    // Load user context
    const context = loadUserContext();
    if (!context) {
      return res.status(400).json({ error: 'No user context configured. Set up nathan-context.json first.' });
    }
    
    // Create brain instance
    const brain = new UnifiedBrain(context);
    
    // Load profiles
    if (useStoredProfiles) {
      // Get from Supabase or local fallback
      const storedProfiles = await getProfiles();
      brain.addProfiles(storedProfiles);
    }
    
    // Add any provided profiles
    if (profiles.length > 0) {
      brain.addProfiles(profiles);
    }
    
    // Run the scan
    const result = brain.scan({
      minConfidence: options.minConfidence || 40,
      maxResults: options.maxResults || 20,
      includeOpportunities: options.includeOpportunities !== false,
      includeSerendipity: options.includeSerendipity !== false,
      includeCrossConnections: options.includeCrossConnections || false,
    });
    
    res.json(result);
  } catch (err) {
    console.error('Brain scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/brain/match - Score a single match
app.post('/api/brain/match', (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    const { profile } = req.body;
    if (!profile) {
      return res.status(400).json({ error: 'profile is required' });
    }
    
    const context = loadUserContext();
    if (!context) {
      return res.status(400).json({ error: 'No user context configured' });
    }
    
    const brain = new UnifiedBrain(context);
    const userDeep = brain.enrichProfile({
      name: context.name,
      role: context.role,
      company: context.company,
      location: context.location,
      interests: context.interests,
      affinities: context.affinities,
      lookingFor: context.lookingFor,
      offering: context.offering,
    });
    const profileDeep = brain.enrichProfile(profile);
    
    // Import findSerendipity
    import('../src/serendipity-engine.js').then(({ findSerendipity }) => {
      const result = findSerendipity(userDeep, profileDeep);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/brain/research-queue - Get profiles needing research
app.get('/api/brain/research-queue', async (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    // Get stored profiles
    const profiles = await getProfiles();
    
    const context = loadUserContext();
    const brain = new UnifiedBrain(context);
    brain.addProfiles(profiles);
    
    const queue = brain.getResearchQueue();
    res.json({
      total: queue.length,
      queue: queue.slice(0, 20).map(item => ({
        name: item.profile.name,
        confidence: item.verification.score,
        level: item.verification.level,
        gaps: item.verification.gaps,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/brain/proactive - Run proactive scan and optionally notify
// This is what Milo calls during heartbeats
app.post('/api/brain/proactive', async (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    const {
      minScore = 70,          // Only surface high-confidence matches
      notifyThreshold = 85,   // Score threshold for notification
      notify = false,         // Whether to return notification text
    } = req.body;
    
    const context = loadUserContext();
    if (!context) {
      return res.status(400).json({ error: 'No user context configured' });
    }
    
    // Get all stored profiles
    const storedProfiles = await getProfiles();
    if (storedProfiles.length === 0) {
      return res.json({
        status: 'no_profiles',
        message: 'No profiles in network to scan',
        shouldNotify: false,
      });
    }
    
    // Create brain and scan
    const brain = new UnifiedBrain(context);
    brain.addProfiles(storedProfiles);
    
    const result = brain.scan({
      minConfidence: minScore,
      maxResults: 5,
      includeOpportunities: true,
      includeSerendipity: true,
    });
    
    // Check if any matches exceed notify threshold
    const hotMatches = result.recommendations.filter(r => r.score >= notifyThreshold);
    
    // Build response
    const response = {
      status: 'scanned',
      profileCount: storedProfiles.length,
      matchCount: result.recommendations.length,
      hotMatchCount: hotMatches.length,
      shouldNotify: hotMatches.length > 0,
      topMatches: result.recommendations.slice(0, 3).map(r => ({
        name: r.profile?.name,
        score: r.score,
        type: r.type,
        reason: r.type === 'opportunity' ? r.primary?.reason : r.bestHook,
      })),
    };
    
    // Generate notification text if requested and there are hot matches
    if (notify && hotMatches.length > 0) {
      const match = hotMatches[0];
      response.notification = {
        title: `🎯 Connection opportunity: ${match.profile?.name}`,
        body: match.type === 'opportunity' 
          ? `${match.primary?.reason} — ${match.primary?.hook}`
          : match.bestHook || match.hookSummary,
        intro: match.intro,
        score: match.score,
      };
    }
    
    res.json(response);
  } catch (err) {
    console.error('Proactive scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/brain/intro - Generate intro message for a profile
app.post('/api/brain/intro', (req, res) => {
  try {
    if (!UnifiedBrain) {
      return res.status(503).json({ error: 'Brain not loaded yet' });
    }
    
    const { profileName, profiles = [] } = req.body;
    if (!profileName) {
      return res.status(400).json({ error: 'profileName is required' });
    }
    
    const context = loadUserContext();
    const brain = new UnifiedBrain(context);
    brain.addProfiles(profiles);
    brain.scan();
    
    const intro = brain.getIntro(profileName);
    res.json({ intro });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🧠 Connex Brain server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   User Profile: http://localhost:${PORT}/api/user`);
  console.log(`   Enrichment: http://localhost:${PORT}/api/user/:id/enrich/*`);
  console.log(`   Discovery: http://localhost:${PORT}/api/discover`);
  console.log(`   Contact Memory: http://localhost:${PORT}/api/contacts`);
  console.log(`   Profile Builder: http://localhost:${PORT}/api/profile/build`);
  console.log(`   Match Engine: http://localhost:${PORT}/api/match/find`);
  console.log(`   Unified Brain: http://localhost:${PORT}/api/brain/scan`);
  console.log(`   Stats: http://localhost:${PORT}/api/stats`);
});
