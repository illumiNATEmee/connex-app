/**
 * NETWORK CONTEXT
 * 
 * Use group/network membership as identity signal
 * "FF" = Founders Forum
 * "SG" = Singapore
 * "HK" = Hong Kong
 * 
 * If we know the network, we can narrow down identity significantly
 */

// ═══════════════════════════════════════════════════════════
// KNOWN NETWORKS
// ═══════════════════════════════════════════════════════════

export const KNOWN_NETWORKS = {
  'FF': {
    name: 'Chinese American Fraternity',
    description: 'Fraternity for Chinese Americans who attended US universities. Founded 1910.',
    type: 'fraternity',
    typical_members: ['Chinese American professionals', 'US university alumni'],
    bond_type: 'personal', // vs 'professional'
    note: 'Could be Pi Alpha Phi or similar. Members call each other "Bro".',
  },
  'YC': {
    name: 'Y Combinator',
    description: 'Startup accelerator alumni network',
    website: 'ycombinator.com',
    typical_members: ['Startup Founders', 'Tech Entrepreneurs'],
  },
  'EO': {
    name: 'Entrepreneurs Organization',
    description: 'Global network of entrepreneurs',
    website: 'eonetwork.org',
    typical_members: ['Business Owners', 'Entrepreneurs'],
  },
  'LEAD': {
    name: 'Stanford LEAD',
    description: 'Stanford executive education alumni',
    website: 'stanford.edu',
    typical_members: ['Executives', 'Business Leaders'],
  },
};

// ═══════════════════════════════════════════════════════════
// LOCATION SUFFIXES
// ═══════════════════════════════════════════════════════════

export const LOCATION_SUFFIXES = {
  'SG': { country: 'Singapore', city: 'Singapore' },
  'HK': { country: 'Hong Kong', city: 'Hong Kong' },
  'SF': { country: 'USA', city: 'San Francisco', region: 'Bay Area' },
  'NYC': { country: 'USA', city: 'New York' },
  'LA': { country: 'USA', city: 'Los Angeles' },
  'LDN': { country: 'UK', city: 'London' },
  'TW': { country: 'Taiwan', city: 'Taipei' },
  'JP': { country: 'Japan', city: 'Tokyo' },
  'BKK': { country: 'Thailand', city: 'Bangkok' },
  'KL': { country: 'Malaysia', city: 'Kuala Lumpur' },
};

// ═══════════════════════════════════════════════════════════
// PARSE NAME FOR SIGNALS
// ═══════════════════════════════════════════════════════════

export function parseNameSignals(displayName) {
  const signals = {
    baseName: displayName,
    cleanName: displayName,
    network: null,
    location: null,
    locationDetail: null,
  };
  
  // Remove ~ prefix (WhatsApp format)
  let name = displayName.replace(/^~\s*/, '');
  
  // Check for location in parentheses: "Eugene Lee (HK)"
  const parenMatch = name.match(/^(.+?)\s*\(([A-Z]{2,3})\)$/);
  if (parenMatch) {
    name = parenMatch[1].trim();
    const locCode = parenMatch[2];
    if (LOCATION_SUFFIXES[locCode]) {
      signals.location = locCode;
      signals.locationDetail = LOCATION_SUFFIXES[locCode];
    }
  }
  
  // Check for network/location suffix: "Jonathan Low FF" or "Patrick Wong SG"
  const suffixMatch = name.match(/^(.+?)\s+([A-Z]{2,3})$/);
  if (suffixMatch) {
    const suffix = suffixMatch[2];
    
    // Is it a network?
    if (KNOWN_NETWORKS[suffix]) {
      signals.network = suffix;
      signals.networkDetail = KNOWN_NETWORKS[suffix];
      name = suffixMatch[1].trim();
    }
    // Is it a location?
    else if (LOCATION_SUFFIXES[suffix]) {
      signals.location = suffix;
      signals.locationDetail = LOCATION_SUFFIXES[suffix];
      name = suffixMatch[1].trim();
    }
  }
  
  signals.cleanName = name;
  
  return signals;
}

// ═══════════════════════════════════════════════════════════
// GENERATE SEARCH QUERIES USING NETWORK CONTEXT
// ═══════════════════════════════════════════════════════════

export function generateContextualSearchQueries(nameSignals, additionalContext = {}) {
  const queries = [];
  const name = nameSignals.cleanName;
  
  // Base query
  queries.push({
    type: 'base',
    query: `"${name}" LinkedIn`,
    priority: 1,
  });
  
  // Network-specific query
  if (nameSignals.networkDetail) {
    queries.push({
      type: 'network',
      query: `"${name}" "${nameSignals.networkDetail.name}" founder investor`,
      priority: 2,
    });
    
    // Search LinkedIn for network connections
    if (nameSignals.networkDetail.linkedin_company) {
      queries.push({
        type: 'linkedin_network',
        query: `site:linkedin.com "${name}" "${nameSignals.networkDetail.name}"`,
        priority: 2,
      });
    }
  }
  
  // Location-specific query
  if (nameSignals.locationDetail) {
    queries.push({
      type: 'location',
      query: `"${name}" ${nameSignals.locationDetail.city} entrepreneur founder tech`,
      priority: 2,
    });
  }
  
  // Additional context
  if (additionalContext.interests?.length > 0) {
    queries.push({
      type: 'interests',
      query: `"${name}" ${additionalContext.interests.slice(0, 3).join(' ')}`,
      priority: 3,
    });
  }
  
  if (additionalContext.hiring) {
    queries.push({
      type: 'hiring',
      query: `"${name}" ${additionalContext.hiring} hiring OR job`,
      priority: 3,
    });
  }
  
  return queries.sort((a, b) => a.priority - b.priority);
}

// ═══════════════════════════════════════════════════════════
// EXTRACT ALL SIGNALS FROM CHAT MEMBERS
// ═══════════════════════════════════════════════════════════

export function analyzeGroupContext(members) {
  const analysis = {
    likely_network: null,
    network_confidence: 0,
    location_distribution: {},
    member_signals: [],
  };
  
  // Count network and location occurrences
  const networkCounts = {};
  const locationCounts = {};
  
  for (const member of members) {
    const signals = parseNameSignals(member.name || member.display_name || member);
    analysis.member_signals.push({
      original: member.name || member.display_name || member,
      ...signals,
    });
    
    if (signals.network) {
      networkCounts[signals.network] = (networkCounts[signals.network] || 0) + 1;
    }
    if (signals.location) {
      locationCounts[signals.location] = (locationCounts[signals.location] || 0) + 1;
    }
  }
  
  // Determine likely network
  const topNetwork = Object.entries(networkCounts).sort((a, b) => b[1] - a[1])[0];
  if (topNetwork && topNetwork[1] >= 2) {
    analysis.likely_network = topNetwork[0];
    analysis.network_detail = KNOWN_NETWORKS[topNetwork[0]];
    analysis.network_confidence = topNetwork[1] / members.length;
  }
  
  // Location distribution
  analysis.location_distribution = locationCounts;
  
  return analysis;
}

export default {
  KNOWN_NETWORKS,
  LOCATION_SUFFIXES,
  parseNameSignals,
  generateContextualSearchQueries,
  analyzeGroupContext,
};
