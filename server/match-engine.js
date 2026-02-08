// ═══════════════════════════════════════════════════════════
// MATCH ENGINE
// Find connections between profiles
// ═══════════════════════════════════════════════════════════

// ─── SCORING WEIGHTS ───
const WEIGHTS = {
  sameCity: 30,
  sameRegion: 15,
  sameCountry: 5,
  sharedInterest: 10,      // per interest
  sharedSkill: 8,          // per skill
  complementaryNeed: 25,   // looking_for matches offering
  sameIndustry: 15,
  similarRole: 10,
  mutualConnection: 20,    // both know someone in common
};

// ─── LOCATION MATCHING ───
function scoreLocation(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  const locA = normalizeLocation(profileA);
  const locB = normalizeLocation(profileB);
  
  if (!locA.city && !locA.region) return { score: 0, reasons: [] };
  if (!locB.city && !locB.region) return { score: 0, reasons: [] };
  
  // Same city
  if (locA.city && locB.city && locA.city.toLowerCase() === locB.city.toLowerCase()) {
    score += WEIGHTS.sameCity;
    reasons.push(`Both in ${locA.city}`);
  }
  // Same region (Bay Area, NYC metro, etc.)
  else if (locA.region && locB.region && locA.region.toLowerCase() === locB.region.toLowerCase()) {
    score += WEIGHTS.sameRegion;
    reasons.push(`Both in ${locA.region}`);
  }
  // Same country
  else if (locA.country && locB.country && locA.country.toLowerCase() === locB.country.toLowerCase()) {
    score += WEIGHTS.sameCountry;
    reasons.push(`Both in ${locA.country}`);
  }
  
  return { score, reasons };
}

function normalizeLocation(profile) {
  // Try multiple sources
  const phoneSignals = profile.phone_signals || profile.phone_info || {};
  const location = profile.location || {};
  
  return {
    city: phoneSignals.city || location.city || profile.city || null,
    region: phoneSignals.region || location.region || null,
    state: phoneSignals.state || location.state || null,
    country: phoneSignals.country || location.country || null,
  };
}

// ─── INTEREST MATCHING ───
function scoreInterests(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  const interestsA = extractInterests(profileA);
  const interestsB = extractInterests(profileB);
  
  if (interestsA.length === 0 || interestsB.length === 0) {
    return { score: 0, reasons: [] };
  }
  
  // Find overlaps (case-insensitive)
  const normalizedA = interestsA.map(i => i.toLowerCase());
  const normalizedB = interestsB.map(i => i.toLowerCase());
  
  const shared = normalizedA.filter(i => normalizedB.includes(i));
  
  if (shared.length > 0) {
    score += shared.length * WEIGHTS.sharedInterest;
    reasons.push(`Shared interests: ${shared.slice(0, 3).join(", ")}${shared.length > 3 ? ` +${shared.length - 3} more` : ""}`);
  }
  
  return { score, reasons };
}

function extractInterests(profile) {
  // Try multiple sources
  if (Array.isArray(profile.interests)) {
    if (typeof profile.interests[0] === "string") {
      return profile.interests;
    }
    // Handle {category, keywords} format from brain enrichment
    return profile.interests.flatMap(i => i.keywords || [i.category]).filter(Boolean);
  }
  return [];
}

// ─── SKILL MATCHING ───
function scoreSkills(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  const skillsA = profileA.skills || [];
  const skillsB = profileB.skills || [];
  
  if (skillsA.length === 0 || skillsB.length === 0) {
    return { score: 0, reasons: [] };
  }
  
  const normalizedA = skillsA.map(s => s.toLowerCase());
  const normalizedB = skillsB.map(s => s.toLowerCase());
  
  const shared = normalizedA.filter(s => normalizedB.includes(s));
  
  if (shared.length > 0) {
    score += shared.length * WEIGHTS.sharedSkill;
    reasons.push(`Shared skills: ${shared.slice(0, 3).join(", ")}`);
  }
  
  return { score, reasons };
}

