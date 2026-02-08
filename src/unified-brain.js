/**
 * UNIFIED BRAIN
 * The single entry point for all Connex intelligence
 * 
 * Combines:
 * - proactive-brain.js (opportunity detection, notifications)
 * - serendipity-engine.js (deep matching, non-obvious connections)
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                      USER CONTEXT                           │
 * │  Persistent profile: who you are, what you want, who knows  │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    NETWORK PROFILES                         │
 * │  Everyone we know about (from chats, imports, research)     │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     UNIFIED BRAIN                           │
 * │  1. Opportunity Detection (what's actionable now?)          │
 * │  2. Serendipity Matching (what's the real connection?)      │
 * │  3. Confidence Scoring (how reliable is this?)              │
 * │  4. Notification Generation (what should we tell the user?) │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    RECOMMENDATIONS                          │
 * │  Ranked, verified, ready-to-act connections                 │
 * └─────────────────────────────────────────────────────────────┘
 */

import {
  createUserContext,
  detectOpportunities,
  findCrossConnections,
  generateNotification,
  generateBatchNotification,
  learnFromConversation,
  OpportunityType,
  ConnectionType,
} from './proactive-brain.js';

import {
  createDeepProfile,
  findSerendipity,
  findMatchesFor,
  findAllSerendipity,
  calculateVerificationScore,
  getFieldConfidence,
  ConnectionDimension,
  DimensionStrength,
} from './serendipity-engine.js';

// ═══════════════════════════════════════════════════════════
// UNIFIED BRAIN CLASS
// ═══════════════════════════════════════════════════════════

export class UnifiedBrain {
  constructor(userContext = null) {
    this.userContext = userContext || createUserContext();
    this.profiles = new Map(); // id -> DeepProfile
    this.recommendations = [];
    this.lastScan = null;
  }

  // ─────────────────────────────────────────────────────────
  // USER CONTEXT MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /**
   * Set/update user context
   */
  setUserContext(context) {
    this.userContext = { ...this.userContext, ...context };
    return this.userContext;
  }

  /**
   * Learn from a conversation (auto-update context)
   */
  learn(message, source = 'chat') {
    const updates = learnFromConversation(this.userContext, message, source);
    
    // Apply updates
    for (const update of updates) {
      if (update.field.includes('.')) {
        // Nested field (e.g., 'location.current')
        const [parent, child] = update.field.split('.');
        if (!this.userContext[parent]) this.userContext[parent] = {};
        this.userContext[parent][child] = update.value;
      } else if (Array.isArray(this.userContext[update.field])) {
        // Array field — add if not exists
        if (!this.userContext[update.field].includes(update.value)) {
          this.userContext[update.field].push(update.value);
        }
      } else {
        this.userContext[update.field] = update.value;
      }
    }
    
    return updates;
  }

  /**
   * Export user context as JSON
   */
  exportContext() {
    return JSON.parse(JSON.stringify(this.userContext));
  }

  /**
   * Import user context from JSON
   */
  importContext(json) {
    this.userContext = typeof json === 'string' ? JSON.parse(json) : json;
    return this.userContext;
  }

  // ─────────────────────────────────────────────────────────
  // PROFILE MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /**
   * Add or update a profile
   */
  addProfile(profile) {
    const deepProfile = profile._meta ? profile : createDeepProfile(profile);
    const id = deepProfile.id || deepProfile.phone || deepProfile.name;
    this.profiles.set(id, deepProfile);
    return deepProfile;
  }

  /**
   * Add multiple profiles
   */
  addProfiles(profiles) {
    return profiles.map(p => this.addProfile(p));
  }

  /**
   * Get a profile by ID
   */
  getProfile(id) {
    return this.profiles.get(id);
  }

