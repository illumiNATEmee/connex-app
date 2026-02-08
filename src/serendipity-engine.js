/**
 * SERENDIPITY ENGINE
 * The core differentiator — finding non-obvious connections
 * 
 * This isn't LinkedIn matching (same title + same city = match)
 * This is: "You both rebuilt after a startup failed and you're both in the Bangkok biohacking scene"
 */

// ═══════════════════════════════════════════════════════════
// CONNECTION DIMENSIONS
// ═══════════════════════════════════════════════════════════

export const ConnectionDimension = {
  // Time-based
  TIMELINE_OVERLAP: 'timeline_overlap',       // Same place same time
  LIFE_STAGE_SYNC: 'life_stage_sync',         // Same chapter of life
  TRANSITION_SYNC: 'transition_sync',         // Both going through change
  
  // Place-based  
  ORIGIN_STORY: 'origin_story',               // Same hometown/background
  SCENE_MEMBER: 'scene_member',               // Same community/venue
  TRAVEL_PATTERN: 'travel_pattern',           // Same nomad circuit
  
  // Experience-based
  SHARED_STRUGGLE: 'shared_struggle',         // Both overcame same thing
  SHARED_ACHIEVEMENT: 'shared_achievement',   // Both accomplished same thing
  SHARED_TRANSFORMATION: 'shared_transformation', // Both changed in same way
  
  // Interest-based
  OBSESSION_MATCH: 'obsession_match',         // Same deep interest
  CONTRARIAN_MATCH: 'contrarian_match',       // Both disagree with mainstream
  CREATOR_OVERLAP: 'creator_overlap',         // Both create similar things
  
  // Relationship-based
  MUTUAL_CLOSE_FRIEND: 'mutual_close_friend', // Actual friend, not LinkedIn
  SHARED_MENTOR: 'shared_mentor',             // Same advisor/influence
  NETWORK_BRIDGE: 'network_bridge',           // Can connect through someone
  
  // Values-based
  SHARED_CAUSE: 'shared_cause',               // Same mission/charity
  SHARED_PHILOSOPHY: 'shared_philosophy',     // Same worldview
  SHARED_PRACTICE: 'shared_practice',         // Same spiritual/wellness practice
  
  // Circumstantial (weak - never lead with)
  SAME_INDUSTRY: 'same_industry',
  SAME_CITY: 'same_city', 
  SAME_ROLE: 'same_role',
};

// Dimension strength rankings (higher = stronger connection)
export const DimensionStrength = {
  [ConnectionDimension.SHARED_STRUGGLE]: 95,
  [ConnectionDimension.SHARED_TRANSFORMATION]: 90,
  [ConnectionDimension.TIMELINE_OVERLAP]: 85,
  [ConnectionDimension.MUTUAL_CLOSE_FRIEND]: 85,
  [ConnectionDimension.SHARED_ACHIEVEMENT]: 80,
  [ConnectionDimension.ORIGIN_STORY]: 75,
  [ConnectionDimension.SCENE_MEMBER]: 75,
  [ConnectionDimension.OBSESSION_MATCH]: 70,
  [ConnectionDimension.SHARED_PRACTICE]: 70,
  [ConnectionDimension.LIFE_STAGE_SYNC]: 65,
  [ConnectionDimension.TRANSITION_SYNC]: 65,
  [ConnectionDimension.SHARED_CAUSE]: 60,
  [ConnectionDimension.CONTRARIAN_MATCH]: 60,
  [ConnectionDimension.TRAVEL_PATTERN]: 55,
  [ConnectionDimension.SHARED_PHILOSOPHY]: 55,
  [ConnectionDimension.CREATOR_OVERLAP]: 50,
  [ConnectionDimension.SHARED_MENTOR]: 50,
  [ConnectionDimension.NETWORK_BRIDGE]: 45,
  [ConnectionDimension.SAME_INDUSTRY]: 15,
  [ConnectionDimension.SAME_CITY]: 10,
  [ConnectionDimension.SAME_ROLE]: 10,
};

// ═══════════════════════════════════════════════════════════
// DEEP PROFILE SCHEMA
// ═══════════════════════════════════════════════════════════

/**
 * A Deep Profile captures everything needed for serendipity matching
 * This goes far beyond LinkedIn data
 */
