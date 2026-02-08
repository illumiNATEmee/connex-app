import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { supabase } from './supabase.js';
import * as enrichment from './enrichment.js';

// ═══════════════════════════════════════════════════════════
// RECURSIVE RESEARCH LOOP
// 
// The Loop:
// 1. DISCOVER — Find leads (social profiles, connections, signals)
// 2. RESEARCH — Deep dive on each lead
// 3. POPULATE — Add verified data to profile
// 4. VERIFY — Cross-reference multiple sources
// 5. GENERATE — Identify new leads from what we learned
// 6. REPEAT — Until confidence threshold reached
// ═══════════════════════════════════════════════════════════

// Use the same auth loading as the main server
function getAnthropicToken() {
  const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    // Try all available tokens
    const profiles = ['anthropic:default', 'anthropic:claude-cli'];
    for (const name of profiles) {
      const profile = auth.profiles[name];
      if (profile?.token && !profile.token.includes('Symbol')) {
        return profile.token;
      }
      if (profile?.access) {
        return profile.access;
      }
    }
    return null;
  } catch (err) {
    console.error('Auth load error:', err.message);
    return null;
  }
}

function getClient() {
  const token = getAnthropicToken();
  if (!token) throw new Error('No Anthropic token available - run: claude auth login');
  return new Anthropic({ apiKey: token });
}

async function searchWeb(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const html = await response.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 15000);
    }
  } catch (e) {
    console.error('Search error:', e.message);
  }
  return '';
}

// ═══════════════════════════════════════════════════════════
// RESEARCH STATE TRACKER
// ═══════════════════════════════════════════════════════════

class ResearchState {
  constructor(userId) {
    this.userId = userId;
    this.leads = [];           // Things to research
    this.researched = new Set(); // Already looked at
    this.findings = [];        // Verified data
    this.conflicts = [];       // Conflicting info to resolve
    this.confidence = {};      // Per-field confidence scores
    this.iterations = 0;
    this.maxIterations = 5;
    this.log = [];
  }

  addLead(lead) {
    const key = `${lead.type}:${lead.value}`;
    if (!this.researched.has(key)) {
      this.leads.push(lead);
    }
  }

  markResearched(lead) {
    const key = `${lead.type}:${lead.value}`;
    this.researched.add(key);
  }

  addFinding(finding) {
    // Check for conflicts
    const existing = this.findings.find(f => 
      f.field === finding.field && f.value !== finding.value
    );
    
    if (existing) {
      this.conflicts.push({
        field: finding.field,
        values: [existing.value, finding.value],
        sources: [existing.source, finding.source],
      });
    } else {
      this.findings.push(finding);
      // Update confidence
      this.confidence[finding.field] = Math.min(1, 
        (this.confidence[finding.field] || 0) + (finding.confidence * 0.3)
      );
    }
  }

  getNextLead() {
    // Prioritize by type
    const priority = ['linkedin', 'company', 'school', 'twitter', 'name_search', 'email_domain'];
    for (const type of priority) {
      const lead = this.leads.find(l => l.type === type);
      if (lead) {
        this.leads = this.leads.filter(l => l !== lead);
        return lead;
      }
    }
    return this.leads.shift();
  }

  shouldContinue() {
    // Stop conditions
    if (this.iterations >= this.maxIterations) return false;
    if (this.leads.length === 0) return false;
    
    // Check if we have enough confidence
    const avgConfidence = Object.values(this.confidence).reduce((a, b) => a + b, 0) / 
      Math.max(Object.keys(this.confidence).length, 1);
    if (avgConfidence > 0.85 && this.iterations > 2) return false;
    
    return true;
  }