  /**
   * Get all profiles
   */
  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  /**
   * Convert basic profile to deep profile with enrichment
   */
  enrichProfile(basicProfile) {
    const deep = createDeepProfile({
      ...basicProfile,
      id: basicProfile.id || basicProfile.phone || `p_${Date.now()}`,
    });

    // Map basic fields to deep structure
    if (basicProfile.role) deep.current.role = basicProfile.role;
    if (basicProfile.company) deep.current.company = basicProfile.company;
    if (basicProfile.location?.current) deep.current.location = basicProfile.location.current;
    if (basicProfile.location?.primary) deep.current.location = basicProfile.location.primary;
    
    // Copy over timeline if present
    if (basicProfile.timeline) {
      deep.timeline = { ...deep.timeline, ...basicProfile.timeline };
    }
    
    // Copy over experiences if present (transformations, struggles, achievements)
    if (basicProfile.experiences) {
      deep.experiences = { ...deep.experiences, ...basicProfile.experiences };
    }
    
    // Copy over scenes if present
    if (basicProfile.scenes) {
      deep.scenes = { ...deep.scenes, ...basicProfile.scenes };
    }
    
    // Copy over values if present
    if (basicProfile.values) {
      deep.values = { ...deep.values, ...basicProfile.values };
    }
    
    // Handle interests - copy if already in deep format, otherwise convert
    if (basicProfile.interests) {
      if (basicProfile.interests.obsessions) {
        // Already in deep format
        deep.interests = { ...deep.interests, ...basicProfile.interests };
      } else if (Array.isArray(basicProfile.interests)) {
        // Convert array to obsessions
        deep.interests.obsessions = basicProfile.interests.map(i => ({
          topic: typeof i === 'string' ? i : i.category || i.topic,
          depth: 'interested',
        }));
      }
    }

    // Map affinities
    if (basicProfile.affinities) {
      if (basicProfile.affinities.sports?.length > 0) {
        deep.scenes.communities.push({
          type: 'sports',
          name: basicProfile.affinities.sports.join(', '),
        });
      }
      if (basicProfile.affinities.wellness?.length > 0 && !deep.values.practices?.length) {
        deep.values.practices = basicProfile.affinities.wellness.map(w => ({
          type: 'wellness',
          specifics: w,
        }));
      }
    }

    // Map lookingFor/offering
    if (basicProfile.lookingFor) deep.lookingFor = basicProfile.lookingFor;
    if (basicProfile.offering) deep.offering = basicProfile.offering;

    // Copy verification if present
    if (basicProfile.verification) {
      deep.verification = { ...deep.verification, ...basicProfile.verification };
    } else if (basicProfile.verified || basicProfile.linkedinVerified) {
      deep.verification.linkedinVerified = true;
      deep.verification.confidenceScore = 75;
    }

    return deep;
  }

  // ─────────────────────────────────────────────────────────
  // THE SCAN — Main Entry Point
  // ─────────────────────────────────────────────────────────

