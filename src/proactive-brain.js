/**
 * Proactive Brain — The Serendipity Engine
 * 
 * This is the layer that makes Connex magical:
 * Instead of "upload chat, fill form, see results"
 * It's "I noticed something you should know"
 * 
 * Key insight: Real serendipity = Cross-referencing YOUR persistent context
 * against NEW information (chats, contacts, events)
 */

// ═══════════════════════════════════════════════════════════
// USER CONTEXT (Persistent Profile)
// ═══════════════════════════════════════════════════════════

/**
 * UserContext represents everything we know about the user.
 * This persists across sessions and grows over time.
 */
export const createUserContext = (initialData = {}) => ({
  // Identity
  name: initialData.name || "",
  phone: initialData.phone || "",
  
  // Location (current + history)
  location: {
    current: initialData.currentCity || null,  // "Bangkok"
    home: initialData.homeCity || null,        // "San Francisco"
    history: initialData.locationHistory || [], // [{city, from, to}]
  },
  
  // Professional
  role: initialData.role || "",
  company: initialData.company || "",
  industry: initialData.industry || "",
  expertise: initialData.expertise || [],
  
  // What they're looking for (active needs)
  lookingFor: initialData.lookingFor || [],
  // Examples: ["technical cofounder", "AI engineers", "seed funding", "yoga buddies"]
  
  // What they can offer
  offering: initialData.offering || [],
  // Examples: ["AI intros", "product feedback", "investor intros", "Bangkok restaurant recs"]
  
  // Interests & Affinities
  interests: initialData.interests || [],
  affinities: {
    sports: initialData.sports || [],      // ["UFC", "Warriors", "49ers"]
    food: initialData.food || [],          // ["boat noodles", "dim sum"]
    wellness: initialData.wellness || [],  // ["sauna", "ice bath"]
    hobbies: initialData.hobbies || [],    // ["poker", "padel"]
  },
  
  // Network knowledge (people user knows + context)
  network: initialData.network || [],
  // [{name, relationship, expertise, canIntro: true/false, notes}]
  
  // Conversation memory (things user has mentioned)
  mentions: initialData.mentions || [],
  // [{topic, context, date, source}]
  // Example: {topic: "hiring AI engineers", context: "mentioned looking for ML talent", date: "2026-02-01"}
  
  // Groups/communities user is part of
  groups: initialData.groups || [],
  // [{name, platform, role, memberCount}]
});

// ═══════════════════════════════════════════════════════════
// OPPORTUNITY DETECTION
// ═══════════════════════════════════════════════════════════

/**
 * OpportunityType — What kind of serendipity did we find?
 */
export const OpportunityType = {
  INTRO_MATCH: "intro_match",           // Someone needs what user offers (or vice versa)
  HIRING_MATCH: "hiring_match",         // Someone hiring for role user knows people for
  LOCATION_OVERLAP: "location_overlap", // Someone visiting user's city
  INTEREST_MATCH: "interest_match",     // Deep shared interest worth connecting over
  EXPERTISE_NEED: "expertise_need",     // Someone needs expertise user has
  NETWORK_BRIDGE: "network_bridge",     // User can connect two people who should meet
  EVENT_OPPORTUNITY: "event_opportunity", // Group event that matches user's interests
};

/**
 * ConnectionType — How could two people be connected?
 */
export const ConnectionType = {
  NEED_OFFER: "need_offer",             // A needs what B offers
  SHARED_INTEREST: "shared_interest",   // Both passionate about same thing
  SAME_LOCATION: "same_location",       // Both in same city
  SAME_INDUSTRY: "same_industry",       // Work in same space
  COMPLEMENTARY_ROLES: "complementary", // Founder + investor, designer + engineer
  SHARED_BACKGROUND: "shared_background", // Same school, company, origin
  AFFINITY_BOND: "affinity_bond",       // Same sports team, hobby, lifestyle
  TIMING_SYNC: "timing_sync",           // Both traveling to same place soon
};

/**
 * Scan a parsed chat/contact list for opportunities
 * Returns array of Opportunity objects
 */