  logAction(action, details) {
    this.log.push({
      iteration: this.iterations,
      timestamp: new Date().toISOString(),
      action,
      details,
    });
    console.log(`  [${this.iterations}] ${action}: ${JSON.stringify(details).slice(0, 100)}`);
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 1: DISCOVER — Find initial leads
// ═══════════════════════════════════════════════════════════

async function discoverLeads(state, profile) {
  state.logAction('DISCOVER', { phase: 'start' });
  
  // From existing social profiles
  const { data: socials } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('user_id', state.userId);
  
  for (const social of socials || []) {
    if (!social.is_connected && (social.url || social.handle)) {
      state.addLead({
        type: social.platform,
        value: social.url || social.handle,
        priority: 1,
      });
    }
  }
  
  // From name + email
  if (profile.name_full) {
    state.addLead({
      type: 'name_search',
      value: profile.name_full,
      email: profile.email,
      priority: 2,
    });
  }
  
  // From email domain (company hint)
  if (profile.email && !profile.email.includes('gmail') && !profile.email.includes('yahoo')) {
    const domain = profile.email.split('@')[1];
    state.addLead({
      type: 'email_domain',
      value: domain,
      priority: 3,
    });
  }
  
  // From existing work history
  const { data: work } = await supabase
    .from('work_history')
    .select('company')
    .eq('user_id', state.userId);
  
  for (const w of work || []) {
    if (w.company) {
      state.addLead({
        type: 'company',
        value: w.company,
        priority: 2,
      });
    }
  }
  
  // From education
  const { data: edu } = await supabase
    .from('education')
    .select('institution')
    .eq('user_id', state.userId);
  
  for (const e of edu || []) {
    if (e.institution) {
      state.addLead({
        type: 'school',
        value: e.institution,
        priority: 3,
      });
    }
  }
  
  state.logAction('DISCOVER', { leads_found: state.leads.length });
}

// ═══════════════════════════════════════════════════════════
// STEP 2: RESEARCH — Deep dive on a lead
// ═══════════════════════════════════════════════════════════

async function researchLead(state, lead, profile) {
  state.logAction('RESEARCH', { type: lead.type, value: lead.value });
  state.markResearched(lead);
  
  let searchResults = '';
  let findings = [];
  
  switch (lead.type) {
    case 'linkedin':
      const linkedinResult = await enrichment.enrichFromLinkedIn(state.userId, lead.value);
      if (linkedinResult.success) {
        findings = extractFindingsFromLinkedIn(linkedinResult.data);
      }
      break;
      
    case 'twitter':
      const twitterResult = await enrichment.enrichFromTwitter(state.userId, lead.value);
      if (twitterResult.success) {
        findings = extractFindingsFromTwitter(twitterResult.data);
      }
      break;
      
    case 'github':
      const githubResult = await enrichment.enrichFromGitHub(state.userId, lead.value);
      if (githubResult.success) {
        findings = extractFindingsFromGitHub(githubResult.data);
      }
      break;
      
    case 'name_search':
      searchResults = await searchWeb(`"${lead.value}" ${lead.email?.split('@')[0] || ''}`);
      findings = await analyzeSearchResults(searchResults, profile, 'name_search');
      break;
      
    case 'company':
      searchResults = await searchWeb(`"${profile.name_full}" "${lead.value}"`);
      findings = await analyzeSearchResults(searchResults, profile, 'company_verification');
      break;
      
    case 'school':
      searchResults = await searchWeb(`"${profile.name_full}" "${lead.value}" alumni`);
      findings = await analyzeSearchResults(searchResults, profile, 'education_verification');
      break;
      
    case 'email_domain':
      searchResults = await searchWeb(`site:${lead.value} "${profile.name_full}"`);
      findings = await analyzeSearchResults(searchResults, profile, 'company_from_email');
      break;
  }
  
  // Add findings to state
  for (const finding of findings) {
    state.addFinding(finding);
  }
  
  state.logAction('RESEARCH', { findings_count: findings.length });
  return findings;
}

function extractFindingsFromLinkedIn(data) {
  const findings = [];
  
  if (data.current_role?.company) {
    findings.push({
      field: 'current_company',
      value: data.current_role.company,
      source: 'linkedin',
      confidence: 0.9,
    });
  }
  if (data.current_role?.title) {
    findings.push({
      field: 'current_title',
      value: data.current_role.title,
      source: 'linkedin',
      confidence: 0.9,
    });
  }
  if (data.location?.city) {
    findings.push({
      field: 'location',
      value: data.location.city,
      source: 'linkedin',
      confidence: 0.7,
    });
  }
  for (const edu of data.education || []) {
    findings.push({
      field: 'education',
      value: edu,
      source: 'linkedin',
      confidence: 0.85,
    });
  }
  for (const skill of data.skills?.slice(0, 5) || []) {
    findings.push({
      field: 'skill',
      value: skill,
      source: 'linkedin',
      confidence: 0.8,
    });
  }
  
  return findings;
}

function extractFindingsFromTwitter(data) {
  const findings = [];
  
  if (data.location) {
    findings.push({
      field: 'location_hint',
      value: data.location,
      source: 'twitter',
      confidence: 0.5,
    });
  }
  for (const interest of data.interests || []) {
    findings.push({
      field: 'interest',
      value: interest,
      source: 'twitter',
      confidence: 0.7,
    });
  }
  
  return findings;
}

function extractFindingsFromGitHub(data) {
  const findings = [];
  
  if (data.company) {
    findings.push({
      field: 'company_hint',
      value: data.company,
      source: 'github',
      confidence: 0.6,
    });
  }
  if (data.location) {
    findings.push({
      field: 'location_hint',
      value: data.location,
      source: 'github',
      confidence: 0.5,
    });
  }
  for (const lang of data.top_languages || []) {
    findings.push({
      field: 'tech_skill',
      value: lang,
      source: 'github',
      confidence: 0.9,
    });
  }
  
  return findings;
}

async function analyzeSearchResults(searchText, profile, context) {
  if (!searchText) return [];
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are extracting verified facts about a person from search results.
    
Context: ${context}
Person: ${profile.name_full}

Extract ONLY facts you can verify from the search text. Return JSON array:
[
  {"field": "work_history|education|skill|location|interest|social_profile|achievement", 
   "value": "the fact", 
   "confidence": 0.0-1.0,
   "evidence": "brief quote or reason"}
]

Be conservative. Only include facts clearly about THIS person, not someone with a similar name.
If results seem to be about different people, return empty array.`,
    messages: [{
      role: 'user',
      content: searchText.slice(0, 12000)
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  
  if (jsonMatch) {
    try {
      const findings = JSON.parse(jsonMatch[0]);
      return findings.map(f => ({
        ...f,
        source: context,
      }));
    } catch (e) {
      return [];
    }
  }
  
  return [];
}

// ═══════════════════════════════════════════════════════════
// STEP 3: POPULATE — Add verified data to profile
// ═══════════════════════════════════════════════════════════

async function populateFromFindings(state) {
  state.logAction('POPULATE', { findings: state.findings.length });
  
  for (const finding of state.findings) {
    if (finding.confidence < 0.5) continue; // Skip low confidence
    
    try {
      switch (finding.field) {
        case 'current_company':
        case 'company_hint':
          await supabase.from('work_history').upsert({
            user_id: state.userId,
            company: finding.value,
            is_current: finding.field === 'current_company',
          }, { onConflict: 'user_id,company' });
          break;
          
        case 'current_title':
          await supabase.from('work_history')
            .update({ title: finding.value })
            .eq('user_id', state.userId)
            .eq('is_current', true);
          break;
          
        case 'education':
          if (typeof finding.value === 'object') {
            await supabase.from('education').upsert({
              user_id: state.userId,
              institution: finding.value.institution,
              degree: finding.value.degree,
              field_of_study: finding.value.field,
            }, { onConflict: 'user_id,institution' });
          }
          break;
          
        case 'skill':
        case 'tech_skill':
          await supabase.from('interests').upsert({
            user_id: state.userId,
            category: finding.field === 'tech_skill' ? 'tech' : 'skill',
            name: finding.value,
            intensity: 'enthusiast',
            details: { source: finding.source, confidence: finding.confidence },
          }, { onConflict: 'user_id,category,name' });
          break;
          
        case 'interest':
          await supabase.from('interests').upsert({
            user_id: state.userId,
            category: 'discovered',
            name: finding.value,
            intensity: 'follow',
            details: { source: finding.source, confidence: finding.confidence },
          }, { onConflict: 'user_id,category,name' });
          break;
          
        case 'social_profile':
          if (finding.value.platform && finding.value.handle) {
            await supabase.from('social_profiles').upsert({
              user_id: state.userId,
              platform: finding.value.platform,
              handle: finding.value.handle,
              url: finding.value.url,
            }, { onConflict: 'user_id,platform' });
            
            // Add as new lead
            state.addLead({
              type: finding.value.platform,
              value: finding.value.url || finding.value.handle,
              priority: 1,
            });
          }
          break;
      }
    } catch (e) {
      state.logAction('POPULATE_ERROR', { field: finding.field, error: e.message });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 4: VERIFY — Cross-reference and resolve conflicts
// ═══════════════════════════════════════════════════════════

async function verifyAndResolve(state) {
  if (state.conflicts.length === 0) return;
  
  state.logAction('VERIFY', { conflicts: state.conflicts.length });
  
  const client = getClient();
  
  for (const conflict of state.conflicts) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You resolve conflicting information about a person.
Given two different values for the same field from different sources, determine which is more likely correct.

Return JSON: {"winner": 0 or 1, "confidence": 0.0-1.0, "reason": "why"}`,
      messages: [{
        role: 'user',
        content: `Field: ${conflict.field}
Value 1 (from ${conflict.sources[0]}): ${JSON.stringify(conflict.values[0])}
Value 2 (from ${conflict.sources[1]}): ${JSON.stringify(conflict.values[1])}`
      }]
    });
    
    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const resolution = JSON.parse(jsonMatch[0]);
        const winningValue = conflict.values[resolution.winner];
        
