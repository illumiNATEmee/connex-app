/**
 * Contact Memory Engine
 * "Who Is This?" - Never forget where you met someone
 * 
 * Captures context when you save contacts, recalls it when you need it.
 */

import { supabase } from './supabase.js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// PHONE NUMBER UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Normalize phone number to E.164 format
 * +14155551234
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  
  // Strip all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If no +, assume US number
  if (!cleaned.startsWith('+')) {
    // Remove leading 1 if 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else {
      // International without +, just add it
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Extract area code info from phone number
 */
export function parsePhoneInfo(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  
  // Country code detection
  const countryPatterns = {
    '+1': { country: 'US/Canada', region: null },
    '+44': { country: 'UK', region: null },
    '+852': { country: 'Hong Kong', region: 'Asia' },
    '+65': { country: 'Singapore', region: 'Asia' },
    '+66': { country: 'Thailand', region: 'Asia' },
    '+886': { country: 'Taiwan', region: 'Asia' },
    '+86': { country: 'China', region: 'Asia' },
    '+81': { country: 'Japan', region: 'Asia' },
    '+91': { country: 'India', region: 'Asia' },
    '+49': { country: 'Germany', region: 'Europe' },
    '+33': { country: 'France', region: 'Europe' },
    '+61': { country: 'Australia', region: 'Oceania' },
  };
  
  // US area codes to cities (partial list - expandable)
  const usAreaCodes = {
    '212': 'New York, NY',
    '213': 'Los Angeles, CA',
    '310': 'Los Angeles, CA',
    '323': 'Los Angeles, CA',
    '415': 'San Francisco, CA',
    '408': 'San Jose, CA',
    '650': 'Bay Area, CA',
    '510': 'Oakland, CA',
    '312': 'Chicago, IL',
    '305': 'Miami, FL',
    '786': 'Miami, FL',
    '512': 'Austin, TX',
    '713': 'Houston, TX',
    '214': 'Dallas, TX',
    '206': 'Seattle, WA',
    '617': 'Boston, MA',
    '202': 'Washington, DC',
    '303': 'Denver, CO',
    '404': 'Atlanta, GA',
    '702': 'Las Vegas, NV',
    '602': 'Phoenix, AZ',
    '858': 'San Diego, CA',
  };
  
  let info = {
    normalized,
    original: phone,
    countryCode: null,
    country: null,
    region: null,
    areaCode: null,
    likelyCity: null,
  };
  
  // Match country code
  for (const [code, data] of Object.entries(countryPatterns)) {
    if (normalized.startsWith(code)) {
      info.countryCode = code;
      info.country = data.country;
      info.region = data.region;
      break;
    }
  }
  
  // For US/Canada, extract area code
  if (info.countryCode === '+1' && normalized.length >= 12) {
    const areaCode = normalized.substring(2, 5);
    info.areaCode = areaCode;
    info.likelyCity = usAreaCodes[areaCode] || null;
  }
  
  return info;
}

// ═══════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Save a new contact with context
 */
export async function saveContact(data) {
  const {
    phone,
    name,
    contextRaw,      // Voice note transcription or typed note
    tags = [],
    category = null, // work, social, dating, service, random
    savedLocation = null,
    calendarEvent = null,
    photoUrl = null,
    userId,          // Who saved this contact
  } = data;
  
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');
  
  const phoneInfo = parsePhoneInfo(phone);
  
  const record = {
    phone: normalized,
    name,
    context_raw: contextRaw,
    tags,
    category,
    saved_at: new Date().toISOString(),
    saved_location: savedLocation,
    calendar_correlation: calendarEvent,
    photo_url: photoUrl,
    phone_info: phoneInfo,
    user_id: userId,
    enrichment: {},
    first_message: null,
    last_contacted: null,
    interaction_count: 0,
  };
  
  const { data: saved, error } = await supabase
    .from('contact_memory')
    .upsert(record, {
      onConflict: 'phone,user_id',
    })
    .select()
    .single();
  
  if (error) {
    console.error('Contact save error:', error);
    throw error;
  }
  
  return saved;
}

/**
 * Look up a contact by phone number
 */
export async function lookupByPhone(phone, userId) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  
  const { data, error } = await supabase
    .from('contact_memory')
    .select('*')
    .eq('phone', normalized)
    .eq('user_id', userId)
    .single();
  
  return data;
}