export function detectOpportunities(userContext, parsedProfiles, options = {}) {
  const opportunities = [];
  const { minConfidence = 0.5, maxResults = 10 } = options;
  
  for (const profile of parsedProfiles) {
    // Skip if it's the user themselves
    if (profile.name?.toLowerCase() === userContext.name?.toLowerCase()) continue;
    
    const detected = [];
    
    // 1. HIRING MATCH — They're hiring, user knows people
    if (profile.lookingFor?.length > 0) {
      for (const need of profile.lookingFor) {
        const needLower = need.toLowerCase();
        
        // Check if user offers this
        const userOffers = (userContext.offering || []).some(o => 
          o.toLowerCase().includes(needLower) || needLower.includes(o.toLowerCase())
        );
        
        // Check if user has expertise in this (handle array or object)
        const expertiseList = Array.isArray(userContext.expertise) 
          ? userContext.expertise 
          : [];
        const userExpert = expertiseList.some(e =>
          e.toLowerCase().includes(needLower) || needLower.includes(e.toLowerCase())
        );
        
        // Check if user mentioned knowing people in this space
        const userNetwork = (userContext.network || []).some(n =>
          n.expertise?.some(e => e.toLowerCase().includes(needLower))
        );
        
        // Check if user mentioned this topic recently
        const userMentioned = (userContext.mentions || []).some(m =>
          m.topic?.toLowerCase().includes(needLower)
        );
        
        if (userOffers || userExpert || userNetwork || userMentioned) {
          detected.push({
            type: OpportunityType.HIRING_MATCH,
            confidence: userOffers ? 0.9 : userExpert ? 0.8 : userNetwork ? 0.7 : 0.6,
            reason: `${profile.name} is looking for "${need}"`,
            hook: userOffers 
              ? `You offer ${need} — direct match!`
              : userExpert
              ? `You have expertise in ${need}`
              : userNetwork
              ? `You know people in ${need}`
              : `You mentioned ${need} recently`,
            actionable: true,
          });
        }
      }
    }
    
    // 2. INTRO MATCH — User looking for what they offer
    if (profile.offering?.length > 0) {
      for (const offer of profile.offering) {
        const offerLower = offer.toLowerCase();
        
        const userNeeds = userContext.lookingFor.some(l =>
          l.toLowerCase().includes(offerLower) || offerLower.includes(l.toLowerCase())
        );
        
        if (userNeeds) {
          detected.push({
            type: OpportunityType.INTRO_MATCH,
            confidence: 0.85,
            reason: `${profile.name} offers "${offer}"`,
            hook: `You're looking for this!`,
            actionable: true,
          });
        }
      }
    }
    
    // 3. LOCATION OVERLAP — They're in user's city
    const profileCity = profile.location?.current || profile.location?.primary;
    const userCity = userContext.location.current;
    
    if (profileCity && userCity) {
      const profileCityLower = profileCity.toLowerCase();
      const userCityLower = userCity.toLowerCase();
      
      if (profileCityLower.includes(userCityLower) || userCityLower.includes(profileCityLower)) {
        detected.push({
          type: OpportunityType.LOCATION_OVERLAP,
          confidence: 0.7,
          reason: `${profile.name} is also in ${userCity}`,
          hook: `Easy to meet IRL`,
          actionable: true,
        });
      }
    }
    
    // 4. INTEREST MATCH — Deep shared interests
    const sharedInterests = [];
    
    // Helper to extract interest topics from various formats
    const extractInterests = (interests) => {
      if (!interests) return [];
      if (Array.isArray(interests)) {
        return interests.map(i => typeof i === 'string' ? i : i.topic || i.category).filter(Boolean);
      }
      // Handle nested format {obsessions: [], strong: [], casual: []}
      const result = [];
      if (interests.obsessions) result.push(...interests.obsessions.map(o => o.topic));
      if (interests.strong) result.push(...interests.strong);
      if (interests.casual) result.push(...interests.casual);
      return result.filter(Boolean);
    };
    
    const profileInterests = extractInterests(profile.interests).map(i => i.toLowerCase());
    const userInterests = extractInterests(userContext.interests).map(i => i.toLowerCase());
    
    // Find shared interests
    for (const pi of profileInterests) {
      if (userInterests.some(ui => pi.includes(ui) || ui.includes(pi))) {
        sharedInterests.push(pi);
      }
    }
    
    // Check affinities (especially wellness)
    for (const [category, items] of Object.entries(profile.affinities || {})) {
      const userItems = userContext.affinities?.[category] || [];
      for (const item of (items || [])) {
        if (userItems.some(ui => ui.toLowerCase() === item.toLowerCase())) {
          sharedInterests.push(item);
        }
      }
    }
    
    // Dedupe
    const uniqueSharedInterests = [...new Set(sharedInterests)];
    
    if (uniqueSharedInterests.length >= 2) {
      detected.push({
        type: OpportunityType.INTEREST_MATCH,
        confidence: Math.min(0.5 + uniqueSharedInterests.length * 0.15, 0.9),
        reason: `${profile.name} shares interests: ${uniqueSharedInterests.join(", ")}`,
        hook: `Multiple shared interests = instant rapport`,
        actionable: true,
        sharedInterests: uniqueSharedInterests,
      });
    }
    
    // 5. EXPERTISE NEED — They need expertise user has
    // (Similar to hiring but more advisory/casual)
    
    // Aggregate opportunities for this profile
    if (detected.length > 0) {
      // Take highest confidence opportunity as primary
      detected.sort((a, b) => b.confidence - a.confidence);
      
      const primaryOpp = detected[0];
      const secondaryOpps = detected.slice(1);
      
      opportunities.push({
        profile,
        primary: primaryOpp,
        secondary: secondaryOpps,
        overallScore: calculateOpportunityScore(primaryOpp, secondaryOpps, profile, userContext),
        suggestedAction: generateSuggestedAction(userContext, profile, primaryOpp),
        introMessage: generateIntroMessage(userContext, profile, primaryOpp),
      });
    }
  }
  
  // Sort by overall score and limit
  return opportunities
    .filter(o => o.primary.confidence >= minConfidence)
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, maxResults);
}