        // Update the finding with resolved value
        const existingIdx = state.findings.findIndex(f => f.field === conflict.field);
        if (existingIdx >= 0) {
          state.findings[existingIdx].value = winningValue;
          state.findings[existingIdx].confidence = resolution.confidence;
          state.findings[existingIdx].resolved = true;
        }
        
        state.logAction('RESOLVED', { field: conflict.field, winner: winningValue });
      } catch (e) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 5: GENERATE — Find new leads from what we learned
// ═══════════════════════════════════════════════════════════

async function generateNewLeads(state) {
  state.logAction('GENERATE', { phase: 'analyzing_findings' });
  
  // From discovered companies — search for more info
  const companies = state.findings
    .filter(f => f.field.includes('company'))
    .map(f => f.value);
  
  for (const company of companies) {
    if (!state.researched.has(`company:${company}`)) {
      state.addLead({
        type: 'company',
        value: company,
        priority: 2,
      });
    }
  }
  
  // From discovered social profiles
  const socials = state.findings.filter(f => f.field === 'social_profile');
  for (const s of socials) {
    if (s.value?.platform && !state.researched.has(`${s.value.platform}:${s.value.handle}`)) {
      state.addLead({
        type: s.value.platform,
        value: s.value.url || s.value.handle,
        priority: 1,
      });
    }
  }
  
  state.logAction('GENERATE', { new_leads: state.leads.length });
}