export function createDeepProfile(data = {}) {
  return {
    // === IDENTITY ===
    id: data.id || generateId(),
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    
    // === TIMELINE ===
    timeline: data.timeline || {
      roles: [],
      education: [],
      locations: [],
      gaps: [],
    },
    
    // === CURRENT STATE ===
    current: data.current || {
      role: data.currentRole || '',
      company: data.currentCompany || '',
      location: data.currentLocation || '',
      timezone: '',
      mode: null,
      lifeStage: null,
      transitions: [],
    },
    
    // === EXPERIENCES ===
    experiences: data.experiences || {
      struggles: [],
      achievements: [],
      transformations: [],
    },
    
    // === SCENES & COMMUNITIES ===
    scenes: data.scenes || {
      communities: [],
      venues: [],
      events: [],
      travelPattern: null,
      travelCircuit: [],
    },
    
    // === DEEP INTERESTS ===
    interests: data.interests || {
      obsessions: [],
      influences: [],
      contrarian: [],
      creates: [],
    },
    
    // === RELATIONSHIPS ===
    relationships: data.relationships || {
      closeFriends: [],
      mentors: [],
      backers: [],
    },
    
    // === VALUES & PHILOSOPHY ===
    values: data.values || {
      causes: [],
      practices: [],
      philosophy: [],
    },
    
    // === NEEDS & OFFERS ===
    lookingFor: data.lookingFor || [],
    offering: data.offering || [],
    
    // === UNIQUE HOOKS ===
    hooks: data.hooks || [],
    
    // === META ===
    _meta: {
      created: data.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      sources: data.sources || [],
      confidence: data.confidence || 'low',
      researchGaps: data.researchGaps || [],
    },
    
    // === VERIFICATION ===
    verification: data.verification || {
      identityConfirmed: false,     // Is this the right person?
      linkedinVerified: false,      // LinkedIn profile confirmed?
      photoMatched: false,          // Profile photo cross-referenced?
      phoneVerified: false,         // Phone number confirmed?
      mutualConfirmed: false,       // Confirmed by mutual connection?
      directContact: false,         // Have we contacted them directly?
      lastVerified: null,           // When was verification done?
      verificationNotes: [],        // Any notes about verification
      confidenceScore: 0,           // 0-100 overall confidence
    },
  };
}

function generateId() {
  return 'p_' + Math.random().toString(36).substr(2, 9);
}

// ═══════════════════════════════════════════════════════════
// SERENDIPITY MATCHING
// ═══════════════════════════════════════════════════════════

/**
 * Find serendipitous connections between two deep profiles
 * Returns all connection dimensions found + overall serendipity score
 */
export function findSerendipity(profileA, profileB) {
  const connections = [];
  
  // 1. TIMELINE OVERLAPS
  const timelineOverlaps = findTimelineOverlaps(profileA, profileB);
  connections.push(...timelineOverlaps);
  
  // 2. SHARED STRUGGLES & TRANSFORMATIONS
  const sharedStruggles = findSharedStruggles(profileA, profileB);
  connections.push(...sharedStruggles);
  
  // 3. SCENE OVERLAPS
  const sceneOverlaps = findSceneOverlaps(profileA, profileB);
  connections.push(...sceneOverlaps);
  
  // 4. OBSESSION MATCHES
  const obsessionMatches = findObsessionMatches(profileA, profileB);
  connections.push(...obsessionMatches);
  
  // 5. RELATIONSHIP BRIDGES
  const relationshipBridges = findRelationshipBridges(profileA, profileB);
  connections.push(...relationshipBridges);
  
  // 6. VALUES ALIGNMENT
  const valuesAlignment = findValuesAlignment(profileA, profileB);
  connections.push(...valuesAlignment);
  
  // 7. LIFE STAGE SYNC
  const lifeStageSyncs = findLifeStageSyncs(profileA, profileB);
  connections.push(...lifeStageSyncs);
  
  // 8. WEAK SIGNALS (only if nothing else)
  if (connections.length === 0) {
    const weakSignals = findWeakSignals(profileA, profileB);
    connections.push(...weakSignals);
  }
  
  // Calculate overall serendipity score
  const serendipityScore = calculateSerendipityScore(connections);
  
  // Sort by strength
  connections.sort((a, b) => b.strength - a.strength);
  
  // Calculate verification scores
  const verificationA = calculateVerificationScore(profileA);
  const verificationB = calculateVerificationScore(profileB);
  
  // Overall confidence = serendipity * average verification
  const avgVerification = (verificationA.score + verificationB.score) / 2;
  const confidenceScore = Math.round((serendipityScore * avgVerification) / 100);
  
  return {
    profileA,
    profileB,
    connections,
    serendipityScore,
    verificationA,
    verificationB,
    confidenceScore, // The real score: match quality * data quality
    bestHook: connections[0] || null,
    hookSummary: generateHookSummary(profileA, profileB, connections),
    introMessage: generateSerendipitousIntro(profileA, profileB, connections),
  };
}