// ═══════════════════════════════════════════════════════════
// SCORING & RANKING
// ═══════════════════════════════════════════════════════════

function calculateOpportunityScore(primary, secondary, profile = null, userContext = null) {
  let score = primary.confidence * 100;
  
  // Bonus for multiple opportunities with same person
  score += secondary.length * 10;
  
  // Bonus for actionable opportunities
  if (primary.actionable) score += 5;
  
  // LOCATION BOOST — same city gets significant bonus
  if (profile && userContext) {
    const profileCity = (profile.location?.current || '').toLowerCase();
    const userCity = (userContext.location?.current || '').toLowerCase();
    const priorityCity = (userContext.location?.priority || userCity).toLowerCase();
    
    if (profileCity && priorityCity && profileCity.includes(priorityCity)) {
      score += 20; // Big bonus for priority city (Bangkok)
    } else if (profileCity && userCity && profileCity.includes(userCity)) {
      score += 15; // Bonus for current city
    }
    
    // Local flag bonus
    if (profile.location?.isLocal || profile.scenes?.isLocal) {
      score += 10;
    }
  }
  
  // SERENDIPITY BONUS — shared transformations, struggles, scenes
  if (profile?.experiences?.transformations && userContext?.experiences?.transformations) {
    const profileTransforms = profile.experiences.transformations.map(t => `${t.from}->${t.to}`);
    const userTransforms = userContext.experiences.transformations.map(t => `${t.from}->${t.to}`);
    const sharedTransforms = profileTransforms.filter(t => userTransforms.includes(t));
    score += sharedTransforms.length * 15;
  }
  
  // WELLNESS/PRACTICE OVERLAP — strong bonding signal
  if (profile?.values?.practices && userContext?.values?.practices) {
    const profilePractices = profile.values.practices.map(p => p.specifics?.toLowerCase());
    const userPractices = userContext.values.practices.map(p => p.specifics?.toLowerCase());
    const sharedPractices = profilePractices.filter(p => p && userPractices.includes(p));
    score += sharedPractices.length * 10;
  }
  
  // SCENE OVERLAP — same community
  if (profile?.scenes?.active && userContext?.scenes?.active) {
    const profileScenes = (profile.scenes.active || []).map(s => 
      typeof s === 'string' ? s.toLowerCase() : s.name?.toLowerCase()
    );
    const userScenes = (userContext.scenes.active || []).map(s => 
      typeof s === 'string' ? s.toLowerCase() : s.name?.toLowerCase()
    );
    const sharedScenes = profileScenes.filter(s => 
      s && userScenes.some(us => us && (s.includes(us) || us.includes(s)))
    );
    score += sharedScenes.length * 12;
  }
  
  // VERIFICATION PENALTY — low confidence profiles get penalized
  if (profile?.verification) {
    const confidence = profile.verification.confidenceScore || 0;
    if (confidence < 30) {
      score *= 0.7; // 30% penalty for unverified
    } else if (confidence < 50) {
      score *= 0.85; // 15% penalty for low confidence
    } else if (confidence >= 80) {
      score *= 1.1; // 10% bonus for well-verified
    }
  }
  
  // Cap at 100
  return Math.min(Math.round(score), 100);
}