// ═══════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════

export async function runResearchLoop(userId, options = {}) {
  console.log(`\n🔬 Starting Research Loop for user ${userId}\n`);
  
  const state = new ResearchState(userId);
  state.maxIterations = options.maxIterations || 5;
  
  // Get current profile
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (!profile) {
    return { error: 'User not found' };
  }
  
  // Step 1: Initial discovery
  await discoverLeads(state, profile);
  
  // Main loop
  while (state.shouldContinue()) {
    state.iterations++;
    console.log(`\n--- Iteration ${state.iterations} ---`);
    
    // Get next lead
    const lead = state.getNextLead();
    if (!lead) break;
    
    // Step 2: Research
    await researchLead(state, lead, profile);
    
    // Step 3: Populate
    await populateFromFindings(state);
    
    // Step 4: Verify
    await verifyAndResolve(state);
    
    // Step 5: Generate new leads
    await generateNewLeads(state);
    
    // Brief pause to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Final completeness check
  const { data: updatedProfile } = await supabase
    .from('users')
    .select('profile_completeness')
    .eq('id', userId)
    .single();
  
  console.log(`\n✅ Research Loop Complete`);
  console.log(`   Iterations: ${state.iterations}`);
  console.log(`   Findings: ${state.findings.length}`);
  console.log(`   Conflicts resolved: ${state.conflicts.length}`);
  
  return {
    success: true,
    iterations: state.iterations,
    findings: state.findings,
    conflicts: state.conflicts,
    confidence: state.confidence,
    log: state.log,
    profile_completeness: updatedProfile?.profile_completeness,
  };
}

export default { runResearchLoop };
