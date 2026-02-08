// ═══════════════════════════════════════════════════════════
// WHO TO TALK TO - Main Orchestrator
// 
// Takes raw chat data + your profile → actionable recommendations
// "Here's who you should talk to this week and exactly what to say"
// ═══════════════════════════════════════════════════════════

import { 
  extractIntents, 
  extractTimingSignals, 
  discoverConnections 
} from './discovery-engine.js';

// Import existing analyzers (these are in the frontend but we'll reference the logic)
// In production, these would be shared modules

/**
 * Main entry point: Who should you talk to right now?
 * 
 * @param {Object} yourProfile - Your profile
 * @param {Object} parsedChat - Output from chat parser (messages, members, stats)
 * @param {Object} options - Configuration
 * @returns {Object} Recommendations with full context
 */
export async function whoToTalkTo(yourProfile, parsedChat, options = {}) {
  const {
    yourCity = yourProfile.city || null,
    maxResults = 5,
    includeEvidence = true,
  } = options;

  console.log(`\n🔍 Analyzing who ${yourProfile.name} should talk to...\n`);

  // ─── STEP 1: Build the brain from chat data ───
  console.log('📊 Extracting signals from messages...');
  
  const brain = {
    messages: parsedChat.messages,
    members: parsedChat.members,
    intents: extractIntents(parsedChat.messages),
    timingSignals: extractTimingSignals(parsedChat.messages),
    relationshipGraph: buildRelationshipGraph(parsedChat),
  };

  console.log(`   Found ${brain.intents.length} intents`);
  console.log(`   Found ${brain.timingSignals.length} timing signals`);
  console.log(`   Built graph with ${brain.relationshipGraph.length} relationships`);

  // ─── STEP 2: Build candidate profiles ───
  console.log('\n👥 Building candidate profiles...');
  
  const candidates = parsedChat.members.map(member => ({
    display_name: member.name,
    message_count: member.messageCount,
    first_seen: member.firstSeen,
    last_seen: member.lastSeen,
    interests: extractMemberInterests(member.name, parsedChat.messages),
    location: extractMemberLocation(member.name, parsedChat.messages),
    brain: {
      intents: brain.intents.filter(i => i.sender === member.name),
      timing: brain.timingSignals.filter(t => t.sender === member.name),
    },
    // Will be enriched with offerings/needs if we have external data
    offering: [],
    looking_for: [],
  }));

  console.log(`   Processed ${candidates.length} candidates`);

  // ─── STEP 3: Run discovery engine ───
  console.log('\n🎯 Running discovery engine...');
  
  const recommendations = discoverConnections(
    yourProfile,
    candidates,
    brain,
    { yourCity, maxResults: maxResults * 2, minScore: options.minScore ?? 10 }
  );

  // ─── STEP 4: Enrich with evidence ───
  if (includeEvidence) {
    console.log('\n📝 Gathering evidence...');
    
    recommendations.forEach(rec => {
      rec.evidence = gatherEvidence(rec.person, parsedChat.messages, brain);
    });
  }

  // ─── STEP 5: Format output ───
  const output = {
    generated_at: new Date().toISOString(),
    your_profile: {
      name: yourProfile.name,
      city: yourCity,
      interests: yourProfile.interests,
      looking_for: yourProfile.looking_for,
      offering: yourProfile.offering,
    },
    chat_stats: {
      total_messages: parsedChat.stats.totalMessages,
      total_members: parsedChat.stats.totalMembers,
      date_range: parsedChat.stats.dateRange,
    },
    brain_stats: {
      intents_found: brain.intents.length,
      timing_signals: brain.timingSignals.length,
      relationships_mapped: brain.relationshipGraph.length,
    },
    recommendations: recommendations.slice(0, maxResults).map((rec, idx) => ({
      rank: idx + 1,
      person: rec.person,
      score: rec.score,
      why: rec.signals.slice(0, 5).map(s => s.signal),
      timing: rec.timing ? {
        type: rec.timing.type,
        detail: rec.timing.location || rec.timing.detail,
        days_ago: rec.timing.daysSince,
      } : null,
      warm_path: rec.warmPath ? {
        type: rec.warmPath.type,
        via: rec.warmPath.via || null,
        description: rec.warmPath.description,
      } : null,
      fit: {
        you_can_help: rec.fit?.youCanHelp || [],
        they_can_help: rec.fit?.theyCanHelp || [],
      },
      activation: rec.activation,
      evidence: rec.evidence || [],
    })),
    
    // Quick summary for display
    summary: generateSummary(recommendations.slice(0, maxResults), yourCity),
  };

  console.log(`\n✅ Generated ${output.recommendations.length} recommendations\n`);

  return output;
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Build relationship graph from chat
 * Simplified version - production would use the full algorithm
 */
function buildRelationshipGraph(parsedChat) {
  const interactions = {};
  const messages = parsedChat.messages;

  // Track reply chains
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    
    if (prev.sender !== curr.sender) {
      const key = [prev.sender, curr.sender].sort().join('↔');
      if (!interactions[key]) {
        interactions[key] = { replies: 0, mentions: 0, personA: prev.sender, personB: curr.sender };
      }
      interactions[key].replies++;
    }
  }

  // Track mentions
  const memberNames = new Set(parsedChat.members.map(m => m.name));
  const firstNames = new Map();
  memberNames.forEach(name => {
    const first = name.toLowerCase().split(' ')[0];
    if (first.length > 2) firstNames.set(first, name);
  });

  messages.forEach(msg => {
    const text = msg.text.toLowerCase();
    firstNames.forEach((fullName, firstName) => {
      if (text.includes(firstName) && msg.sender !== fullName) {
        const key = [msg.sender, fullName].sort().join('↔');
        if (!interactions[key]) {
          interactions[key] = { replies: 0, mentions: 0, personA: msg.sender, personB: fullName };
        }
        interactions[key].mentions++;
      }
    });
  });

  // Calculate strength
  return Object.values(interactions).map(i => {
    const strength = Math.min(
      Math.round(i.replies * 3 + i.mentions * 5),
      100
    );
    return {
      personA: i.personA,
      personB: i.personB,
      strength,
      interactions: i.replies + i.mentions,
      bidirectional: i.replies >= 2,
      label: strength >= 50 ? 'strong' : strength >= 25 ? 'moderate' : 'weak',
    };
  }).filter(r => r.strength > 0);
}