/**
 * Search contacts by name or context
 */
export async function searchContacts(query, userId, limit = 10) {
  const { data, error } = await supabase
    .from('contact_memory')
    .select('*')
    .eq('user_id', userId)
    .or(`name.ilike.%${query}%,context_raw.ilike.%${query}%,tags.cs.{${query}}`)
    .order('saved_at', { ascending: false })
    .limit(limit);
  
  return data || [];
}

/**
 * Get contacts with no context ("mystery contacts")
 */
export async function getMysteryContacts(userId, limit = 50) {
  const { data, error } = await supabase
    .from('contact_memory')
    .select('*')
    .eq('user_id', userId)
    .or('context_raw.is.null,context_raw.eq.')
    .order('saved_at', { ascending: false })
    .limit(limit);
  
  return data || [];
}

/**
 * Get all contacts for a user
 */
export async function getAllContacts(userId) {
  const { data, error } = await supabase
    .from('contact_memory')
    .select('*')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
  
  return data || [];
}

/**
 * Update contact enrichment data
 */
export async function updateEnrichment(phone, userId, enrichment) {
  const normalized = normalizePhone(phone);
  
  const { data, error } = await supabase
    .from('contact_memory')
    .update({ 
      enrichment,
      updated_at: new Date().toISOString(),
    })
    .eq('phone', normalized)
    .eq('user_id', userId)
    .select()
    .single();
  
  return data;
}

/**
 * Record first message from a contact
 */
export async function recordFirstMessage(phone, userId, message) {
  const normalized = normalizePhone(phone);
  
  const { data, error } = await supabase
    .from('contact_memory')
    .update({
      first_message: message,
      last_contacted: new Date().toISOString(),
      interaction_count: supabase.raw('interaction_count + 1'),
    })
    .eq('phone', normalized)
    .eq('user_id', userId)
    .is('first_message', null)  // Only set if not already set
    .select()
    .single();
  
  return data;
}

// ═══════════════════════════════════════════════════════════
// INFERENCE ENGINE
// ═══════════════════════════════════════════════════════════

/**
 * Correlate a contact save time with calendar events
 */
export async function correlateWithCalendar(savedAt, calendarEvents) {
  // calendarEvents should be an array of { start, end, title, location }
  const saveTime = new Date(savedAt).getTime();
  
  const matches = calendarEvents.filter(event => {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    
    // Contact saved during event or within 2 hours after
    const buffer = 2 * 60 * 60 * 1000; // 2 hours
    return saveTime >= eventStart && saveTime <= eventEnd + buffer;
  });
  
  if (matches.length === 0) return null;
  
  // Return best match (prefer overlapping over buffer)
  return matches.map(event => ({
    event: event.title,
    location: event.location,
    confidence: saveTime <= new Date(event.end).getTime() ? 0.9 : 0.7,
  }));
}

/**
 * Find contacts saved around the same time (same event inference)
 */
export async function findRelatedContacts(phone, userId, windowMinutes = 30) {
  const normalized = normalizePhone(phone);
  
  // Get the contact's save time
  const contact = await lookupByPhone(phone, userId);
  if (!contact) return [];
  
  const savedAt = new Date(contact.saved_at);
  const windowMs = windowMinutes * 60 * 1000;
  
  const before = new Date(savedAt.getTime() - windowMs).toISOString();
  const after = new Date(savedAt.getTime() + windowMs).toISOString();
  
  const { data, error } = await supabase
    .from('contact_memory')
    .select('*')
    .eq('user_id', userId)
    .neq('phone', normalized)
    .gte('saved_at', before)
    .lte('saved_at', after)
    .order('saved_at');
  
  return data || [];
}

/**
 * Generate a full context card for a contact
 */