// ═══════════════════════════════════════════════════════════
// DIMENSION MATCHERS
// ═══════════════════════════════════════════════════════════

function findTimelineOverlaps(a, b) {
  const overlaps = [];
  
  // Check role overlaps (same company, overlapping dates)
  for (const roleA of (a.timeline?.roles || [])) {
    for (const roleB of (b.timeline?.roles || [])) {
      if (roleA.company?.toLowerCase() === roleB.company?.toLowerCase()) {
        if (datesOverlap(roleA.from, roleA.to, roleB.from, roleB.to)) {
          overlaps.push({
            dimension: ConnectionDimension.TIMELINE_OVERLAP,
            strength: DimensionStrength[ConnectionDimension.TIMELINE_OVERLAP],
            detail: `Both at ${roleA.company} at the same time`,
            evidence: { roleA, roleB },
            hookLine: `You were both at ${roleA.company} around the same time — did you overlap?`,
          });
        }
      }
    }
  }
  
  // Check education overlaps
  for (const eduA of (a.timeline?.education || [])) {
    for (const eduB of (b.timeline?.education || [])) {
      if (eduA.school?.toLowerCase() === eduB.school?.toLowerCase()) {
        if (datesOverlap(eduA.from, eduA.to, eduB.from, eduB.to)) {
          overlaps.push({
            dimension: ConnectionDimension.TIMELINE_OVERLAP,
            strength: DimensionStrength[ConnectionDimension.TIMELINE_OVERLAP] - 5,
            detail: `Both at ${eduA.school} at the same time`,
            evidence: { eduA, eduB },
            hookLine: `You were both at ${eduA.school} — small world!`,
          });
        }
      }
    }
  }
  
  // Check location overlaps (same city, same time)
  for (const locA of (a.timeline?.locations || [])) {
    for (const locB of (b.timeline?.locations || [])) {
      if (locA.city?.toLowerCase() === locB.city?.toLowerCase()) {
        if (datesOverlap(locA.from, locA.to, locB.from, locB.to)) {
          overlaps.push({
            dimension: ConnectionDimension.TIMELINE_OVERLAP,
            strength: DimensionStrength[ConnectionDimension.TIMELINE_OVERLAP] - 15,
            detail: `Both lived in ${locA.city} around the same time`,
            evidence: { locA, locB },
            hookLine: `You were both in ${locA.city} in ${locA.from} — were you in the same circles?`,
          });
        }
      }
    }
  }
  
  return overlaps;
}

function findSharedStruggles(a, b) {
  const matches = [];
  
  // Match struggles
  for (const struggleA of (a.experiences?.struggles || [])) {
    for (const struggleB of (b.experiences?.struggles || [])) {
      if (struggleA.type === struggleB.type) {
        matches.push({
          dimension: ConnectionDimension.SHARED_STRUGGLE,
          strength: DimensionStrength[ConnectionDimension.SHARED_STRUGGLE],
          detail: `Both went through ${formatStruggle(struggleA.type)}`,
          evidence: { struggleA, struggleB },
          hookLine: `You've both navigated ${formatStruggle(struggleA.type)} — that's a bond few understand`,
        });
      }
    }
  }
  
  // Match transformations
  // Categories of similar transformations
  const transformCategories = {
    'career_pivot': ['corporate', 'operator', 'employee', 'executive', 'manager'],
    'founder_journey': ['founder', 'entrepreneur', 'startup', 'builder', 'ceo'],
    'investor_transition': ['investor', 'vc', 'angel', 'investing'],
    'location_change': ['nomad', 'remote', 'expat', 'relocated', 'based'],
  };
  
  const getCategory = (term) => {
    const lower = term?.toLowerCase() || '';
    for (const [cat, terms] of Object.entries(transformCategories)) {
      if (terms.some(t => lower.includes(t))) return cat;
    }
    return lower;
  };
  
  const matchedTransformations = new Set();
  for (const transA of (a.experiences?.transformations || [])) {
    for (const transB of (b.experiences?.transformations || [])) {
      const fromCatA = getCategory(transA.from);
      const fromCatB = getCategory(transB.from);
      const toCatA = getCategory(transA.to);
      const toCatB = getCategory(transB.to);
      
      // Exact match OR similar category match
      const isMatch = (transA.from === transB.from && transA.to === transB.to) ||
                      (fromCatA === fromCatB && toCatA === toCatB && fromCatA !== toCatA);
      
      if (isMatch) {
        const key = `${fromCatA}->${toCatA}`;
        if (matchedTransformations.has(key)) continue;
        matchedTransformations.add(key);
        
        matches.push({
          dimension: ConnectionDimension.SHARED_TRANSFORMATION,
          strength: DimensionStrength[ConnectionDimension.SHARED_TRANSFORMATION],
          detail: `Both transformed from ${transA.from} to ${transA.to}`,
          evidence: { transA, transB },
          hookLine: `You both made the leap from ${transA.from} to ${transA.to}`,
        });
      }
    }
  }
  
  // Match achievements
  for (const achA of (a.experiences?.achievements || [])) {
    for (const achB of (b.experiences?.achievements || [])) {
      if (achA.type === achB.type) {
        matches.push({
          dimension: ConnectionDimension.SHARED_ACHIEVEMENT,
          strength: DimensionStrength[ConnectionDimension.SHARED_ACHIEVEMENT],
          detail: `Both achieved ${achA.description || achA.type}`,
          evidence: { achA, achB },
          hookLine: `You've both ${formatAchievement(achA)}`,
        });
      }
    }
  }
  
  return matches;
}

