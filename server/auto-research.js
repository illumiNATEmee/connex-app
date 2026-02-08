import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════
// AUTO-RESEARCH ENGINE
// 
// Given minimal user inputs, automatically research and populate
// their full profile using strategic search queries.
//
// Input → Search Strategy → Extract → Verify → Populate
// ═══════════════════════════════════════════════════════════

// Search using DuckDuckGo (more permissive)
async function searchDDG(query) {
  await new Promise(r => setTimeout(r, 2000)); // Rate limit
  
  try {
    // DuckDuckGo HTML endpoint
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (response.ok) {
      const html = await response.text();
      // Clean HTML to text
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    }
  } catch (e) {
    console.error(`DDG search error for "${query}":`, e.message);
  }
  return null;
}

// GitHub API (public, no auth needed for basic info)
async function searchGitHub(username) {
  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: { "User-Agent": "Connex-Research" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {}
  return null;
}

// Direct site fetches for better data
async function fetchSite(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (response.ok) {
      const html = await response.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  } catch (e) {
    console.log(`   Fetch error for ${url}: ${e.message}`);
  }
  return null;
}

// Search wrapper - tries multiple sources
async function searchWeb(query) {
  // Try DuckDuckGo first
  const ddgResult = await searchDDG(query);
  if (ddgResult && ddgResult.length > 500) {
    return ddgResult;
  }
  
  // Fallback to direct site fetch if query includes site:
  const siteMatch = query.match(/site:([^\s]+)/);
  if (siteMatch) {
    const domain = siteMatch[1];
    const searchTerm = query.replace(/site:[^\s]+/, '').trim().replace(/"/g, '');
    try {
      const response = await fetch(`https://${domain}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const html = await response.text();
        if (html.toLowerCase().includes(searchTerm.toLowerCase())) {
          return html.replace(/<[^>]+>/g, ' ').slice(0, 10000);
        }
      }
    } catch (e) {}
  }
  
  return ddgResult;
}

// Extract patterns from search results
function extractPatterns(text, patterns) {
  const results = {};
  
  for (const [key, regex] of Object.entries(patterns)) {
    const matches = text.match(regex);
    if (matches) {
      results[key] = [...new Set(matches)].slice(0, 5); // Dedupe, limit 5
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════
// SEARCH STRATEGIES
// Each strategy generates queries from user inputs
// ═══════════════════════════════════════════════════════════

const SEARCH_STRATEGIES = {
  // Find LinkedIn and professional info
  linkedin: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" site:linkedin.com`);
      queries.push(`"${inputs.name}" LinkedIn`);
    }
    if (inputs.name && inputs.company) {
      queries.push(`"${inputs.name}" "${inputs.company}" LinkedIn`);
    }
    if (inputs.name && inputs.city) {
      queries.push(`"${inputs.name}" "${inputs.city}" LinkedIn`);
    }
    return queries;
  },

  // Find work history
  work: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" work experience`);
      queries.push(`"${inputs.name}" company founder CEO`);
    }
    if (inputs.email) {
      const domain = inputs.email.split('@')[1];
      if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
        queries.push(`"${inputs.name}" site:${domain}`);
        queries.push(`"${inputs.name}" "${domain.split('.')[0]}"`);
      }
    }
    if (inputs.phone) {
      // Area code can hint at location/company
      const areaCode = inputs.phone.replace(/\D/g, '').slice(0, 3);
      queries.push(`"${inputs.name}" ${areaCode}`);
    }
    return queries;
  },

  // Find education
  education: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" university alumni`);
      queries.push(`"${inputs.name}" graduated school education`);
      queries.push(`"${inputs.name}" MBA Stanford Harvard Berkeley`);
    }
    if (inputs.name && inputs.city) {
      queries.push(`"${inputs.name}" "${inputs.city}" university`);
    }
    return queries;
  },

  // Find social profiles
  social: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" Twitter OR X.com`);
      queries.push(`"${inputs.name}" Instagram`);
      queries.push(`"${inputs.name}" GitHub`);
    }
    if (inputs.email) {
      const username = inputs.email.split('@')[0];
      queries.push(`"${username}" GitHub`);
      queries.push(`"${username}" Twitter`);
      // Email username often matches social handles
      queries.push(`"${username}" linkedin`);
    }
    return queries;
  },

  // Email-specific research
  email: (inputs) => {
    const queries = [];
    if (inputs.email) {
      const [username, domain] = inputs.email.split('@');
      // Search for exact email mentions
      queries.push(`"${inputs.email}"`);
      // Username across platforms
      queries.push(`${username} profile`);
      // If corporate email, search company
      if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domain)) {
        queries.push(`"${inputs.name}" "${domain}" team about`);
        queries.push(`site:${domain} "${inputs.name}"`);
      }
    }
    return queries;
  },

  // Find interests and affiliations
  interests: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" podcast interview`);
      queries.push(`"${inputs.name}" speaker conference`);
      queries.push(`"${inputs.name}" investor angel`);
      queries.push(`"${inputs.name}" founder startup`);
    }
    return queries;
  },

  // Cross-reference with data aggregators
  aggregators: (inputs) => {
    const queries = [];
    if (inputs.name) {
      queries.push(`"${inputs.name}" site:rocketreach.co`);
      queries.push(`"${inputs.name}" site:zoominfo.com`);
      queries.push(`"${inputs.name}" site:crunchbase.com`);
      queries.push(`"${inputs.name}" site:apollo.io`);
    }
    return queries;
  },

  // Company team pages
  companyTeam: (inputs) => {
    const queries = [];
    if (inputs.company) {
      const companySlug = inputs.company.toLowerCase().replace(/\s+/g, '');
      queries.push(`"${inputs.name}" site:${companySlug}.com`);
      queries.push(`"${inputs.company}" team about "${inputs.name}"`);
      queries.push(`"${inputs.company}" "${inputs.name}" linkedin`);
    }
    return queries;
  },

  // News and press
  news: (inputs) => {
    const queries = [];
    if (inputs.name && inputs.company) {
      queries.push(`"${inputs.name}" "${inputs.company}" news`);
      queries.push(`"${inputs.name}" "${inputs.company}" announcement`);
    }
    if (inputs.name) {
      queries.push(`"${inputs.name}" TechCrunch OR Forbes OR Bloomberg`);
    }
    return queries;
  },
};