// ═══════════════════════════════════════════════════════════
// ACTION GENERATION
// ═══════════════════════════════════════════════════════════

function generateSuggestedAction(userContext, profile, opportunity) {
  const name = profile.name?.split(" ")[0] || profile.name;
  
  switch (opportunity.type) {
    case OpportunityType.HIRING_MATCH:
      return `Reach out to ${name} — you can help with their "${opportunity.reason.split('"')[1]}" need`;
    
    case OpportunityType.INTRO_MATCH:
      return `Connect with ${name} — they offer what you're looking for`;
    
    case OpportunityType.LOCATION_OVERLAP:
      return `Grab coffee with ${name} — you're both in ${userContext.location.current}`;
    
    case OpportunityType.INTEREST_MATCH:
      return `Bond with ${name} over ${opportunity.sharedInterests?.slice(0, 2).join(" & ")}`;
    
    default:
      return `Connect with ${name}`;
  }
}

function generateIntroMessage(userContext, profile, opportunity) {
  const userName = userContext.name?.split(" ")[0] || "Hey";
  const profileName = profile.name?.split(" ")[0] || profile.name;
  
  switch (opportunity.type) {
    case OpportunityType.HIRING_MATCH:
      const need = opportunity.reason.split('"')[1];
      return `Hey ${profileName}! 👋 ${userName} here from the group. Saw you're looking for ${need} — I might be able to help / know some folks. Want to chat?`;
    
    case OpportunityType.INTRO_MATCH:
      const offer = opportunity.reason.split('"')[1];
      return `Hey ${profileName}! 👋 ${userName} here. Noticed you have experience with ${offer} — that's exactly what I'm exploring. Would love to pick your brain if you're open to it!`;
    
    case OpportunityType.LOCATION_OVERLAP:
      return `Hey ${profileName}! 👋 ${userName} here. Looks like we're both in ${userContext.location.current} — want to grab a coffee sometime?`;
    
    case OpportunityType.INTEREST_MATCH:
      const interests = opportunity.sharedInterests?.slice(0, 2).join(" and ") || "stuff";
      return `Hey ${profileName}! 👋 ${userName} here. Noticed we're both into ${interests} — would be fun to connect!`;
    
    default:
      return `Hey ${profileName}! 👋 ${userName} here. Would love to connect!`;
  }
}

// ═══════════════════════════════════════════════════════════
// PROACTIVE NOTIFICATION GENERATOR
// ═══════════════════════════════════════════════════════════

/**
 * Generate a natural language notification about an opportunity
 * This is what Milo would actually say to Nathan
 */