/**
 * Extract interests for a specific member from their messages
 */
function extractMemberInterests(memberName, messages) {
  const memberMessages = messages.filter(m => m.sender === memberName);
  const text = memberMessages.map(m => m.text.toLowerCase()).join(' ');
  
  const categories = {
    sports: ['ufc', 'mma', 'warriors', 'basketball', 'golf', 'football', 'soccer', 'tennis', 'gym', 'workout', 'nba', 'nfl'],
    crypto: ['bitcoin', 'btc', 'ethereum', 'crypto', 'trading', 'blockchain', 'nft', 'defi', 'solana', 'web3'],
    food: ['dim sum', 'restaurant', 'brunch', 'dinner', 'thai food', 'sushi', 'ramen', 'coffee', 'cocktails'],
    wellness: ['sauna', 'ice bath', 'massage', 'spa', 'wellness', 'yoga', 'meditation'],
    tech: ['ai', 'startup', 'coding', 'engineering', 'product', 'developer', 'software', 'llm', 'gpt'],
    business: ['fundraising', 'investor', 'funding', 'strategy', 'revenue', 'growth', 'pitch', 'vc'],
    travel: ['flight', 'airport', 'hotel', 'trip', 'vacation', 'traveling'],
    music: ['concert', 'festival', 'spotify', 'playlist', 'music', 'show', 'tickets'],
  };

  const found = [];
  Object.entries(categories).forEach(([category, keywords]) => {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) {
      found.push({
        category,
        keywords: matches,
        confidence: Math.min(matches.length / keywords.length, 1),
      });
    }
  });

  return found.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extract location signals for a member
 */
function extractMemberLocation(memberName, messages) {
  const memberMessages = messages.filter(m => m.sender === memberName);
  const text = memberMessages.map(m => m.text.toLowerCase()).join(' ');
  
  const cities = {
    'bangkok': 'Bangkok', 'bkk': 'Bangkok',
    'singapore': 'Singapore', 'sg': 'Singapore',
    'hong kong': 'Hong Kong', 'hk': 'Hong Kong',
    'san francisco': 'San Francisco', 'sf': 'San Francisco',
    'new york': 'New York', 'nyc': 'New York',
    'los angeles': 'Los Angeles', 'la': 'Los Angeles',
    'london': 'London',
    'tokyo': 'Tokyo',
    'austin': 'Austin',
    'miami': 'Miami',
    'seattle': 'Seattle',
    'denver': 'Denver',
  };

  const found = [];
  Object.entries(cities).forEach(([key, normalized]) => {
    if (text.includes(key)) {
      found.push(normalized);
    }
  });

  return {
    cities: [...new Set(found)],
    primary: found[0] || null,
    confidence: found.length > 0 ? 0.7 : 0,
  };
}

/**
 * Gather supporting evidence quotes
 */
function gatherEvidence(personName, messages, brain) {
  const evidence = [];

  // Recent intents
  brain.intents
    .filter(i => i.sender === personName)
    .slice(0, 2)
    .forEach(i => {
      evidence.push({
        type: 'intent',
        quote: i.fullText,
        date: i.date,
      });
    });

  // Timing signals
  brain.timingSignals
    .filter(t => t.sender === personName)
    .slice(0, 1)
    .forEach(t => {
      evidence.push({
        type: 'timing',
        quote: t.detail,
        date: t.date,
      });
    });

  // Recent substantive messages
  const recentMessages = messages
    .filter(m => m.sender === personName && m.text.length > 50)
    .slice(-2);
  
  recentMessages.forEach(m => {
    if (!evidence.some(e => e.quote === m.text.slice(0, 200))) {
      evidence.push({
        type: 'message',
        quote: m.text.slice(0, 200),
        date: m.date,
      });
    }
  });

  return evidence.slice(0, 4);
}

/**
 * Generate human-readable summary
 */
function generateSummary(recommendations, yourCity) {
  if (recommendations.length === 0) {
    return "No strong recommendations found. Try importing more chat history or updating your profile.";
  }

  const urgent = recommendations.filter(r => r.activation?.urgency === 'urgent');
  const high = recommendations.filter(r => r.activation?.urgency === 'high');
  
  let summary = `Found ${recommendations.length} people you should connect with`;
  
  if (urgent.length > 0) {
    summary += `. 🔥 ${urgent.length} urgent — they're in ${yourCity || 'your city'} NOW`;
  }
  if (high.length > 0) {
    summary += `. ⚡ ${high.length} time-sensitive`;
  }

  summary += '.\n\nTop recommendation: ';
  const top = recommendations[0];
  summary += `${top.person} (score: ${top.score}) — ${top.activation?.action || 'reach out'}`;

  return summary;
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export default { whoToTalkTo };