function findSceneOverlaps(a, b) {
  const overlaps = [];
  
  // Community overlaps
  for (const commA of (a.scenes?.communities || [])) {
    for (const commB of (b.scenes?.communities || [])) {
      if (fuzzyMatch(commA.name, commB.name) || commA.type === commB.type) {
        overlaps.push({
          dimension: ConnectionDimension.SCENE_MEMBER,
          strength: DimensionStrength[ConnectionDimension.SCENE_MEMBER],
          detail: `Both part of ${commA.name || commA.type} scene`,
          evidence: { commA, commB },
          hookLine: `You're both in the ${commA.name || commA.type} scene`,
        });
      }
    }
  }
  
  // Venue overlaps (highly specific = stronger)
  for (const venueA of (a.scenes?.venues || [])) {
    for (const venueB of (b.scenes?.venues || [])) {
      if (fuzzyMatch(venueA.name, venueB.name)) {
        overlaps.push({
          dimension: ConnectionDimension.SCENE_MEMBER,
          strength: DimensionStrength[ConnectionDimension.SCENE_MEMBER] + 10, // Bonus for specificity
          detail: `Both frequent ${venueA.name}`,
          evidence: { venueA, venueB },
          hookLine: `You're both regulars at ${venueA.name} — have you run into each other?`,
        });
      }
    }
  }
  
  // Event overlaps
  for (const eventA of (a.scenes?.events || [])) {
    for (const eventB of (b.scenes?.events || [])) {
      if (fuzzyMatch(eventA.name, eventB.name)) {
        overlaps.push({
          dimension: ConnectionDimension.SHARED_ACHIEVEMENT,
          strength: DimensionStrength[ConnectionDimension.SHARED_ACHIEVEMENT],
          detail: `Both attended ${eventA.name}`,
          evidence: { eventA, eventB },
          hookLine: `You were both at ${eventA.name}!`,
        });
      }
    }
  }
  
  // Travel pattern overlaps
  if (a.scenes?.travelPattern === 'nomad_circuit' && b.scenes?.travelPattern === 'nomad_circuit') {
    const sharedCircuit = (a.scenes.travelCircuit || []).filter(city =>
      (b.scenes.travelCircuit || []).includes(city)
    );
    if (sharedCircuit.length >= 2) {
      overlaps.push({
        dimension: ConnectionDimension.TRAVEL_PATTERN,
        strength: DimensionStrength[ConnectionDimension.TRAVEL_PATTERN],
        detail: `Both on the nomad circuit: ${sharedCircuit.join(', ')}`,
        evidence: { circuitA: a.scenes.travelCircuit, circuitB: b.scenes.travelCircuit },
        hookLine: `You're both on the ${sharedCircuit.join('-')} circuit`,
      });
    }
  }
  
  return overlaps;
}