  /**
   * Scan profiles and generate recommendations
   * This is the main function that combines everything
   */
  scan(options = {}) {
    const {
      minConfidence = 40,
      maxResults = 20,
      includeOpportunities = true,
      includeSerendipity = true,
      includeCrossConnections = false,
    } = options;

    const profiles = this.getAllProfiles();
    const recommendations = [];

    // 1. OPPORTUNITY DETECTION (proactive-brain)
    // What actionable opportunities exist right now?
    if (includeOpportunities) {
      const opportunities = detectOpportunities(this.userContext, profiles, {
        minConfidence: minConfidence / 100,
        maxResults,
      });

      for (const opp of opportunities) {
        recommendations.push({
          type: 'opportunity',
          profile: opp.profile,
          score: opp.overallScore,
          primary: opp.primary,
          secondary: opp.secondary,
          action: opp.suggestedAction,
          intro: opp.introMessage,
          notification: generateNotification(opp),
        });
      }
    }

    // 2. SERENDIPITY MATCHING (serendipity-engine)
    // What non-obvious connections exist?
    if (includeSerendipity && this.userContext.name) {
      // Convert user context to a deep profile for matching
      const userDeepProfile = this.enrichProfile({
        name: this.userContext.name,
        role: this.userContext.role,
        company: this.userContext.company,
        location: this.userContext.location,
        interests: this.userContext.interests,
        affinities: this.userContext.affinities,
        lookingFor: this.userContext.lookingFor,
        offering: this.userContext.offering,
      });

      const deepProfiles = profiles.map(p => 
        p._meta ? p : this.enrichProfile(p)
      );

      const serendipityMatches = findMatchesFor(userDeepProfile, deepProfiles, {
        minScore: minConfidence,
        maxResults,
      });

      for (const match of serendipityMatches) {
        // Don't duplicate if already in opportunities
        const existing = recommendations.find(r => 
          r.profile?.name === match.profileB.name
        );

        if (existing) {
          // Merge serendipity info into existing recommendation
          existing.serendipity = match;
          existing.score = Math.max(existing.score, match.serendipityScore);
          existing.bestHook = match.bestHook?.hookLine;
        } else {
          recommendations.push({
            type: 'serendipity',
            profile: match.profileB,
            score: match.serendipityScore,
            connections: match.connections,
            bestHook: match.bestHook?.hookLine,
            hookSummary: match.hookSummary,
            intro: match.introMessage,
            verification: match.verificationB,
            confidenceScore: match.confidenceScore,
          });
        }
      }
    }

    // 3. CROSS-CONNECTIONS (who should meet who)
    // This is for group facilitation, not personal matching
    if (includeCrossConnections) {
      const crossConnections = findCrossConnections(profiles, {
        minScore: minConfidence,
        maxResults,
      });

      for (const conn of crossConnections) {
        recommendations.push({
          type: 'cross_connection',
          profileA: conn.personA,
          profileB: conn.personB,
          score: conn.score,
          reasons: conn.reasons,
          whyConnect: conn.whyConnect,
          intro: conn.introMessage,
        });
      }
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    // Dedupe (same person appearing multiple times)
    const seen = new Set();
    const deduped = recommendations.filter(r => {
      const key = r.type === 'cross_connection' 
        ? `${r.profileA?.name}-${r.profileB?.name}`
        : r.profile?.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    this.recommendations = deduped.slice(0, maxResults);
    this.lastScan = new Date().toISOString();

    return {
      recommendations: this.recommendations,
      summary: this.generateSummary(),
      scannedAt: this.lastScan,
      profileCount: profiles.length,
    };
  }

  // ─────────────────────────────────────────────────────────
  // OUTPUT GENERATION
  // ─────────────────────────────────────────────────────────

  /**
   * Generate a natural language summary
   */
  generateSummary() {
    if (this.recommendations.length === 0) {
      return "No strong matches found based on your profile.";
    }

    const byType = {
      opportunity: this.recommendations.filter(r => r.type === 'opportunity'),
      serendipity: this.recommendations.filter(r => r.type === 'serendipity'),
      cross_connection: this.recommendations.filter(r => r.type === 'cross_connection'),
    };

    let summary = `🧠 Scanned ${this.getAllProfiles().length} profiles.\n\n`;

    // Top matches
    const top = this.recommendations.slice(0, 5);
    summary += `**Top ${top.length} Connections:**\n\n`;

    top.forEach((rec, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
      const name = rec.profile?.name || `${rec.profileA?.name} ↔ ${rec.profileB?.name}`;
      const score = rec.score;
      
      let hook = '';
      if (rec.type === 'opportunity') {
        hook = rec.primary?.reason || '';
      } else if (rec.type === 'serendipity') {
        hook = rec.bestHook || rec.hookSummary || '';
      } else {
        hook = rec.reasons?.[0] || '';
      }

      summary += `${emoji} **${name}** (${score}%)\n`;
      summary += `   ${hook}\n\n`;
    });

    if (this.recommendations.length > 5) {
      summary += `\n...and ${this.recommendations.length - 5} more.`;
    }

    return summary;
  }

  /**
   * Get notification for top recommendation
   */
  getTopNotification() {
    if (this.recommendations.length === 0) return null;
    const top = this.recommendations[0];
    return top.notification || this.generateSingleNotification(top);
  }

  /**
   * Generate a notification for a single recommendation
   */
  generateSingleNotification(rec) {
    const name = rec.profile?.name || `${rec.profileA?.name} ↔ ${rec.profileB?.name}`;
    
    switch (rec.type) {
      case 'opportunity':
        return rec.notification;
      
      case 'serendipity':
        return `✨ **${name}** — ${rec.bestHook || 'worth connecting with'}`;
      
      case 'cross_connection':
        return `🔗 **${rec.profileA?.name}** should meet **${rec.profileB?.name}** — ${rec.reasons?.[0]}`;
      
      default:
        return `👋 Consider connecting with **${name}**`;
    }
  }

  /**
   * Get intro message for a specific recommendation
   */
  getIntro(profileName) {
    const rec = this.recommendations.find(r => 
      r.profile?.name === profileName ||
      r.profileA?.name === profileName ||
      r.profileB?.name === profileName
    );
    return rec?.intro || null;
  }

  // ─────────────────────────────────────────────────────────
  // RESEARCH QUEUE MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /**
   * Get profiles that need more research
   */
  getResearchQueue() {
    return this.getAllProfiles()
      .map(p => ({
        profile: p,
        verification: calculateVerificationScore(p),
        fields: getFieldConfidence(p),
      }))
      .filter(item => item.verification.score < 75)
      .sort((a, b) => a.verification.score - b.verification.score);
  }

  /**
   * Get specific research actions needed for a profile
   */
  getResearchActions(profileId) {
    const profile = this.getProfile(profileId);
    if (!profile) return null;

    const verification = calculateVerificationScore(profile);
    const fields = getFieldConfidence(profile);

    return {
      profile: profile.name,
      overallConfidence: verification.score,
      level: verification.level,
      completed: verification.checks,
      needed: verification.gaps,
      fields,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// STANDALONE FUNCTIONS (for API/CLI use)
// ═══════════════════════════════════════════════════════════

/**
 * Quick scan: given user context + profiles, return recommendations
 * No state management, pure function
 */
export function quickScan(userContext, profiles, options = {}) {
  const brain = new UnifiedBrain(userContext);
  brain.addProfiles(profiles);
  return brain.scan(options);
}

/**
 * Score a single pair (you + one person)
 */
export function scoreMatch(userContext, profile) {
  const brain = new UnifiedBrain(userContext);
  const userDeep = brain.enrichProfile({
    name: userContext.name,
    role: userContext.role,
    company: userContext.company,
    location: userContext.location,
    interests: userContext.interests,
    affinities: userContext.affinities,
    lookingFor: userContext.lookingFor,
    offering: userContext.offering,
  });
  const profileDeep = brain.enrichProfile(profile);
  
  return findSerendipity(userDeep, profileDeep);
}

/**
 * Find who should meet who in a group
 */
export function findGroupConnections(profiles, options = {}) {
  return findCrossConnections(profiles, options);
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export {
  // Re-export from proactive-brain
  createUserContext,
  OpportunityType,
  ConnectionType,
  learnFromConversation,
  
  // Re-export from serendipity-engine
  createDeepProfile,
  ConnectionDimension,
  DimensionStrength,
  calculateVerificationScore,
  getFieldConfidence,
};

export default UnifiedBrain;
