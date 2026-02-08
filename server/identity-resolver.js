/**
 * IDENTITY RESOLVER
 * 
 * Bridge the gap between "name in chat" and "verified person"
 * 
 * Strategies:
 * 1. Phone number → lookup services
 * 2. WhatsApp profile info (if available)
 * 3. User-provided handles (from Profile Builder)
 * 4. Network graph (mutual connections)
 * 5. Confidence scoring
 */

import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// PHONE → IDENTITY LOOKUP
// Use the phone number to find verified social profiles
// ═══════════════════════════════════════════════════════════

// WhatsApp phone numbers often appear in chat exports
// Format: +1 (415) 555-1234 or +14155551234

export function extractPhoneFromChat(messages, personName) {
  // Look for phone numbers mentioned near this person's name
  const phones = [];
  
  for (const msg of messages) {
    // Check if message is from/about this person
    const isFromPerson = msg.sender?.toLowerCase().includes(personName.toLowerCase());
    const mentionsPerson = msg.text?.toLowerCase().includes(personName.toLowerCase());
    
    if (isFromPerson || mentionsPerson) {
      // Extract phone patterns
      const phonePatterns = [
        /\+\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,  // +1 (415) 555-1234
        /\+\d{10,14}/g,  // +14155551234
      ];
      
      for (const pattern of phonePatterns) {
        const matches = msg.text?.match(pattern) || [];
        phones.push(...matches);
      }
    }
  }
  
  return [...new Set(phones)];
}

// ═══════════════════════════════════════════════════════════
// EXTRACT SOCIAL HANDLES FROM CHAT
// People often share their own handles
// ═══════════════════════════════════════════════════════════

export function extractHandlesFromChat(messages, personName) {
  const handles = {
    twitter: [],
    instagram: [],
    linkedin: [],
    telegram: [],
  };
  
  for (const msg of messages) {
    const isFromPerson = msg.sender?.toLowerCase().includes(personName.toLowerCase());
    if (!isFromPerson) continue;
    
    const text = msg.text || '';
    
    // Twitter/X
    const twitterMatches = text.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi);
    if (twitterMatches) {
      handles.twitter.push(...twitterMatches.map(m => m.split('/').pop()));
    }
    const atMentions = text.match(/@([a-zA-Z0-9_]{1,15})\b/g);
    if (atMentions && text.toLowerCase().includes('twitter') || text.toLowerCase().includes('follow')) {
      handles.twitter.push(...atMentions.map(m => m.replace('@', '')));
    }
    
    // Instagram
    const igMatches = text.match(/instagram\.com\/([a-zA-Z0-9_.]+)/gi);
    if (igMatches) {
      handles.instagram.push(...igMatches.map(m => m.split('/').pop()));
    }
    
    // LinkedIn
    const liMatches = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/gi);
    if (liMatches) {
      handles.linkedin.push(...liMatches.map(m => m.split('/').pop()));
    }
  }
  
  // Dedupe
  for (const key of Object.keys(handles)) {
    handles[key] = [...new Set(handles[key])];
  }
  
  return handles;
}

// ═══════════════════════════════════════════════════════════
// IDENTITY CONFIDENCE SCORING
// How sure are we this is the right person?
// ═══════════════════════════════════════════════════════════

export function calculateIdentityConfidence(profile) {
  let confidence = 0;
  const factors = [];
  
  // Phone number verified
  if (profile.phone_verified) {
    confidence += 40;
    factors.push('Phone verified');
  }
  
  // Has actual social handles (not guessed)
  if (profile.linkedin_handle && profile.linkedin_source === 'direct') {
    confidence += 25;
    factors.push('LinkedIn from source');
  }
  if (profile.twitter_handle && profile.twitter_source === 'direct') {
    confidence += 20;
    factors.push('Twitter from source');
  }
  if (profile.instagram_handle && profile.instagram_source === 'direct') {
    confidence += 15;
    factors.push('Instagram from source');
  }
  
  // Mutual connections confirmed
  if (profile.mutual_connections?.length > 0) {
    confidence += Math.min(profile.mutual_connections.length * 10, 30);
    factors.push(`${profile.mutual_connections.length} mutual connections`);
  }
  
  // User manually verified
  if (profile.user_verified) {
    confidence += 50;
    factors.push('User verified');
  }
  
  // Name matched in multiple sources
  if (profile.name_match_count > 2) {
    confidence += 10;
    factors.push('Name in multiple sources');
  }
  
  return {
    score: Math.min(confidence, 100),
    factors,
    tier: confidence >= 80 ? 'verified' : confidence >= 50 ? 'likely' : confidence >= 25 ? 'possible' : 'unverified',
  };
}

// ═══════════════════════════════════════════════════════════
// BUILD VERIFIED PROFILE
// Combine all signals into a verified identity
// ═══════════════════════════════════════════════════════════