function findObsessionMatches(a, b) {
  const matches = [];
  
  // Obsession matches
  for (const obsA of (a.interests?.obsessions || [])) {
    for (const obsB of (b.interests?.obsessions || [])) {
      if (fuzzyMatch(obsA.topic, obsB.topic)) {
        const depth = Math.min(
          obsA.depth === 'obsessed' ? 3 : obsA.depth === 'deep' ? 2 : 1,
          obsB.depth === 'obsessed' ? 3 : obsB.depth === 'deep' ? 2 : 1
        );
        matches.push({
          dimension: ConnectionDimension.OBSESSION_MATCH,
          strength: DimensionStrength[ConnectionDimension.OBSESSION_MATCH] + (depth * 5),
          detail: `Both deeply into ${obsA.topic}`,
          evidence: { obsA, obsB },
          hookLine: `You're both obsessed with ${obsA.topic}`,
        });
      }
    }
  }
  
  // Influence matches
  for (const infA of (a.interests?.influences || [])) {
    for (const infB of (b.interests?.influences || [])) {
      if (fuzzyMatch(infA.name, infB.name)) {
        matches.push({
          dimension: ConnectionDimension.OBSESSION_MATCH,
          strength: DimensionStrength[ConnectionDimension.OBSESSION_MATCH] - 10,
          detail: `Both follow ${infA.name}`,
          evidence: { infA, infB },
          hookLine: `You're both ${infA.name} fans`,
        });
      }
    }
  }
  
  // Contrarian matches (rare but powerful)
  for (const conA of (a.interests?.contrarian || [])) {
    for (const conB of (b.interests?.contrarian || [])) {
      if (fuzzyMatch(conA.topic, conB.topic) && conA.stance === conB.stance) {
        matches.push({
          dimension: ConnectionDimension.CONTRARIAN_MATCH,
          strength: DimensionStrength[ConnectionDimension.CONTRARIAN_MATCH],
          detail: `Both contrarian on ${conA.topic}`,
          evidence: { conA, conB },
          hookLine: `You're both skeptical of the ${conA.topic} hype`,
        });
      }
    }
  }
  
  return matches;
}

function findRelationshipBridges(a, b) {
  const bridges = [];
  
  // Close friend matches
  for (const friendA of (a.relationships?.closeFriends || [])) {
    for (const friendB of (b.relationships?.closeFriends || [])) {
      if (fuzzyMatch(friendA.name, friendB.name)) {
        bridges.push({
          dimension: ConnectionDimension.MUTUAL_CLOSE_FRIEND,
          strength: DimensionStrength[ConnectionDimension.MUTUAL_CLOSE_FRIEND],
          detail: `Both close with ${friendA.name}`,
          evidence: { friendA, friendB },
          hookLine: `You both know ${friendA.name} well!`,
        });
      }
    }
  }
  
  // Mentor matches
  for (const mentorA of (a.relationships?.mentors || [])) {
    for (const mentorB of (b.relationships?.mentors || [])) {
      if (fuzzyMatch(mentorA.name, mentorB.name)) {
        bridges.push({
          dimension: ConnectionDimension.SHARED_MENTOR,
          strength: DimensionStrength[ConnectionDimension.SHARED_MENTOR],
          detail: `Both mentored by ${mentorA.name}`,
          evidence: { mentorA, mentorB },
          hookLine: `You've both worked with ${mentorA.name}`,
        });
      }
    }
  }
  
  // Backer matches
  for (const backerA of (a.relationships?.backers || [])) {
    for (const backerB of (b.relationships?.backers || [])) {
      if (fuzzyMatch(backerA.name, backerB.name)) {
        bridges.push({
          dimension: ConnectionDimension.NETWORK_BRIDGE,
          strength: DimensionStrength[ConnectionDimension.NETWORK_BRIDGE],
          detail: `Both backed by ${backerA.name}`,
          evidence: { backerA, backerB },
          hookLine: `You're both in the ${backerA.name} portfolio`,
        });
      }
    }
  }
  
  return bridges;
}