// ═══════════════════════════════════════════════════════════
// EXTRACTION PATTERNS
// Regex patterns to find data in search results
// ═══════════════════════════════════════════════════════════

const EXTRACTION_PATTERNS = {
  // Companies - broader matching
  companies: /(?:at|@|works?\s*(?:at|for)?|employed\s*(?:at|by)?|joined|founded?|CEO\s*(?:of|at)?|working\s*(?:at|for))\s*([A-Z][A-Za-z0-9\s&\.\-]+?)(?:\s+as|\s+in|\s+since|\.|,|–|$)/gi,
  // Also catch "Company Name - Title" patterns
  companyTitle: /([A-Z][A-Za-z0-9\s&]+?)\s*[-–—]\s*(CEO|CTO|CFO|Founder|Director|VP|Manager|Engineer|Product)/gi,
  // Titles
  titles: /(?:as\s+(?:a\s+)?|title:?\s*|role:?\s*|position:?\s*|,\s*)((?:CEO|CTO|CFO|COO|CPO|VP|SVP|EVP|Director|Sr\.?\s*Director|Manager|Sr\.?\s*Manager|Engineer|Sr\.?\s*Engineer|Developer|Designer|Product\s*Manager|Product|Founder|Co-founder|Partner|Principal|Analyst|Consultant|Head\s+of)[A-Za-z\s\-,]*)/gi,
  // Schools - more variants
  schools: /((?:University|College|Institute|School|Academy)\s+(?:of\s+)?[A-Za-z\s]+|Stanford|Harvard|MIT|Berkeley|Yale|Princeton|Columbia|UCLA|USC|NYU|Wharton|INSEAD|Kellogg|Booth|Haas|Sloan|Carnegie\s*Mellon|Georgia\s*Tech|UT\s*Austin|Michigan|Duke|Cornell|Northwestern|Brown|Dartmouth|Penn|UPenn)/gi,
  degrees: /(MBA|PhD|Ph\.D|Masters?|Bachelors?|B\.S\.?|B\.A\.?|M\.S\.?|M\.A\.?|JD|MD|BS|BA|MS|MA)/gi,
  locations: /(?:based\s+in|located\s+in|lives?\s+in|from|in)\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\s+and\s+|$)/gi,
  linkedin: /linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/gi,
  twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi,
  github: /github\.com\/([a-zA-Z0-9\-_]+)/gi,
  emails: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  // Phone area codes for location hints
  phones: /\b(\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
};

// ═══════════════════════════════════════════════════════════
// MAIN RESEARCH FUNCTION
// ═══════════════════════════════════════════════════════════