// ─── COMPLEMENTARY NEEDS ───
// Someone looking for X + someone offering X = great match
function scoreComplementary(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  const brainA = profileA.brain || {};
  const brainB = profileB.brain || {};
  
  const lookingForA = (brainA.looking_for || []).map(l => l.toLowerCase());
  const offeringA = (brainA.offering || []).map(o => o.toLowerCase());
  const lookingForB = (brainB.looking_for || []).map(l => l.toLowerCase());
  const offeringB = (brainB.offering || []).map(o => o.toLowerCase());
  
  // A looking for what B offers
  for (const need of lookingForA) {
    for (const offer of offeringB) {
      if (fuzzyMatch(need, offer)) {
        score += WEIGHTS.complementaryNeed;
        reasons.push(`${profileA.name || "A"} looking for "${need}" ← ${profileB.name || "B"} offers "${offer}"`);
      }
    }
  }
  
  // B looking for what A offers
  for (const need of lookingForB) {
    for (const offer of offeringA) {
      if (fuzzyMatch(need, offer)) {
        score += WEIGHTS.complementaryNeed;
        reasons.push(`${profileB.name || "B"} looking for "${need}" ← ${profileA.name || "A"} offers "${offer}"`);
      }
    }
  }
  
  return { score, reasons };
}

function fuzzyMatch(strA, strB) {
  // Simple word overlap matching
  const wordsA = strA.split(/\s+/).filter(w => w.length > 3);
  const wordsB = strB.split(/\s+/).filter(w => w.length > 3);
  
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      if (wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA)) {
        return true;
      }
    }
  }
  return false;
}

// ─── INDUSTRY/ROLE MATCHING ───
function scoreWork(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  const workA = profileA.work || profileA.brain || {};
  const workB = profileB.work || profileB.brain || {};
  
  // Same industry
  if (workA.industry && workB.industry) {
    if (workA.industry.toLowerCase() === workB.industry.toLowerCase()) {
      score += WEIGHTS.sameIndustry;
      reasons.push(`Both in ${workA.industry}`);
    }
  }
  
  // Similar roles (both founders, both designers, etc.)
  if (workA.role && workB.role) {
    const roleA = workA.role.toLowerCase();
    const roleB = workB.role.toLowerCase();
    
    // Check for common role keywords
    const roleKeywords = ["founder", "ceo", "engineer", "designer", "product", "marketing", "sales", "investor", "developer"];
    for (const keyword of roleKeywords) {
      if (roleA.includes(keyword) && roleB.includes(keyword)) {
        score += WEIGHTS.similarRole;
        reasons.push(`Both are ${keyword}s`);
        break;
      }
    }
  }
  
  return { score, reasons };
}

// ─── MUTUAL CONNECTIONS ───
function scoreMutualConnections(profileA, profileB) {
  let score = 0;
  let reasons = [];
  
  // Check mentions and mentioned_by
  const mentionsA = profileA.mentions || [];
  const mentionsB = profileB.mentions || [];
  const mentionedByA = profileA.mentioned_by || [];
  const mentionedByB = profileB.mentioned_by || [];
  
  const allConnectionsA = [...mentionsA, ...mentionedByA].map(n => n.toLowerCase());
  const allConnectionsB = [...mentionsB, ...mentionedByB].map(n => n.toLowerCase());
  
  const mutual = allConnectionsA.filter(c => allConnectionsB.includes(c));
  
  if (mutual.length > 0) {
    score += mutual.length * WEIGHTS.mutualConnection;
    reasons.push(`Mutual connections: ${mutual.slice(0, 3).join(", ")}`);
  }
  
  return { score, reasons };
}

// ═══════════════════════════════════════════════════════════
// MAIN MATCH FUNCTION
// ═══════════════════════════════════════════════════════════

export function scoreMatch(profileA, profileB) {
  let totalScore = 0;
  let allReasons = [];
  
  // Run all scoring functions
  const scorers = [
    scoreLocation,
    scoreInterests,
    scoreComplementary,
    scoreWork,
    scoreMutualConnections,
  ];
  
  for (const scorer of scorers) {
    try {
      const { score, reasons } = scorer(profileA, profileB);
      totalScore += score;
      allReasons.push(...reasons);
    } catch (e) {
      // Skip failed scorers
      console.warn(`Scorer failed: ${e.message}`);
    }
  }
  
  return {
    score: totalScore,
    reasons: allReasons,
    tier: totalScore >= 50 ? "strong" : totalScore >= 25 ? "moderate" : "weak",
  };
}