function findValuesAlignment(a, b) {
  const alignments = [];
  
  // Cause matches
  for (const causeA of (a.values?.causes || [])) {
    for (const causeB of (b.values?.causes || [])) {
      if (fuzzyMatch(causeA.name, causeB.name)) {
        alignments.push({
          dimension: ConnectionDimension.SHARED_CAUSE,
          strength: DimensionStrength[ConnectionDimension.SHARED_CAUSE],
          detail: `Both support ${causeA.name}`,
          evidence: { causeA, causeB },
          hookLine: `You both care about ${causeA.name}`,
        });
      }
    }
  }
  
  // Practice matches - only match on specific practices, not just type
  const matchedPractices = new Set();
  for (const practiceA of (a.values?.practices || [])) {
    for (const practiceB of (b.values?.practices || [])) {
      // Must have specifics and they must match
      if (practiceA.specifics && practiceB.specifics && 
          fuzzyMatch(practiceA.specifics, practiceB.specifics)) {
        // Avoid duplicates
        const key = practiceA.specifics.toLowerCase();
        if (!matchedPractices.has(key)) {
          matchedPractices.add(key);
          alignments.push({
            dimension: ConnectionDimension.SHARED_PRACTICE,
            strength: DimensionStrength[ConnectionDimension.SHARED_PRACTICE],
            detail: `Both practice ${practiceA.specifics}`,
            evidence: { practiceA, practiceB },
            hookLine: `You both do ${practiceA.specifics}`,
          });
        }
      }
    }
  }
  
  // Philosophy matches
  const sharedPhilosophy = (a.values?.philosophy || []).filter(p =>
    (b.values?.philosophy || []).includes(p)
  );
  if (sharedPhilosophy.length > 0) {
    alignments.push({
      dimension: ConnectionDimension.SHARED_PHILOSOPHY,
      strength: DimensionStrength[ConnectionDimension.SHARED_PHILOSOPHY],
      detail: `Shared worldview: ${sharedPhilosophy.join(', ')}`,
      evidence: { sharedPhilosophy },
      hookLine: `You're both ${sharedPhilosophy[0]} minded`,
    });
  }
  
  return alignments;
}

function findLifeStageSyncs(a, b) {
  const syncs = [];
  
  // Life stage match
  if (a.current?.lifeStage && a.current.lifeStage === b.current?.lifeStage) {
    syncs.push({
      dimension: ConnectionDimension.LIFE_STAGE_SYNC,
      strength: DimensionStrength[ConnectionDimension.LIFE_STAGE_SYNC],
      detail: `Both in ${formatLifeStage(a.current.lifeStage)} phase`,
      evidence: { stageA: a.current.lifeStage, stageB: b.current.lifeStage },
      hookLine: `You're both in the ${formatLifeStage(a.current.lifeStage)} chapter`,
    });
  }
  
  // Mode match
  if (a.current?.mode && a.current.mode === b.current?.mode) {
    syncs.push({
      dimension: ConnectionDimension.LIFE_STAGE_SYNC,
      strength: DimensionStrength[ConnectionDimension.LIFE_STAGE_SYNC] - 10,
      detail: `Both in ${a.current.mode} mode`,
      evidence: { modeA: a.current.mode, modeB: b.current.mode },
      hookLine: `You're both in ${a.current.mode} mode right now`,
    });
  }
  
  // Transition match
  const sharedTransitions = (a.current?.transitions || []).filter(t =>
    (b.current?.transitions || []).includes(t)
  );
  if (sharedTransitions.length > 0) {
    syncs.push({
      dimension: ConnectionDimension.TRANSITION_SYNC,
      strength: DimensionStrength[ConnectionDimension.TRANSITION_SYNC],
      detail: `Both going through ${sharedTransitions[0]}`,
      evidence: { sharedTransitions },
      hookLine: `You're both navigating ${formatTransition(sharedTransitions[0])}`,
    });
  }
  
  return syncs;
}

function findWeakSignals(a, b) {
  const signals = [];
  
  // Same city (weak)
  if (a.current?.location && fuzzyMatch(a.current.location, b.current?.location)) {
    signals.push({
      dimension: ConnectionDimension.SAME_CITY,
      strength: DimensionStrength[ConnectionDimension.SAME_CITY],
      detail: `Both in ${a.current.location}`,
      evidence: {},
      hookLine: `You're both in ${a.current.location}`,
    });
  }
  
  // Same industry (weak)
  // ... add more weak signals as fallback
  
  return signals;
}

// ═══════════════════════════════════════════════════════════
// SCORING & OUTPUT
// ═══════════════════════════════════════════════════════════