export async function generateContextCard(phone, userId, options = {}) {
  const normalized = normalizePhone(phone);
  const contact = await lookupByPhone(phone, userId);
  
  if (!contact) {
    // Even with no saved context, we can provide some info
    const phoneInfo = parsePhoneInfo(phone);
    return {
      found: false,
      phone: normalized,
      phoneInfo,
      suggestions: phoneInfo?.likelyCity 
        ? [`Phone area code suggests: ${phoneInfo.likelyCity}`]
        : ['No context available for this number'],
    };
  }
  
  // Build the context card
  const card = {
    found: true,
    phone: contact.phone,
    name: contact.name,
    savedAt: contact.saved_at,
    context: contact.context_raw,
    tags: contact.tags,
    category: contact.category,
    location: contact.saved_location,
    calendarMatch: contact.calendar_correlation,
    photo: contact.photo_url,
    phoneInfo: contact.phone_info,
    enrichment: contact.enrichment,
    firstMessage: contact.first_message,
    lastContacted: contact.last_contacted,
    interactionCount: contact.interaction_count,
  };
  
  // Find related contacts (same time = same event)
  if (options.includeRelated !== false) {
    const related = await findRelatedContacts(phone, userId);
    if (related.length > 0) {
      card.relatedContacts = related.map(c => ({
        name: c.name,
        savedMinutesApart: Math.abs(
          (new Date(c.saved_at) - new Date(contact.saved_at)) / 60000
        ).toFixed(0),
      }));
    }
  }
  
  return card;
}

// ═══════════════════════════════════════════════════════════
// LLM-POWERED INFERENCE
// ═══════════════════════════════════════════════════════════

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
      return oauthProfile.access;
    }
    throw new Error('No valid token found');
  } catch (err) {
    console.error('Failed to load Anthropic token:', err.message);
    return null;
  }
}

/**
 * Use LLM to infer context from sparse signals
 */
export async function inferContext(contact, additionalSignals = {}) {
  const token = getAnthropicToken();
  if (!token) throw new Error('No Anthropic token available');
  
  const client = new Anthropic({ apiKey: token });
  
  const prompt = `You are a contact memory assistant. Based on the following signals about a contact, 
infer as much context as possible about who this person might be and where they were likely met.

CONTACT DATA:
${JSON.stringify(contact, null, 2)}

ADDITIONAL SIGNALS:
${JSON.stringify(additionalSignals, null, 2)}

Based on these signals, provide your best inference in JSON format:
{
  "likely_context": "Your best guess about how/where they met",
  "confidence": 0.0-1.0,
  "reasoning": "Why you think this",
  "suggested_questions": ["Questions to ask to confirm"],
  "possible_categories": ["work", "social", etc - which seem likely]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { raw: text };
    }
  }
  
  return { raw: text };
}

/**
 * Transcribe voice note (placeholder - needs actual implementation)
 */
export async function transcribeVoiceNote(audioBuffer) {
  // TODO: Integrate with Whisper or similar
  // For now, return a placeholder
  return {
    text: null,
    error: 'Voice transcription not yet implemented',
  };
}

// ═══════════════════════════════════════════════════════════
// BULK OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Import contacts from phone export (vCard, CSV, etc.)
 */
export async function importContacts(contacts, userId) {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [],
  };
  
  for (const contact of contacts) {
    try {
      const normalized = normalizePhone(contact.phone);
      if (!normalized) {
        results.skipped++;
        continue;
      }
      
      await saveContact({
        phone: contact.phone,
        name: contact.name || 'Unknown',
        contextRaw: contact.notes || null,
        tags: contact.tags || [],
        category: contact.category || null,
        userId,
      });
      
      results.imported++;
    } catch (err) {
      results.errors.push({ phone: contact.phone, error: err.message });
    }
  }
  
  return results;
}

/**
 * Get contact memory stats for a user
 */
export async function getStats(userId) {
  const { data: all } = await supabase
    .from('contact_memory')
    .select('id, context_raw, category')
    .eq('user_id', userId);
  
  const total = all?.length || 0;
  const withContext = all?.filter(c => c.context_raw)?.length || 0;
  const mystery = total - withContext;
  
  const byCategory = {};
  (all || []).forEach(c => {
    const cat = c.category || 'uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });
  
  return {
    total,
    withContext,
    mystery,
    completeness: total > 0 ? ((withContext / total) * 100).toFixed(1) + '%' : '0%',
    byCategory,
  };
}

export default {
  normalizePhone,
  parsePhoneInfo,
  saveContact,
  lookupByPhone,
  searchContacts,
  getMysteryContacts,
  getAllContacts,
  updateEnrichment,
  recordFirstMessage,
  correlateWithCalendar,
  findRelatedContacts,
  generateContextCard,
  inferContext,
  transcribeVoiceNote,
  importContacts,
  getStats,
};