export function generateNotification(opportunity, options = {}) {
  const { style = "casual", includeAction = true } = options;
  const profile = opportunity.profile;
  const primary = opportunity.primary;
  const name = profile.name;
  
  let notification = "";
  
  switch (primary.type) {
    case OpportunityType.HIRING_MATCH:
      const need = primary.reason.split('"')[1];
      notification = `🎯 **${name}** is looking for "${need}" — ${primary.hook}`;
      break;
    
    case OpportunityType.INTRO_MATCH:
      const offer = primary.reason.split('"')[1];
      notification = `✨ **${name}** offers "${offer}" — you're looking for this!`;
      break;
    
    case OpportunityType.LOCATION_OVERLAP:
      notification = `📍 **${name}** is in your city — easy coffee opportunity`;
      break;
    
    case OpportunityType.INTEREST_MATCH:
      const interests = primary.sharedInterests?.join(", ") || "shared interests";
      notification = `⚡ **${name}** shares your vibe: ${interests}`;
      break;
    
    default:
      notification = `👋 **${name}** might be worth connecting with`;
  }
  
  // Add secondary opportunities
  if (opportunity.secondary?.length > 0) {
    const extras = opportunity.secondary.slice(0, 2).map(s => {
      switch (s.type) {
        case OpportunityType.LOCATION_OVERLAP: return "same city";
        case OpportunityType.INTEREST_MATCH: return "shared interests";
        case OpportunityType.HIRING_MATCH: return "can help them";
        default: return null;
      }
    }).filter(Boolean);
    
    if (extras.length > 0) {
      notification += ` (+ ${extras.join(", ")})`;
    }
  }
  
  // Add suggested action
  if (includeAction) {
    notification += `\n→ ${opportunity.suggestedAction}`;
  }
  
  return notification;
}

/**
 * Generate a batch notification for multiple opportunities
 * "I scanned the FF Bros group. Here's who you should meet:"
 */
export function generateBatchNotification(opportunities, groupName = "the group") {
  if (opportunities.length === 0) {
    return `Scanned ${groupName} — no strong matches found based on your profile.`;
  }
  
  let notification = `🔍 Scanned ${groupName}. Found ${opportunities.length} connection${opportunities.length > 1 ? 's' : ''} for you:\n\n`;
  
  opportunities.slice(0, 5).forEach((opp, i) => {
    const emoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•";
    notification += `${emoji} ${generateNotification(opp, { includeAction: false })}\n`;
  });
  
  if (opportunities.length > 5) {
    notification += `\n...and ${opportunities.length - 5} more.`;
  }
  
  notification += `\n\nWant intro messages for any of these?`;
  
  return notification;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT LEARNING
// ═══════════════════════════════════════════════════════════

/**
 * Update user context from a conversation
 * This is how Milo learns about Nathan over time
 */
export function learnFromConversation(userContext, message, source = "chat") {
  const updates = [];
  const textLower = message.toLowerCase();
  
  // Location mentions
  const locationPatterns = [
    /i(?:'m| am) in (\w+)/i,
    /based in (\w+)/i,
    /living in (\w+)/i,
    /visiting (\w+)/i,
    /traveling to (\w+)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match) {
      updates.push({
        field: "location.current",
        value: match[1],
        confidence: 0.8,
      });
    }
  }
  
  // Looking for mentions
  const lookingForPatterns = [
    /looking for (?:a |an )?(.+?)(?:\.|,|$)/i,
    /need (?:a |an )?(.+?)(?:\.|,|$)/i,
    /trying to find (?:a |an )?(.+?)(?:\.|,|$)/i,
    /hiring (?:a |an )?(.+?)(?:\.|,|$)/i,
  ];
  
  for (const pattern of lookingForPatterns) {
    const match = message.match(pattern);
    if (match) {
      updates.push({
        field: "lookingFor",
        value: match[1].trim(),
        confidence: 0.9,
      });
    }
  }
  
  // Interest mentions
  const interestPatterns = [
    /i(?:'m| am) (?:really )?into (.+?)(?:\.|,|$)/i,
    /i love (.+?)(?:\.|,|$)/i,
    /big fan of (.+?)(?:\.|,|$)/i,
    /interested in (.+?)(?:\.|,|$)/i,
  ];
  
  for (const pattern of interestPatterns) {
    const match = message.match(pattern);
    if (match) {
      updates.push({
        field: "interests",
        value: match[1].trim(),
        confidence: 0.7,
      });
    }
  }
  
  // Network mentions
  const networkPatterns = [
    /i know (?:a |some )?(.+?) (?:who|that|at)/i,
    /my friend (.+?) (?:works|is)/i,
    /connected to (.+?) at/i,
  ];
  
  for (const pattern of networkPatterns) {
    const match = message.match(pattern);
    if (match) {
      updates.push({
        field: "mentions",
        value: { topic: match[1].trim(), context: message.slice(0, 100), date: new Date().toISOString(), source },
        confidence: 0.6,
      });
    }
  }
  
  return updates;
}

// ═══════════════════════════════════════════════════════════
// CROSS-NETWORK CONNECTIONS (Who should meet who?)
// ═══════════════════════════════════════════════════════════

/**
 * Find potential connections between people in a network
 * This is the "you should intro A to B" engine
 */
export function findCrossConnections(profiles, options = {}) {
  const { minScore = 40, maxResults = 20 } = options;
  const connections = [];
  
  // Compare each pair
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      
      const connection = scoreConnection(a, b);
      if (connection.score >= minScore) {
        connections.push({
          personA: a,
          personB: b,
          ...connection,
        });
      }
    }
  }
  
  return connections
    .sort((x, y) => y.score - x.score)
    .slice(0, maxResults);
}