function calculateSerendipityScore(connections) {
  if (connections.length === 0) return 0;
  
  // Take top 3 connections, weight by strength
  const topConnections = connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  
  const baseScore = topConnections.reduce((sum, c) => sum + c.strength, 0) / 3;
  
  // Bonus for multiple strong connections
  const multipleBonus = Math.min(connections.length * 5, 20);
  
  // Bonus for variety in dimensions
  const uniqueDimensions = new Set(connections.map(c => c.dimension)).size;
  const varietyBonus = Math.min(uniqueDimensions * 3, 15);
  
  return Math.min(Math.round(baseScore + multipleBonus + varietyBonus), 100);
}

// ═══════════════════════════════════════════════════════════
// VERIFICATION SCORING
// ═══════════════════════════════════════════════════════════

/**
 * Calculate verification score for a profile
 * Returns 0-100 confidence that this profile data is accurate
 */
export function calculateVerificationScore(profile) {
  const v = profile.verification || {};
  let score = 0;
  const checks = [];
  const gaps = [];
  
  // Identity confirmation (25 points)
  if (v.identityConfirmed) {
    score += 25;
    checks.push("✓ Identity confirmed");
  } else if (v.linkedinVerified) {
    score += 15;
    checks.push("~ Identity probable (LinkedIn match)");
    gaps.push("Confirm identity with mutual connection");
  } else {
    gaps.push("Verify identity (LinkedIn search needed)");
  }
  
  // LinkedIn verified (20 points)
  if (v.linkedinVerified) {
    score += 20;
    checks.push("✓ LinkedIn profile verified");
  } else {
    gaps.push("Find and verify LinkedIn profile");
  }
  
  // Multiple sources (15 points)
  const sources = profile._meta?.sources || [];
  if (sources.length >= 3) {
    score += 15;
    checks.push("✓ Multiple sources cross-referenced");
  } else if (sources.length >= 2) {
    score += 10;
    checks.push("~ Two sources found");
    gaps.push("Find additional sources for cross-reference");
  } else {
    gaps.push("Need more sources to cross-reference");
  }
  
  // Recent activity (15 points)
  if (v.recentActivity) {
    score += 15;
    checks.push("✓ Recent activity confirmed");
  } else {
    gaps.push("Check for recent activity (last 6 months)");
  }
  
  // Photo available (10 points)
  if (v.photoMatched) {
    score += 10;
    checks.push("✓ Photo cross-referenced");
  } else if (profile.photoUrl) {
    score += 5;
    checks.push("~ Photo available (not cross-referenced)");
  } else {
    gaps.push("No photo available for verification");
  }
  
  // Mutual confirmed (15 points)
  if (v.mutualConfirmed) {
    score += 15;
    checks.push("✓ Confirmed by mutual connection");
  } else {
    gaps.push("Ask connector to confirm details");
  }
  
  return {
    score: Math.min(score, 100),
    level: getVerificationLevel(score),
    checks,
    gaps,
  };
}

function getVerificationLevel(score) {
  if (score >= 90) return { level: 4, label: "⭐ Human Verified", color: "green" };
  if (score >= 75) return { level: 3, label: "✓✓ Deep Verified", color: "green" };
  if (score >= 50) return { level: 2, label: "✓ Confirmed", color: "yellow" };
  if (score >= 20) return { level: 1, label: "🔍 Probable", color: "orange" };
  return { level: 0, label: "❓ Unverified", color: "red" };
}

/**
 * Calculate per-field confidence
 */
export function getFieldConfidence(profile) {
  const fields = {};
  const sources = profile._meta?.sources || [];
  const v = profile.verification || {};
  
  // Current role/company — high confidence if LinkedIn verified
  fields.currentRole = {
    value: profile.current?.role,
    confidence: v.linkedinVerified ? "verified" : sources.length > 0 ? "probable" : "unknown",
    source: v.linkedinVerified ? "LinkedIn" : sources[0] || "unknown",
  };
  
  fields.currentCompany = {
    value: profile.current?.company,
    confidence: v.linkedinVerified ? "verified" : sources.length > 0 ? "probable" : "unknown",
    source: v.linkedinVerified ? "LinkedIn" : sources[0] || "unknown",
  };
  
  fields.location = {
    value: profile.current?.location,
    confidence: v.linkedinVerified ? "probable" : "inferred", // Location often outdated
    source: "LinkedIn/phone area code",
  };
  
  // Interests — usually inferred
  fields.interests = {
    value: profile.interests?.obsessions?.map(o => o.topic).join(", "),
    confidence: "inferred",
    source: "Posts/content analysis",
  };
  
  // Looking for — often assumed
  fields.lookingFor = {
    value: profile.lookingFor?.join(", "),
    confidence: profile.lookingFor?.length > 0 ? "inferred" : "unknown",
    source: "Job posts/content",
  };
  
  // Experiences — depends on source
  fields.transformations = {
    value: profile.experiences?.transformations?.map(t => `${t.from}→${t.to}`).join(", "),
    confidence: v.linkedinVerified ? "inferred" : "assumed",
    source: "Timeline analysis",
  };
  
  return fields;
}