export function buildVerifiedProfile(chatProfile, additionalData = {}) {
  const profile = {
    // From chat
    display_name: chatProfile.display_name || chatProfile.name,
    chat_name: chatProfile.display_name,
    
    // Identity signals
    phone: additionalData.phone || null,
    phone_verified: false,
    
    // Social handles
    linkedin_handle: null,
    linkedin_source: null, // 'direct' | 'search' | 'user'
    twitter_handle: null,
    twitter_source: null,
    instagram_handle: null,
    instagram_source: null,
    
    // Verification
    user_verified: additionalData.user_verified || false,
    mutual_connections: additionalData.mutual_connections || [],
    
    // Research results (only if verified)
    research: null,
    research_confidence: 0,
    
    // Metadata
    sources: ['chat'],
    created_at: new Date().toISOString(),
  };
  
  // Add any direct handles from additional data
  if (additionalData.linkedin) {
    profile.linkedin_handle = additionalData.linkedin;
    profile.linkedin_source = 'user';
  }
  if (additionalData.twitter) {
    profile.twitter_handle = additionalData.twitter;
    profile.twitter_source = 'user';
  }
  if (additionalData.instagram) {
    profile.instagram_handle = additionalData.instagram;
    profile.instagram_source = 'user';
  }
  
  // Calculate confidence
  const confidence = calculateIdentityConfidence(profile);
  profile.identity_confidence = confidence;
  
  return profile;
}

// ═══════════════════════════════════════════════════════════
// ENRICH FROM CHAT CONTEXT
// Extract everything we can from the chat itself
// ═══════════════════════════════════════════════════════════

export function enrichFromChatContext(personName, messages, members) {
  const context = {
    name: personName,
    phones_found: extractPhoneFromChat(messages, personName),
    handles_found: extractHandlesFromChat(messages, personName),
    
    // Activity analysis
    message_count: 0,
    first_seen: null,
    last_seen: null,
    
    // Relationships
    mentions_others: [],
    mentioned_by: [],
    replies_to: [],
    
    // Content signals
    links_shared: [],
    topics: [],
  };
  
  // Analyze messages
  for (const msg of messages) {
    const isFromPerson = msg.sender?.toLowerCase().includes(personName.toLowerCase());
    
    if (isFromPerson) {
      context.message_count++;
      
      if (!context.first_seen || msg.timestamp < context.first_seen) {
        context.first_seen = msg.timestamp;
      }
      if (!context.last_seen || msg.timestamp > context.last_seen) {
        context.last_seen = msg.timestamp;
      }
      
      // Extract links
      const links = msg.text?.match(/https?:\/\/[^\s]+/g) || [];
      context.links_shared.push(...links);
      
      // Check who they mention
      for (const member of members || []) {
        if (msg.text?.toLowerCase().includes(member.name?.toLowerCase())) {
          context.mentions_others.push(member.name);
        }
      }
    } else {
      // Check if others mention this person
      if (msg.text?.toLowerCase().includes(personName.toLowerCase())) {
        context.mentioned_by.push(msg.sender);
      }
    }
  }
  
  // Dedupe
  context.links_shared = [...new Set(context.links_shared)];
  context.mentions_others = [...new Set(context.mentions_others)];
  context.mentioned_by = [...new Set(context.mentioned_by)];
  
  return context;
}

// ═══════════════════════════════════════════════════════════
// PROMPT USER FOR VERIFICATION
// Generate questions to ask user to verify identity
// ═══════════════════════════════════════════════════════════

export function generateVerificationQuestions(profile, searchResults = []) {
  const questions = [];
  
  // If we found potential LinkedIn profiles
  if (searchResults.length > 0) {
    questions.push({
      type: 'select_profile',
      question: `We found ${searchResults.length} possible LinkedIn profiles for "${profile.display_name}". Which one is correct?`,
      options: searchResults.map(r => ({
        url: r.url,
        title: r.title,
        description: r.description,
      })),
      allow_none: true,
    });
  }
  
  // Ask for handles if we don't have them
  if (!profile.linkedin_handle) {
    questions.push({
      type: 'input',
      field: 'linkedin',
      question: `Do you know ${profile.display_name}'s LinkedIn URL?`,
      optional: true,
    });
  }
  
  if (!profile.twitter_handle) {
    questions.push({
      type: 'input',
      field: 'twitter',
      question: `Do you know ${profile.display_name}'s Twitter/X handle?`,
      optional: true,
    });
  }
  
  // If we found phones in chat
  if (profile.phones_found?.length > 0) {
    questions.push({
      type: 'confirm',
      field: 'phone',
      question: `Is this ${profile.display_name}'s phone number?`,
      value: profile.phones_found[0],
    });
  }
  
  return questions;
}

export default {
  extractPhoneFromChat,
  extractHandlesFromChat,
  calculateIdentityConfidence,
  buildVerifiedProfile,
  enrichFromChatContext,
  generateVerificationQuestions,
};
