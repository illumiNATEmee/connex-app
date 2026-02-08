/**
 * WEB RESEARCH
 * 
 * Research people using web search (no LLM API needed)
 * Collects raw data that can be processed later
 */

import fs from 'fs';
import path from 'path';

// Get Brave API key
function getBraveKey() {
  try {
    const envPath = path.join(process.env.HOME, '.clawdbot/.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    return envContent.match(/BRAVE_API_KEY=([^\n]+)/)?.[1];
  } catch (e) {
    return process.env.BRAVE_API_KEY;
  }
}

// ═══════════════════════════════════════════════════════════
// WEB SEARCH
// ═══════════════════════════════════════════════════════════

export async function searchWeb(query, count = 5) {
  const apiKey = getBraveKey();
  
  if (!apiKey) {
    return { results: [], error: 'No Brave API key configured' };
  }
  
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      { headers: { 'X-Subscription-Token': apiKey } }
    );
    
    if (!response.ok) {
      return { results: [], error: `Search failed: ${response.status}` };
    }
    
    const data = await response.json();
    return {
      results: (data.web?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }))
    };
  } catch (e) {
    return { results: [], error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// RESEARCH A PERSON
// Multiple targeted searches to build context
// ═══════════════════════════════════════════════════════════

export async function researchPerson(name, hints = {}) {
  console.log(`\n🔍 WEB RESEARCH: ${name}`);
  
  const results = {
    name,
    hints,
    searches: {},
    raw_data: [],
    timestamp: new Date().toISOString(),
  };
  
  // Build search queries
  const queries = [];
  
  // Base query
  const baseQuery = hints.company 
    ? `"${name}" ${hints.company}`
    : hints.city 
    ? `"${name}" ${hints.city}`
    : `"${name}"`;
  
  // Professional
  queries.push({
    type: 'linkedin',
    query: `${name} LinkedIn ${hints.company || hints.city || ''}`.trim()
  });
  
  // Twitter/X
  queries.push({
    type: 'twitter',
    query: `${name} Twitter OR X site:twitter.com OR site:x.com ${hints.context || ''}`.trim()
  });
  
  // News/mentions
  queries.push({
    type: 'news',
    query: `"${name}" ${hints.company || ''} startup OR founder OR CEO OR investor`.trim()
  });
  
  // Company info
  if (hints.company) {
    queries.push({
      type: 'company',
      query: `${hints.company} company funding CEO`
    });
  }
  
  // Run searches
  for (const q of queries) {
    console.log(`   Searching: ${q.type}`);
    const search = await searchWeb(q.query, 3);
    results.searches[q.type] = search.results;
    results.raw_data.push(...search.results);
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Extract key info from results
  results.extracted = extractKeyInfo(results.raw_data, name);
  
  console.log(`   ✓ Found ${results.raw_data.length} results`);
  
  return results;
}

// ═══════════════════════════════════════════════════════════
// EXTRACT KEY INFO
// Parse search results to find useful data
// ═══════════════════════════════════════════════════════════

function extractKeyInfo(searchResults, name) {
  const info = {
    possible_roles: [],
    possible_companies: [],
    mentions: [],
    linkedin_url: null,
    twitter_handle: null,
  };
  
  for (const result of searchResults) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    const url = result.url.toLowerCase();
    
    // LinkedIn
    if (url.includes('linkedin.com/in/')) {
      info.linkedin_url = result.url;
    }
    
    // Twitter
    if (url.includes('twitter.com/') || url.includes('x.com/')) {
      const match = result.url.match(/(?:twitter|x)\.com\/([^\/\?]+)/);
      if (match && match[1] !== 'search' && match[1] !== 'hashtag') {
        info.twitter_handle = match[1];
      }
    }
    
    // Roles
    const rolePatterns = [
      /\b(ceo|cto|cfo|coo|founder|co-founder|cofounder)\b/gi,
      /\b(partner|director|vp|vice president|head of)\b/gi,
      /\b(investor|venture|vc|angel)\b/gi,
    ];
    
    for (const pattern of rolePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        info.possible_roles.push(...matches.map(m => m.toLowerCase()));
      }
    }
    
    // Add to mentions
    if (result.description && result.description.length > 50) {
      info.mentions.push({
        source: result.url,
        snippet: result.description.slice(0, 200),
      });
    }
  }
  
  // Dedupe
  info.possible_roles = [...new Set(info.possible_roles)];
  
  return info;
}

// ═══════════════════════════════════════════════════════════
// COMPARE TWO PEOPLE
// Find potential connections from search results
// ═══════════════════════════════════════════════════════════

export function findConnections(researchA, researchB) {
  const connections = [];
  
  // Check for shared companies
  const companiesA = new Set(
    researchA.raw_data
      .flatMap(r => r.description?.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [])
  );
  const companiesB = new Set(
    researchB.raw_data
      .flatMap(r => r.description?.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [])
  );
  
  const sharedCompanies = [...companiesA].filter(c => companiesB.has(c));
  if (sharedCompanies.length > 0) {
    connections.push({
      type: 'shared_context',
      detail: `Both mentioned with: ${sharedCompanies.slice(0, 3).join(', ')}`,
    });
  }
  
  // Check for similar roles
  const rolesA = researchA.extracted?.possible_roles || [];
  const rolesB = researchB.extracted?.possible_roles || [];
  const sharedRoles = rolesA.filter(r => rolesB.includes(r));
  
  if (sharedRoles.length > 0) {
    connections.push({
      type: 'similar_roles',
      detail: `Both are: ${sharedRoles.join(', ')}`,
    });
  }
  
  return connections;
}

export default {
  searchWeb,
  researchPerson,
  findConnections,
};
