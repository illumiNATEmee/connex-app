/**
 * SPARK ENGINE
 * 
 * Turns bland "here's who's hiring" into "here's why you need to message them TODAY"
 * 
 * The difference:
 * ❌ "Sachin is hiring AI engineers"
 * ✅ "Sachin posted 12 days ago about AI roles at Apple Vision. You're building at 
 *     crypto/AI intersection — rare combo they probably don't have. You're both LEAD 
 *     alums so you have a warm in. Message THIS WEEK before the req fills."
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

function getAnthropicToken() {
  const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    // Try OAuth first (claude-cli), then default
    const oauthProfile = auth.profiles['anthropic:claude-cli'];
    if (oauthProfile?.access) {
      return oauthProfile.access;
    }
    const defaultProfile = auth.profiles['anthropic:default'];
    if (defaultProfile?.token && !defaultProfile.token.includes('Symbol')) {
      return defaultProfile.token;
    }
  } catch (err) {
    console.error('Token error:', err.message);
  }
  return null;
}

/**
 * Calculate days since a date string
 */
function daysSince(dateStr) {
  if (!dateStr) return null;
  
  // Parse WhatsApp format: "M/D/YY H:MM:SS AM/PM" or similar
  const match = dateStr.match(/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  
  const [_, month, day, year] = match;
  const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
  const msgDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
  const now = new Date();
  
  return Math.floor((now - msgDate) / (1000 * 60 * 60 * 24));
}

/**
 * Determine urgency level based on intent type and recency
 */
function getUrgency(intent, daysAgo) {
  const urgentTypes = ['hiring', 'fundraising', 'seeking_intro'];
  const timeUrgent = daysAgo !== null && daysAgo < 14;
  const typeUrgent = urgentTypes.includes(intent.type);
  
  if (typeUrgent && timeUrgent) return 'hot';
  if (typeUrgent || timeUrgent) return 'warm';
  return 'normal';
}

/**
 * Find mutual connections or shared context
 */
function findWarmPaths(person, yourProfile, allMembers, messages) {
  const paths = [];
  
  // Same group = shared context
  paths.push({
    type: 'shared_community',
    detail: 'Same WhatsApp group / community',
    strength: 0.6
  });
  
  // Check if they've interacted with people you might know
  const theirMentions = messages
    .filter(m => m.text.includes(`@${person}`) || m.text.toLowerCase().includes(person.toLowerCase()))
    .map(m => m.sender)
    .filter(s => s !== person);
  
  if (theirMentions.length > 0) {
    paths.push({
      type: 'mentioned_by',
      detail: `Active in conversations with: ${[...new Set(theirMentions)].slice(0, 3).join(', ')}`,
      strength: 0.5
    });
  }
  
  // Check if they reply to same people you might know
  return paths;
}

/**
 * Generate the "why YOU specifically" angle
 */
function generateYouAngle(intent, yourProfile) {
  const angles = [];
  
  // Match your offerings to their needs
  if (intent.type === 'hiring') {
    if (yourProfile.offering?.some(o => o.toLowerCase().includes('engineer') || o.toLowerCase().includes('tech'))) {
      angles.push('You have technical network they need');
    }
    if (yourProfile.interests?.some(i => intent.detail?.toLowerCase().includes(i.toLowerCase()))) {
      angles.push(`Your ${yourProfile.interests.find(i => intent.detail?.toLowerCase().includes(i.toLowerCase()))} background is directly relevant`);
    }
  }
  
  if (intent.type === 'fundraising' || intent.type === 'seeking') {
    if (yourProfile.offering?.some(o => o.toLowerCase().includes('invest') || o.toLowerCase().includes('angel'))) {
      angles.push('You could be a potential investor/connector');
    }
    if (yourProfile.offering?.some(o => o.toLowerCase().includes('advice') || o.toLowerCase().includes('strategy'))) {
      angles.push('Your experience could help them');
    }
  }
  
  if (intent.type === 'seeking_intro') {
    if (yourProfile.offering?.some(o => o.toLowerCase().includes('connection') || o.toLowerCase().includes('network'))) {
      angles.push('Your network might have who they need');
    }
  }
  
  return angles;
}

/**
 * Generate a ready-to-send opener message
 */
function generateOpener(person, intent, warmPath, yourProfile) {
  const openers = {
    hiring: [
      `Hey ${person.split(' ')[0]} — saw your post about hiring. I know some strong candidates in that space and happy to make intros if helpful.`,
      `Hi ${person.split(' ')[0]}! Your hiring post caught my eye. I'm connected to several folks who might be a fit — want me to send some names your way?`,
    ],
    fundraising: [
      `Hey ${person.split(' ')[0]} — saw the ${intent.detail?.split(' ').slice(0, 4).join(' ')} post. I'd love to learn more about what you're building.`,
    ],
    seeking: [
      `Hi ${person.split(' ')[0]}! Saw you're looking for ${intent.detail?.split(' ').slice(0, 5).join(' ')}. I might be able to help — let's connect.`,
    ],
    default: [
      `Hey ${person.split(' ')[0]} — we're in the same group and your recent post caught my attention. Would love to connect.`,
    ]
  };
  
  const templates = openers[intent.type] || openers.default;
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * MAIN: Generate spark recommendations
 */
export async function generateSparks(yourProfile, intents, messages, members, options = {}) {
  const { maxResults = 5, useAI = true } = options;
  
  const sparks = [];
  
  for (const intent of intents) {
    const daysAgo = daysSince(intent.date);
    const urgency = getUrgency(intent, daysAgo);
    const warmPaths = findWarmPaths(intent.sender, yourProfile, members, messages);
    const youAngles = generateYouAngle(intent, yourProfile);
    const opener = generateOpener(intent.sender, intent, warmPaths[0], yourProfile);
    
    sparks.push({
      person: intent.sender,
      intent: intent,
      daysAgo,
      urgency,
      warmPaths,
      youAngles,
      opener,
      
      // Raw score for sorting
      score: (
        (urgency === 'hot' ? 30 : urgency === 'warm' ? 15 : 5) +
        (youAngles.length * 10) +
        (warmPaths.length * 5) +
        (daysAgo !== null && daysAgo < 7 ? 20 : daysAgo < 14 ? 10 : 0)
      )
    });
  }
  
  // Sort by score
  sparks.sort((a, b) => b.score - a.score);
  
  // If AI enabled, enhance top results with deeper reasoning
  if (useAI && sparks.length > 0) {
    const token = getAnthropicToken();
    if (token) {
      try {
        const enhanced = await enhanceWithAI(sparks.slice(0, maxResults), yourProfile, messages, token);
        return enhanced;
      } catch (err) {
        console.error('AI enhancement failed:', err.message);
      }
    }
  }
  
  return sparks.slice(0, maxResults);
}

/**
 * Use Claude to generate the "spark" narrative
 */
async function enhanceWithAI(sparks, yourProfile, messages, token) {
  const client = new Anthropic({ apiKey: token });
  
  // Get relevant messages for context
  const relevantMessages = {};
  for (const spark of sparks) {
    relevantMessages[spark.person] = messages
      .filter(m => m.sender === spark.person)
      .slice(-5)
      .map(m => `[${m.date}] ${m.text}`)
      .join('\n');
  }
  
  const prompt = `You are a strategic networking advisor. Your job is to create COMPELLING, ACTION-DRIVING recommendations.

## YOUR PROFILE (the person we're advising):
Name: ${yourProfile.name}
Location: ${yourProfile.city || 'Unknown'}
Interests: ${yourProfile.interests?.join(', ') || 'Not specified'}
Looking for: ${yourProfile.looking_for?.join(', ') || 'Not specified'}
Can offer: ${yourProfile.offering?.join(', ') || 'Not specified'}

## POTENTIAL CONNECTIONS:
${sparks.map((s, i) => `
### ${i + 1}. ${s.person}
Intent type: ${s.intent.type}
What they said: "${s.intent.detail || s.intent.fullText?.slice(0, 200)}"
Posted: ${s.daysAgo !== null ? s.daysAgo + ' days ago' : 'Unknown'}
Their recent messages:
${relevantMessages[s.person] || 'No additional context'}
`).join('\n')}

## YOUR TASK:
For each person, generate a "spark" recommendation that answers:

1. **WHY NOW** — What makes this time-sensitive? (role will fill, they're traveling, momentum is hot)
2. **WHY THEM** — What's special about THIS person vs others? (their specific situation, what they're building)
3. **WHY YOU** — Why is ${yourProfile.name} specifically the right person to reach out? (unique value, rare combo, shared context)
4. **THE MOVE** — A specific, ready-to-send message (casual, not corporate)
5. **RISK OF WAITING** — What happens if they don't act?

Return JSON array:
[
  {
    "person": "Name",
    "spark_score": 1-100,
    "why_now": "Time-sensitive reason...",
    "why_them": "What makes them special...",
    "why_you": "Why Nathan specifically...",
    "the_move": "Hey [Name] — ready to send message...",
    "risk_of_waiting": "What you lose by waiting...",
    "one_liner": "Single punchy sentence summary"
  }
]

Be specific. Be urgent. Make them WANT to message right now.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  
  if (jsonMatch) {
    try {
      const enhanced = JSON.parse(jsonMatch[0]);
      // Merge AI insights back into sparks
      return sparks.map((spark, i) => ({
        ...spark,
        ai: enhanced[i] || null
      }));
    } catch (e) {
      console.error('JSON parse error:', e.message);
    }
  }
  
  return sparks;
}

/**
 * Format sparks for display
 */
export function formatSparks(sparks) {
  let output = '';
  
  sparks.forEach((spark, i) => {
    const ai = spark.ai;
    
    output += `\n${'═'.repeat(50)}\n`;
    output += `🔥 #${i + 1}: ${spark.person}\n`;
    output += `${'═'.repeat(50)}\n`;
    
    if (ai) {
      output += `\n📍 ONE-LINER: ${ai.one_liner}\n`;
      output += `\n⏰ WHY NOW:\n   ${ai.why_now}\n`;
      output += `\n👤 WHY THEM:\n   ${ai.why_them}\n`;
      output += `\n🎯 WHY YOU:\n   ${ai.why_you}\n`;
      output += `\n💬 THE MOVE:\n   "${ai.the_move}"\n`;
      output += `\n⚠️ RISK OF WAITING:\n   ${ai.risk_of_waiting}\n`;
      output += `\n📊 SPARK SCORE: ${ai.spark_score}/100\n`;
    } else {
      output += `\n📍 ${spark.intent.type.toUpperCase()}: ${spark.intent.detail || spark.intent.fullText?.slice(0, 100)}\n`;
      output += `⏰ Posted: ${spark.daysAgo !== null ? spark.daysAgo + ' days ago' : 'Unknown'}\n`;
      output += `🔥 Urgency: ${spark.urgency}\n`;
      if (spark.youAngles.length > 0) {
        output += `🎯 Your angle: ${spark.youAngles.join(', ')}\n`;
      }
      output += `💬 Opener: "${spark.opener}"\n`;
    }
  });
  
  return output;
}

export default { generateSparks, formatSparks };