// ═══════════════════════════════════════════════════════════
// FIND ALL MATCHES
// ═══════════════════════════════════════════════════════════

export function findMatches(profiles, options = {}) {
  const {
    minScore = 15,
    maxMatches = 50,
    excludeSelf = true,
  } = options;
  
  const matches = [];
  
  // Compare all pairs
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const profileA = profiles[i];
      const profileB = profiles[j];
      
      // Skip if same person (by phone or name)
      if (excludeSelf) {
        if (profileA.phone && profileB.phone && profileA.phone === profileB.phone) continue;
        if (profileA.id && profileB.id && profileA.id === profileB.id) continue;
      }
      
      const result = scoreMatch(profileA, profileB);
      
      if (result.score >= minScore) {
        matches.push({
          profiles: [
            { name: profileA.name || profileA.display_name, id: profileA.id },
            { name: profileB.name || profileB.display_name, id: profileB.id },
          ],
          ...result,
        });
      }
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Limit results
  return matches.slice(0, maxMatches);
}

// ═══════════════════════════════════════════════════════════
// FIND MATCHES FOR ONE PERSON
// ═══════════════════════════════════════════════════════════

export function findMatchesFor(targetProfile, candidateProfiles, options = {}) {
  const {
    minScore = 15,
    maxMatches = 20,
  } = options;
  
  const matches = [];
  
  for (const candidate of candidateProfiles) {
    // Skip self
    if (targetProfile.phone && candidate.phone && targetProfile.phone === candidate.phone) continue;
    if (targetProfile.id && candidate.id && targetProfile.id === candidate.id) continue;
    
    const result = scoreMatch(targetProfile, candidate);
    
    if (result.score >= minScore) {
      matches.push({
        profile: {
          name: candidate.name || candidate.display_name,
          id: candidate.id,
          location: normalizeLocation(candidate),
          work: candidate.work || candidate.brain,
        },
        ...result,
      });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, maxMatches);
}

// ═══════════════════════════════════════════════════════════
// GENERATE INTRO MESSAGE
// ═══════════════════════════════════════════════════════════

export function generateIntroSuggestion(profileA, profileB, matchResult) {
  const nameA = (profileA.name || profileA.display_name || "").split(" ")[0];
  const nameB = (profileB.name || profileB.display_name || "").split(" ")[0];
  
  // Pick the most compelling reason
  const topReason = matchResult.reasons[0] || "you two should meet";
  
  // Build context
  const locA = normalizeLocation(profileA);
  const locB = normalizeLocation(profileB);
  const location = locA.city || locB.city || locA.region || "your area";
  
  // Template based on match type
  if (topReason.includes("Both in")) {
    return `Hey ${nameA}! Wanted to intro you to ${nameB} — you're both in ${location} and I think you'd hit it off. ${nameB}, ${nameA} is ${profileA.work?.title || profileA.brain?.role || "someone you should know"}. Should I set up a coffee?`;
  }
  
  if (topReason.includes("Shared interests")) {
    const interests = matchResult.reasons.find(r => r.includes("Shared interests"))?.replace("Shared interests: ", "") || "";
    return `${nameA}, meet ${nameB}! You both geek out on ${interests}. ${nameB}, ${nameA} is ${profileA.work?.title || profileA.brain?.role || "great"} — I think you'd have a lot to talk about.`;
  }
  
  if (topReason.includes("looking for")) {
    return `${nameA}, I think ${nameB} might be exactly who you're looking for. ${topReason}. Want me to make an intro?`;
  }
  
  // Generic
  return `Hey ${nameA}! You should meet ${nameB} — ${topReason}. I think you'd get along. Want me to connect you?`;
}

export default {
  scoreMatch,
  findMatches,
  findMatchesFor,
  generateIntroSuggestion,
  WEIGHTS,
};