function generateHookSummary(a, b, connections) {
  if (connections.length === 0) {
    return `${a.name} and ${b.name} — no strong connection found yet`;
  }
  
  const best = connections[0];
  const secondary = connections.slice(1, 3);
  
  let summary = `**${a.name}** ↔ **${b.name}**: ${best.detail}`;
  
  if (secondary.length > 0) {
    summary += ` (+ ${secondary.map(c => c.detail.toLowerCase()).join(', ')})`;
  }
  
  return summary;
}

function generateSerendipitousIntro(a, b, connections) {
  if (connections.length === 0) {
    return `Hey ${a.name?.split(' ')[0]}, meet ${b.name?.split(' ')[0]}!`;
  }
  
  const best = connections[0];
  const aFirst = a.name?.split(' ')[0] || a.name;
  const bFirst = b.name?.split(' ')[0] || b.name;
  
  return `Hey ${aFirst}, meet ${bFirst}! 

${best.hookLine}

${aFirst} — ${a.current?.role || ''}${a.current?.company ? ` @ ${a.current.company}` : ''}
${bFirst} — ${b.current?.role || ''}${b.current?.company ? ` @ ${b.current.company}` : ''}

I think you'll hit it off. 🤝`;
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function datesOverlap(from1, to1, from2, to2) {
  // Simple year-based overlap check
  const start1 = parseYear(from1);
  const end1 = parseYear(to1) || new Date().getFullYear();
  const start2 = parseYear(from2);
  const end2 = parseYear(to2) || new Date().getFullYear();
  
  if (!start1 || !start2) return false;
  
  return start1 <= end2 && start2 <= end1;
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\d{4}/);
  return match ? parseInt(match[0]) : null;
}

function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const aLower = String(a).toLowerCase().trim();
  const bLower = String(b).toLowerCase().trim();
  return aLower === bLower || aLower.includes(bLower) || bLower.includes(aLower);
}

function formatStruggle(type) {
  const formats = {
    startup_failure: 'a startup failure',
    burnout: 'burnout',
    health: 'health challenges',
    loss: 'significant loss',
    career_crisis: 'a career crisis',
  };
  return formats[type] || type;
}

function formatAchievement(ach) {
  return ach.description || `completed ${ach.type}`;
}

function formatLifeStage(stage) {
  const formats = {
    early_career: 'early career',
    established: 'established professional',
    executive: 'executive',
    post_exit: 'post-exit',
    retired: 'retired',
  };
  return formats[stage] || stage;
}

function formatTransition(transition) {
  const formats = {
    just_moved: 'a recent move',
    new_job: 'a new role',
    new_parent: 'new parenthood',
    post_breakup: 'a relationship transition',
    exploring: 'an exploratory phase',
  };
  return formats[transition] || transition;
}

// ═══════════════════════════════════════════════════════════
// BATCH OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Find all serendipitous connections in a network
 */
export function findAllSerendipity(profiles, options = {}) {
  const { minScore = 30, maxResults = 50 } = options;
  const results = [];
  
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const match = findSerendipity(profiles[i], profiles[j]);
      if (match.serendipityScore >= minScore) {
        results.push(match);
      }
    }
  }
  
  return results
    .sort((a, b) => b.serendipityScore - a.serendipityScore)
    .slice(0, maxResults);
}

/**
 * Find best serendipitous matches for a single person
 */
export function findMatchesFor(targetProfile, networkProfiles, options = {}) {
  const { minScore = 30, maxResults = 10 } = options;
  
  return networkProfiles
    .filter(p => p.id !== targetProfile.id && p.name !== targetProfile.name)
    .map(p => findSerendipity(targetProfile, p))
    .filter(m => m.serendipityScore >= minScore)
    .sort((a, b) => b.serendipityScore - a.serendipityScore)
    .slice(0, maxResults);
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  ConnectionDimension,
  DimensionStrength,
  createDeepProfile,
  findSerendipity,
  findAllSerendipity,
  findMatchesFor,
  calculateVerificationScore,
  getFieldConfidence,
};