export async function autoResearch(userId, userInputs) {
  console.log(`\n🔬 Auto-Research starting for user ${userId}`);
  console.log(`   Inputs: ${JSON.stringify(userInputs)}\n`);

  const findings = {
    companies: new Set(),
    titles: new Set(),
    schools: new Set(),
    degrees: new Set(),
    locations: new Set(),
    linkedin: new Set(),
    twitter: new Set(),
    github: new Set(),
    rawHits: [],
  };

  const searchLog = [];

  // Run each search strategy
  for (const [strategyName, strategyFn] of Object.entries(SEARCH_STRATEGIES)) {
    const queries = strategyFn(userInputs);
    console.log(`📌 Strategy: ${strategyName} (${queries.length} queries)`);

    for (const query of queries.slice(0, 3)) { // Limit queries per strategy
      console.log(`   🔍 "${query}"`);
      
      const results = await searchWeb(query);
      if (!results) continue;

      searchLog.push({ strategy: strategyName, query, resultLength: results.length });

      // Check if results are relevant (more lenient matching)
      const searchTerms = [
        userInputs.name,
        userInputs.name?.split(' ')[0], // First name
        userInputs.name?.split(' ').pop(), // Last name
        userInputs.company,
        userInputs.email?.split('@')[0], // Email username
      ].filter(Boolean).map(s => s.toLowerCase());

      const resultsLower = results.toLowerCase();
      const relevanceScore = searchTerms.filter(term => 
        resultsLower.includes(term)
      ).length;

      // Need at least 1 match, or if results are substantial, process anyway
      if (relevanceScore === 0 && results.length < 1000) {
        console.log(`   ⚠️ Low relevance (${relevanceScore}), skipping`);
        continue;
      }
      
      console.log(`   ✓ Relevance: ${relevanceScore}/${searchTerms.length}, processing ${results.length} chars`);

      // Extract patterns
      const extracted = extractPatterns(results, EXTRACTION_PATTERNS);
      
      for (const [key, values] of Object.entries(extracted)) {
        if (findings[key]) {
          values.forEach(v => {
            // Clean and add
            const cleaned = v.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
            if (cleaned.length > 2 && cleaned.length < 100) {
              findings[key].add(cleaned);
            }
          });
        }
      }

      // Store raw hits for context
      if (results.length > 100) {
        findings.rawHits.push({
          query,
          snippet: results.slice(0, 500),
        });
      }
    }
  }

  // Convert Sets to arrays
  const results = {};
  for (const [key, value] of Object.entries(findings)) {
    if (value instanceof Set) {
      results[key] = [...value];
    } else {
      results[key] = value;
    }
  }

  console.log(`\n📊 Research Results:`);
  console.log(`   Companies: ${results.companies?.length || 0}`);
  console.log(`   Titles: ${results.titles?.length || 0}`);
  console.log(`   Schools: ${results.schools?.length || 0}`);
  console.log(`   LinkedIn: ${results.linkedin?.length || 0}`);
  console.log(`   Twitter: ${results.twitter?.length || 0}`);
  console.log(`   GitHub: ${results.github?.length || 0}`);

  // Auto-populate profile
  await populateFromResearch(userId, results, userInputs);

  return {
    success: true,
    findings: results,
    searchLog,
    queriesRun: searchLog.length,
  };
}

// ═══════════════════════════════════════════════════════════
// AUTO-POPULATE FROM RESEARCH
// ═══════════════════════════════════════════════════════════

async function populateFromResearch(userId, findings, inputs) {
  console.log(`\n💾 Populating profile...`);

  // Add work history
  for (const company of findings.companies || []) {
    // Skip if it's clearly not a company
    if (company.length < 3 || /university|college|school/i.test(company)) continue;
    
    // Find matching title if any
    const title = findings.titles?.[0] || null;
    
    try {
      await supabase.from('work_history').upsert({
        user_id: userId,
        company: company.trim(),
        title: title,
        is_current: false, // Conservative
      }, { onConflict: 'user_id,company' });
      console.log(`   ✅ Added company: ${company}`);
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Add education
  for (const school of findings.schools || []) {
    const degree = findings.degrees?.[0] || null;
    
    try {
      await supabase.from('education').upsert({
        user_id: userId,
        institution: school.trim(),
        degree: degree,
        institution_type: 'university',
      }, { onConflict: 'user_id,institution' });
      console.log(`   ✅ Added school: ${school}`);
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Add social profiles
  for (const handle of findings.linkedin || []) {
    try {
      await supabase.from('social_profiles').upsert({
        user_id: userId,
        platform: 'linkedin',
        handle: handle,
        url: `https://linkedin.com/in/${handle}`,
      }, { onConflict: 'user_id,platform' });
      console.log(`   ✅ Added LinkedIn: ${handle}`);
    } catch (e) {}
  }

  for (const handle of findings.twitter || []) {
    try {
      await supabase.from('social_profiles').upsert({
        user_id: userId,
        platform: 'twitter',
        handle: handle,
      }, { onConflict: 'user_id,platform' });
      console.log(`   ✅ Added Twitter: @${handle}`);
    } catch (e) {}
  }

  for (const handle of findings.github || []) {
    try {
      await supabase.from('social_profiles').upsert({
        user_id: userId,
        platform: 'github',
        handle: handle,
      }, { onConflict: 'user_id,platform' });
      console.log(`   ✅ Added GitHub: ${handle}`);
    } catch (e) {}
  }

  // Update location if found
  if (findings.locations?.length > 0) {
    const location = findings.locations[0];
    try {
      await supabase.from('users').update({
        location_current: { city: location, source: 'research' },
      }).eq('id', userId);
      console.log(`   ✅ Updated location: ${location}`);
    } catch (e) {}
  }

  console.log(`\n✅ Population complete`);
}

// ═══════════════════════════════════════════════════════════
// QUICK RESEARCH (minimal inputs)
// ═══════════════════════════════════════════════════════════

export async function quickResearch(userId) {
  // Get existing user data to use as inputs
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    return { error: 'User not found' };
  }

  const inputs = {
    name: user.name_full,
    email: user.email,
    phone: user.phone,
    city: user.location_current?.city,
  };

  return autoResearch(userId, inputs);
}

export default { autoResearch, quickResearch };
