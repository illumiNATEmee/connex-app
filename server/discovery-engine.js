// ═══════════════════════════════════════════════════════════
// DISCOVERY ENGINE
// 
// Answers: "Who should you talk to RIGHT NOW and why?"
// 
// Real signals > vanity matching
// Timing > static compatibility  
// Actionable > informational
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// SIGNAL EXTRACTORS
// ─────────────────────────────────────────────────────────────

/**
 * Extract active intents from messages
 * "I'm looking for..." / "Anyone know..." / "Hiring..." / "Raising..."
 */
export function extractIntents(messages) {
  const intentPatterns = [
    // Seeking something
    { pattern: /(?:i'?m |we'?re |currently )?(?:looking for|searching for|trying to find|need(?:ing)?)\s+(.+?)(?:\.|!|\?|$)/gi, type: 'seeking', strength: 0.9 },
    { pattern: /(?:anyone know|does anyone|who knows|can someone)\s+(.+?)(?:\?|$)/gi, type: 'asking', strength: 0.85 },
    
    // Hiring
    { pattern: /(?:i'?m |we'?re )?hiring\s+(.+?)(?:\.|!|$)/gi, type: 'hiring', strength: 0.95 },
    { pattern: /(?:open role|job opening|looking to hire)\s*(?:for\s+)?(.+?)(?:\.|!|$)/gi, type: 'hiring', strength: 0.9 },
    
    // Job seeking
    { pattern: /(?:looking for (?:a |an )?(?:new )?(?:job|role|position|opportunity))/gi, type: 'job_seeking', strength: 0.95 },
    { pattern: /(?:open to (?:new )?opportunities|exploring options)/gi, type: 'job_seeking', strength: 0.8 },
    
    // Fundraising
    { pattern: /(?:raising|fundraising|looking for (?:investors?|funding|capital))/gi, type: 'fundraising', strength: 0.95 },
    { pattern: /(?:series [a-d]|seed round|pre-seed)/gi, type: 'fundraising', strength: 0.9 },
    
    // Selling/offering
    { pattern: /(?:i can help with|i'?m? offering|happy to help|let me know if you need)\s+(.+?)(?:\.|!|$)/gi, type: 'offering', strength: 0.7 },
    
    // Intro requests
    { pattern: /(?:can (?:someone |anyone )?intro|would love an intro|looking for intro)/gi, type: 'seeking_intro', strength: 0.9 },
    { pattern: /(?:happy to intro|i can connect|want me to intro)/gi, type: 'offering_intro', strength: 0.8 },
  ];

  const intents = [];
  const now = new Date();

  messages.forEach(msg => {
    const msgDate = parseMessageDate(msg);
    const daysSince = msgDate ? Math.floor((now - msgDate) / (1000 * 60 * 60 * 24)) : 999;
    
    // Recency multiplier: last 7 days = 3x, last 30 = 1.5x, older = 0.5x
    const recencyMultiplier = daysSince <= 7 ? 3 : daysSince <= 30 ? 1.5 : 0.5;

    intentPatterns.forEach(({ pattern, type, strength }) => {
      const matches = msg.text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        intents.push({
          type,
          sender: msg.sender,
          detail: match[1]?.trim() || null,
          fullText: msg.text.slice(0, 200),
          date: msg.date,
          daysSince,
          strength: strength * recencyMultiplier,
          raw_strength: strength,
        });
      }
    });
  });

  return intents;
}

/**
 * Extract timing signals - travel, events, deadlines
 */
export function extractTimingSignals(messages) {
  const timingPatterns = [
    // Travel - future
    { pattern: /(?:i'?ll be in|heading to|flying to|going to|visiting)\s+([a-z\s]+?)(?:\s+(?:next|this|on|in)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\s+soon|$)/gi, type: 'travel_future', strength: 0.95 },
    
    // Travel - current
    { pattern: /(?:just (?:landed|arrived)|i'?m in|currently in|based in)\s+([a-z\s]+?)(?:\s|$|!|\.)/gi, type: 'travel_current', strength: 0.9 },
    
    // Events
    { pattern: /(?:going to|attending|speaking at|will be at)\s+(.+?)(?:\s+(?:next|this)\s+(?:week|month)|$)/gi, type: 'event', strength: 0.85 },
    
    // Deadlines/urgency
    { pattern: /(?:deadline|launching|closing|announcing)\s+(?:next|this)\s+(?:week|month)/gi, type: 'deadline', strength: 0.9 },
    
    // Life changes
    { pattern: /(?:just (?:started|joined|left|quit)|new job|new role|starting at)/gi, type: 'life_change', strength: 0.8 },
  ];

  const signals = [];
  const now = new Date();

  messages.forEach(msg => {
    const msgDate = parseMessageDate(msg);
    const daysSince = msgDate ? Math.floor((now - msgDate) / (1000 * 60 * 60 * 24)) : 999;
    
    // Timing signals decay fast - only last 14 days really matter
    if (daysSince > 14) return;

    timingPatterns.forEach(({ pattern, type, strength }) => {
      const matches = msg.text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        signals.push({
          type,
          sender: msg.sender,
          location: match[1]?.trim() || null,
          detail: match[0],
          date: msg.date,
          daysSince,
          strength: strength * (daysSince <= 7 ? 1 : 0.5),
        });
      }
    });
  });

  return signals;
}

/**
 * Build warm paths - who can intro who
 */
export function buildWarmPaths(relationshipGraph, targetPerson, yourName) {
  const paths = [];
  
  // Direct relationship
  const directRel = relationshipGraph.find(r => 
    (r.personA === yourName && r.personB === targetPerson) ||
    (r.personB === yourName && r.personA === targetPerson)
  );
  
  if (directRel && directRel.strength >= 30) {
    paths.push({
      type: 'direct',
      strength: directRel.strength,
      description: `You've talked directly (strength: ${directRel.strength})`,
      bidirectional: directRel.bidirectional,
    });
  }

  // Find mutual connections (bridges)
  const yourConnections = relationshipGraph
    .filter(r => r.personA === yourName || r.personB === yourName)
    .map(r => ({
      person: r.personA === yourName ? r.personB : r.personA,
      strength: r.strength,
    }))
    .filter(c => c.strength >= 40); // Only strong connections can intro

  const theirConnections = relationshipGraph
    .filter(r => r.personA === targetPerson || r.personB === targetPerson)
    .map(r => ({
      person: r.personA === targetPerson ? r.personB : r.personA,
      strength: r.strength,
    }))
    .filter(c => c.strength >= 30);

  // Find overlaps
  yourConnections.forEach(yours => {
    const theirMatch = theirConnections.find(t => t.person === yours.person);
    if (theirMatch) {
      const bridgeStrength = Math.min(yours.strength, theirMatch.strength);
      paths.push({
        type: 'bridge',
        via: yours.person,
        yourStrength: yours.strength,
        theirStrength: theirMatch.strength,
        bridgeStrength,
        description: `${yours.person} knows you both (${yours.strength}/${theirMatch.strength})`,
      });
    }
  });

  // Sort by effectiveness
  paths.sort((a, b) => {
    if (a.type === 'direct') return -1;
    if (b.type === 'direct') return 1;
    return b.bridgeStrength - a.bridgeStrength;
  });

  return paths;
}

// ─────────────────────────────────────────────────────────────
// FIT SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Calculate fit between your profile and a target person
 */
export function calculateFit(yourProfile, targetProfile, brain = null) {
  const fit = {
    score: 0,
    reasons: [],
    youCanHelp: [],
    theyCanHelp: [],
  };

  // Your offerings vs their needs
  const yourOfferings = (yourProfile.offering || []).map(s => s.toLowerCase());
  const theirNeeds = [
    ...(targetProfile.looking_for || []),
    ...((brain?.intents || [])
      .filter(i => i.sender === targetProfile.display_name && ['seeking', 'hiring', 'job_seeking', 'fundraising'].includes(i.type))
      .map(i => i.detail || i.type))
  ].map(s => s?.toLowerCase()).filter(Boolean);

  theirNeeds.forEach(need => {
    yourOfferings.forEach(offer => {
      if (fuzzyMatch(offer, need)) {
        fit.score += 15;
        fit.youCanHelp.push({ need, offer });
        fit.reasons.push(`You can help: ${offer} → their need for ${need}`);
      }
    });
  });

  // Their offerings vs your needs
  const yourNeeds = (yourProfile.looking_for || []).map(s => s.toLowerCase());
  const theirOfferings = [
    ...(targetProfile.offering || []),
    ...((brain?.intents || [])
      .filter(i => i.sender === targetProfile.display_name && ['offering', 'offering_intro'].includes(i.type))
      .map(i => i.detail || i.type))
  ].map(s => s?.toLowerCase()).filter(Boolean);

  yourNeeds.forEach(need => {
    theirOfferings.forEach(offer => {
      if (fuzzyMatch(offer, need)) {
        fit.score += 15;
        fit.theyCanHelp.push({ need, offer });
        fit.reasons.push(`They can help: ${offer} → your need for ${need}`);
      }
    });
  });

  // Shared deep interests (not just surface)
  const yourInterests = (yourProfile.interests || []).map(i => i.toLowerCase());
  const theirInterests = (targetProfile.interests || []).flatMap(i => 
    [i.category, ...(i.keywords || [])].map(k => k?.toLowerCase())
  ).filter(Boolean);

  const sharedInterests = yourInterests.filter(yi => 
    theirInterests.some(ti => fuzzyMatch(yi, ti))
  );

  if (sharedInterests.length >= 2) {
    fit.score += 10;
    fit.reasons.push(`Deep shared interests: ${sharedInterests.slice(0, 3).join(', ')}`);
  }

  // Same industry
  if (yourProfile.industry && targetProfile.brain?.industry) {
    if (fuzzyMatch(yourProfile.industry, targetProfile.brain.industry)) {
      fit.score += 8;
      fit.reasons.push(`Same industry: ${targetProfile.brain.industry}`);
    }
  }

  return fit;
}

// ─────────────────────────────────────────────────────────────
// MAIN DISCOVERY ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Discover who you should talk to right now
 * 
 * @param {Object} yourProfile - Your profile with interests, offerings, needs
 * @param {Array} candidates - Array of profile objects to evaluate
 * @param {Object} brain - Extracted brain data (intents, timing, relationships)
 * @param {Object} options - Configuration options
 * @returns {Array} Ranked list of recommendations with activation steps
 */
export function discoverConnections(yourProfile, candidates, brain = {}, options = {}) {
  const {
    yourCity = null,
    maxResults = 10,
    minScore = 20,
  } = options;

  const recommendations = [];

  candidates.forEach(candidate => {
    if (candidate.display_name === yourProfile.name) return; // Skip self

    const rec = {
      person: candidate.display_name,
      score: 0,
      signals: [],
      timing: null,
      warmPath: null,
      fit: null,
      activation: null,
    };

    // ─── 1. ACTIVE INTENTS (highest signal) ───
    const theirIntents = (brain.intents || [])
      .filter(i => i.sender === candidate.display_name)
      .sort((a, b) => b.strength - a.strength);

    theirIntents.slice(0, 3).forEach(intent => {
      rec.score += intent.strength * 10;
      rec.signals.push({
        type: 'intent',
        signal: `${intent.type}: ${intent.detail || intent.fullText?.slice(0, 50)}`,
        strength: intent.strength,
        date: intent.date,
        daysSince: intent.daysSince,
      });
    });

    // ─── 2. TIMING SIGNALS ───
    const theirTiming = (brain.timingSignals || [])
      .filter(t => t.sender === candidate.display_name)
      .sort((a, b) => b.strength - a.strength);

    if (theirTiming.length > 0) {
      const bestTiming = theirTiming[0];
      rec.timing = bestTiming;
      rec.score += bestTiming.strength * 15;
      
      // Bonus if they're in your city
      if (yourCity && bestTiming.location) {
        const normalizedCity = normalizeCity(yourCity);
        const normalizedLocation = normalizeCity(bestTiming.location);
        if (normalizedCity === normalizedLocation) {
          rec.score += 25;
          rec.signals.push({
            type: 'timing_match',
            signal: `In ${yourCity} ${bestTiming.daysSince <= 7 ? 'NOW' : 'soon'}!`,
            strength: 1.0,
          });
        }
      }
    }

    // ─── 3. WARM PATH ───
    if (brain.relationshipGraph) {
      const paths = buildWarmPaths(brain.relationshipGraph, candidate.display_name, yourProfile.name);
      if (paths.length > 0) {
        rec.warmPath = paths[0];
        rec.score += paths[0].type === 'direct' ? 20 : 15;
        rec.signals.push({
          type: 'warm_path',
          signal: paths[0].description,
          strength: paths[0].type === 'direct' ? 0.9 : 0.7,
        });
      }
    }

    // ─── 4. FIT SCORING ───
    rec.fit = calculateFit(yourProfile, candidate, brain);
    rec.score += rec.fit.score;
    rec.fit.reasons.forEach(reason => {
      rec.signals.push({
        type: 'fit',
        signal: reason,
        strength: 0.6,
      });
    });

    // ─── 5. RECENCY BONUS ───
    const recentMessages = (brain.messages || [])
      .filter(m => m.sender === candidate.display_name)
      .filter(m => {
        const d = parseMessageDate(m);
        return d && (new Date() - d) < 30 * 24 * 60 * 60 * 1000;
      });

    if (recentMessages.length > 0) {
      rec.score += 5;
      rec.signals.push({
        type: 'recency',
        signal: `Active in last 30 days (${recentMessages.length} messages)`,
        strength: 0.5,
      });
    }

    // ─── 6. GENERATE ACTIVATION ───
    rec.activation = generateActivation(rec, yourProfile, candidate);

    // Cap score at 100
    rec.score = Math.min(Math.round(rec.score), 100);

    if (rec.score >= minScore) {
      recommendations.push(rec);
    }
  });

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, maxResults);
}

// ─────────────────────────────────────────────────────────────
// ACTIVATION GENERATOR
// ─────────────────────────────────────────────────────────────

/**
 * Generate specific activation recommendation
 */
function generateActivation(rec, yourProfile, targetProfile) {
  const activation = {
    action: null,
    method: null,
    message: null,
    urgency: 'normal',
  };

  // Determine urgency
  if (rec.timing && rec.timing.daysSince <= 7) {
    activation.urgency = 'high';
  }
  if (rec.signals.some(s => s.type === 'timing_match')) {
    activation.urgency = 'urgent';
  }

  // Determine method
  if (rec.warmPath?.type === 'direct') {
    activation.method = 'direct_message';
    activation.action = `Message ${targetProfile.display_name} directly`;
  } else if (rec.warmPath?.type === 'bridge') {
    activation.method = 'intro_request';
    activation.action = `Ask ${rec.warmPath.via} for an intro`;
  } else {
    activation.method = 'cold_outreach';
    activation.action = `Reach out in the group chat or find their contact`;
  }

  // Generate message
  const firstName = targetProfile.display_name.split(' ')[0];
  const yourFirstName = yourProfile.name?.split(' ')[0] || 'Hey';

  if (activation.method === 'intro_request') {
    const bridge = rec.warmPath.via.split(' ')[0];
    const reason = rec.fit?.youCanHelp?.[0]?.need || 
                   rec.signals.find(s => s.type === 'intent')?.signal ||
                   'would love to connect';
    
    activation.message = `Hey ${bridge}! Would you intro me to ${firstName}? I saw ${reason.includes(':') ? reason.split(':')[1].trim() : reason} and think I could help.`;
  } else {
    const hook = rec.fit?.youCanHelp?.[0] 
      ? `I noticed you're looking for ${rec.fit.youCanHelp[0].need} — I might be able to help with that.`
      : rec.signals.find(s => s.type === 'intent')
        ? `Saw your message about ${rec.signals.find(s => s.type === 'intent').signal.split(':')[1]?.trim() || 'what you mentioned'}.`
        : `Been meaning to connect!`;

    activation.message = `Hey ${firstName}! ${hook} Would love to chat if you're up for it.`;
  }

  return activation;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function parseMessageDate(msg) {
  if (!msg.date) return null;
  
  // Try YYYY-MM-DD
  const iso = msg.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }
  
  // Try M/D/YY or MM/DD/YYYY
  const mdy = msg.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let year = parseInt(mdy[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(mdy[1]) - 1, parseInt(mdy[2]));
  }
  
  return null;
}

function normalizeCity(city) {
  if (!city) return null;
  const aliases = {
    'sf': 'san francisco', 'san fran': 'san francisco',
    'nyc': 'new york', 'ny': 'new york',
    'la': 'los angeles',
    'bkk': 'bangkok',
    'sg': 'singapore',
    'hk': 'hong kong',
    'dc': 'washington dc',
  };
  const lower = city.toLowerCase().trim();
  return aliases[lower] || lower;
}

function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al.includes(bl) || bl.includes(al) || 
         levenshteinDistance(al, bl) <= Math.min(al.length, bl.length) * 0.3;
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export default {
  extractIntents,
  extractTimingSignals,
  buildWarmPaths,
  calculateFit,
  discoverConnections,
};