/**
 * Score the potential connection between two people
 */
function scoreConnection(a, b) {
  let score = 0;
  const reasons = [];
  const connectionTypes = [];
  
  // 1. NEED ↔ OFFER MATCH (highest value)
  const aNeeds = a.lookingFor || [];
  const bOffers = b.offering || [];
  const bNeeds = b.lookingFor || [];
  const aOffers = a.offering || [];
  
  for (const need of aNeeds) {
    const needLower = need.toLowerCase();
    const match = bOffers.find(o => 
      o.toLowerCase().includes(needLower) || needLower.includes(o.toLowerCase())
    );
    if (match) {
      score += 25;
      reasons.push(`${a.name} needs "${need}" → ${b.name} offers this`);
      connectionTypes.push(ConnectionType.NEED_OFFER);
    }
  }
  
  for (const need of bNeeds) {
    const needLower = need.toLowerCase();
    const match = aOffers.find(o => 
      o.toLowerCase().includes(needLower) || needLower.includes(o.toLowerCase())
    );
    if (match) {
      score += 25;
      reasons.push(`${b.name} needs "${need}" → ${a.name} offers this`);
      connectionTypes.push(ConnectionType.NEED_OFFER);
    }
  }
  
  // 2. SAME LOCATION
  const aCity = (a.location?.current || a.location?.primary || "").toLowerCase();
  const bCity = (b.location?.current || b.location?.primary || "").toLowerCase();
  
  if (aCity && bCity && (aCity.includes(bCity) || bCity.includes(aCity))) {
    score += 15;
    reasons.push(`Both in ${a.location?.current || a.location?.primary}`);
    connectionTypes.push(ConnectionType.SAME_LOCATION);
  }
  
  // 3. SHARED INTERESTS
  const aInterests = (a.interests || []).map(i => 
    (typeof i === 'string' ? i : i.category || '').toLowerCase()
  ).filter(Boolean);
  const bInterests = (b.interests || []).map(i => 
    (typeof i === 'string' ? i : i.category || '').toLowerCase()
  ).filter(Boolean);
  
  const sharedInterests = aInterests.filter(ai => 
    bInterests.some(bi => ai.includes(bi) || bi.includes(ai))
  );
  
  if (sharedInterests.length > 0) {
    score += sharedInterests.length * 10;
    reasons.push(`Shared interests: ${sharedInterests.join(", ")}`);
    connectionTypes.push(ConnectionType.SHARED_INTEREST);
  }
  
  // 4. SAME INDUSTRY
  const aIndustry = (a.industry || "").toLowerCase();
  const bIndustry = (b.industry || "").toLowerCase();
  
  if (aIndustry && bIndustry && (aIndustry.includes(bIndustry) || bIndustry.includes(aIndustry))) {
    score += 10;
    reasons.push(`Same industry: ${a.industry || b.industry}`);
    connectionTypes.push(ConnectionType.SAME_INDUSTRY);
  }
  
  // 5. COMPLEMENTARY ROLES
  const complementaryPairs = [
    ["founder", "investor"],
    ["startup", "investor"],
    ["ceo", "advisor"],
    ["engineer", "product"],
    ["designer", "engineer"],
    ["technical", "business"],
    ["builder", "investor"],
    ["operator", "investor"],
  ];
  
  const aRole = (a.role || "").toLowerCase();
  const bRole = (b.role || "").toLowerCase();
  
  for (const [role1, role2] of complementaryPairs) {
    if ((aRole.includes(role1) && bRole.includes(role2)) ||
        (aRole.includes(role2) && bRole.includes(role1))) {
      score += 15;
      reasons.push(`Complementary: ${a.role} ↔ ${b.role}`);
      connectionTypes.push(ConnectionType.COMPLEMENTARY_ROLES);
      break;
    }
  }
  
  // 6. AFFINITY BONDS (sports, hobbies, etc.)
  const aAffinities = Object.values(a.affinities || {}).flat().map(x => x.toLowerCase());
  const bAffinities = Object.values(b.affinities || {}).flat().map(x => x.toLowerCase());
  
  const sharedAffinities = aAffinities.filter(aa =>
    bAffinities.some(ba => aa.includes(ba) || ba.includes(aa))
  );
  
  if (sharedAffinities.length > 0) {
    score += sharedAffinities.length * 8;
    reasons.push(`Shared vibes: ${sharedAffinities.join(", ")}`);
    connectionTypes.push(ConnectionType.AFFINITY_BOND);
  }
  
  // 7. SHARED BACKGROUND (same school, company)
  const aCompanies = [a.company, ...(a.previousCompanies || [])].filter(Boolean).map(c => c.toLowerCase());
  const bCompanies = [b.company, ...(b.previousCompanies || [])].filter(Boolean).map(c => c.toLowerCase());
  
  const sharedCompanies = aCompanies.filter(ac => bCompanies.some(bc => ac === bc));
  if (sharedCompanies.length > 0) {
    score += 20;
    reasons.push(`Both worked at: ${sharedCompanies.join(", ")}`);
    connectionTypes.push(ConnectionType.SHARED_BACKGROUND);
  }
  
  // Cap score at 100
  score = Math.min(score, 100);
  
  return {
    score,
    reasons,
    connectionTypes: [...new Set(connectionTypes)],
    whyConnect: generateWhyConnect(a, b, reasons),
    introMessage: generateCrossIntroMessage(a, b, reasons),
  };
}

/**
 * Generate a "why they should connect" summary
 */
function generateWhyConnect(a, b, reasons) {
  if (reasons.length === 0) return null;
  
  const primary = reasons[0];
  const secondary = reasons.slice(1, 3);
  
  let summary = `**${a.name}** and **${b.name}** should connect: ${primary}`;
  if (secondary.length > 0) {
    summary += ` (+ ${secondary.join(", ")})`;
  }
  
  return summary;
}

/**
 * Generate an intro message for connecting two people
 */
function generateCrossIntroMessage(a, b, reasons) {
  const aFirst = a.name?.split(" ")[0] || a.name;
  const bFirst = b.name?.split(" ")[0] || b.name;
  
  // Pick the strongest connection reason
  const hook = reasons[0] || "think you'd have a lot to chat about";
  
  return `Hey ${aFirst}, meet ${bFirst}! ${hook}. 

${aFirst} — ${b.role || ""}${b.company ? ` @ ${b.company}` : ""}
${bFirst} — ${a.role || ""}${a.company ? ` @ ${a.company}` : ""}

I'll let you two take it from here! 🤝`;
}

/**
 * Generate a summary of cross-connections found
 */
export function generateCrossConnectionSummary(connections, groupName = "this group") {
  if (connections.length === 0) {
    return `No strong cross-connections found in ${groupName}.`;
  }
  
  let summary = `🔗 Found ${connections.length} potential intros in ${groupName}:\n\n`;
  
  connections.slice(0, 5).forEach((conn, i) => {
    const emoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•";
    summary += `${emoji} **${conn.personA.name}** ↔ **${conn.personB.name}** (${conn.score}%)\n`;
    summary += `   ${conn.reasons[0]}\n\n`;
  });
  
  if (connections.length > 5) {
    summary += `...and ${connections.length - 5} more potential connections.`;
  }
  
  return summary;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  createUserContext,
  OpportunityType,
  ConnectionType,
  detectOpportunities,
  findCrossConnections,
  generateNotification,
  generateBatchNotification,
  generateCrossConnectionSummary,
  learnFromConversation,
};
