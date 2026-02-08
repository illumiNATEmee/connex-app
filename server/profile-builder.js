/**
 * PROFILE BUILDER
 * 
 * Unified entry point for manual profile creation.
 * Takes basic inputs → runs enrichment → returns complete profile with gaps.
 * 
 * Input: { name, phone, linkedin, instagram, x }
 * Output: { profile, enrichments, completeness, gaps }
 */

import { supabase, saveBuiltProfile } from './supabase.js';
import * as enrichment from './enrichment.js';
import * as userProfile from './user-profile.js';

// ═══════════════════════════════════════════════════════════
// PHONE AREA CODE → REGION LOOKUP
// ═══════════════════════════════════════════════════════════

const US_AREA_CODES = {
  // California
  '415': { city: 'San Francisco', state: 'CA', region: 'Bay Area' },
  '650': { city: 'San Mateo/Palo Alto', state: 'CA', region: 'Bay Area' },
  '408': { city: 'San Jose', state: 'CA', region: 'Bay Area' },
  '510': { city: 'Oakland/East Bay', state: 'CA', region: 'Bay Area' },
  '925': { city: 'Contra Costa', state: 'CA', region: 'Bay Area' },
  '628': { city: 'San Francisco', state: 'CA', region: 'Bay Area' },
  '341': { city: 'Oakland', state: 'CA', region: 'Bay Area' },
  '213': { city: 'Los Angeles', state: 'CA', region: 'LA Metro' },
  '310': { city: 'West LA/Santa Monica', state: 'CA', region: 'LA Metro' },
  '323': { city: 'Central LA', state: 'CA', region: 'LA Metro' },
  '424': { city: 'West LA', state: 'CA', region: 'LA Metro' },
  '818': { city: 'San Fernando Valley', state: 'CA', region: 'LA Metro' },
  '626': { city: 'Pasadena/SGV', state: 'CA', region: 'LA Metro' },
  '949': { city: 'Irvine/Orange County', state: 'CA', region: 'Orange County' },
  '714': { city: 'Anaheim/Orange County', state: 'CA', region: 'Orange County' },
  '858': { city: 'San Diego North', state: 'CA', region: 'San Diego' },
  '619': { city: 'San Diego', state: 'CA', region: 'San Diego' },
  '916': { city: 'Sacramento', state: 'CA', region: 'Sacramento' },
  
  // New York
  '212': { city: 'Manhattan', state: 'NY', region: 'NYC' },
  '646': { city: 'Manhattan', state: 'NY', region: 'NYC' },
  '917': { city: 'New York City', state: 'NY', region: 'NYC' },
  '718': { city: 'Brooklyn/Queens', state: 'NY', region: 'NYC' },
  '347': { city: 'Brooklyn/Queens', state: 'NY', region: 'NYC' },
  '929': { city: 'NYC Overlay', state: 'NY', region: 'NYC' },
  '516': { city: 'Long Island', state: 'NY', region: 'Long Island' },
  '631': { city: 'Long Island East', state: 'NY', region: 'Long Island' },
  '914': { city: 'Westchester', state: 'NY', region: 'Westchester' },
  
  // Texas
  '512': { city: 'Austin', state: 'TX', region: 'Austin' },
  '737': { city: 'Austin', state: 'TX', region: 'Austin' },
  '214': { city: 'Dallas', state: 'TX', region: 'DFW' },
  '972': { city: 'Dallas Metro', state: 'TX', region: 'DFW' },
  '469': { city: 'Dallas Metro', state: 'TX', region: 'DFW' },
  '817': { city: 'Fort Worth', state: 'TX', region: 'DFW' },
  '713': { city: 'Houston', state: 'TX', region: 'Houston' },
  '832': { city: 'Houston', state: 'TX', region: 'Houston' },
  '281': { city: 'Houston Metro', state: 'TX', region: 'Houston' },
  '210': { city: 'San Antonio', state: 'TX', region: 'San Antonio' },
  
  // Florida
  '305': { city: 'Miami', state: 'FL', region: 'South Florida' },
  '786': { city: 'Miami', state: 'FL', region: 'South Florida' },
  '954': { city: 'Fort Lauderdale', state: 'FL', region: 'South Florida' },
  '561': { city: 'West Palm Beach', state: 'FL', region: 'South Florida' },
  '407': { city: 'Orlando', state: 'FL', region: 'Orlando' },
  '813': { city: 'Tampa', state: 'FL', region: 'Tampa Bay' },
  
  // Illinois
  '312': { city: 'Chicago Downtown', state: 'IL', region: 'Chicago' },
  '773': { city: 'Chicago', state: 'IL', region: 'Chicago' },
  '872': { city: 'Chicago', state: 'IL', region: 'Chicago' },
  '847': { city: 'North Suburbs', state: 'IL', region: 'Chicago' },
  '630': { city: 'West Suburbs', state: 'IL', region: 'Chicago' },
  
  // Washington
  '206': { city: 'Seattle', state: 'WA', region: 'Seattle' },
  '425': { city: 'Eastside/Bellevue', state: 'WA', region: 'Seattle' },
  '253': { city: 'Tacoma', state: 'WA', region: 'Seattle' },
  
  // Massachusetts
  '617': { city: 'Boston', state: 'MA', region: 'Boston' },
  '857': { city: 'Boston', state: 'MA', region: 'Boston' },
  '781': { city: 'Boston Metro', state: 'MA', region: 'Boston' },
  '339': { city: 'Boston Metro', state: 'MA', region: 'Boston' },
  
  // Colorado
  '303': { city: 'Denver', state: 'CO', region: 'Denver' },
  '720': { city: 'Denver Metro', state: 'CO', region: 'Denver' },
  
  // Arizona
  '480': { city: 'Scottsdale/Tempe', state: 'AZ', region: 'Phoenix' },
  '602': { city: 'Phoenix', state: 'AZ', region: 'Phoenix' },
  '623': { city: 'Phoenix West', state: 'AZ', region: 'Phoenix' },
  
  // Georgia
  '404': { city: 'Atlanta', state: 'GA', region: 'Atlanta' },
  '678': { city: 'Atlanta Metro', state: 'GA', region: 'Atlanta' },
  '770': { city: 'Atlanta Suburbs', state: 'GA', region: 'Atlanta' },
  
  // DC Area
  '202': { city: 'Washington', state: 'DC', region: 'DC Metro' },
  '703': { city: 'Northern Virginia', state: 'VA', region: 'DC Metro' },
  '571': { city: 'Northern Virginia', state: 'VA', region: 'DC Metro' },
  '301': { city: 'Maryland', state: 'MD', region: 'DC Metro' },
  '240': { city: 'Maryland', state: 'MD', region: 'DC Metro' },
  
  // Pennsylvania
  '215': { city: 'Philadelphia', state: 'PA', region: 'Philadelphia' },
  '267': { city: 'Philadelphia', state: 'PA', region: 'Philadelphia' },
  '412': { city: 'Pittsburgh', state: 'PA', region: 'Pittsburgh' },
  
  // Nevada
  '702': { city: 'Las Vegas', state: 'NV', region: 'Las Vegas' },
  '725': { city: 'Las Vegas', state: 'NV', region: 'Las Vegas' },
  
  // Oregon
  '503': { city: 'Portland', state: 'OR', region: 'Portland' },
  '971': { city: 'Portland', state: 'OR', region: 'Portland' },
  
  // North Carolina
  '704': { city: 'Charlotte', state: 'NC', region: 'Charlotte' },
  '919': { city: 'Raleigh', state: 'NC', region: 'Raleigh-Durham' },
  '984': { city: 'Raleigh', state: 'NC', region: 'Raleigh-Durham' },
  
  // Michigan
  '313': { city: 'Detroit', state: 'MI', region: 'Detroit' },
  '248': { city: 'Detroit Suburbs', state: 'MI', region: 'Detroit' },
  
  // Minnesota
  '612': { city: 'Minneapolis', state: 'MN', region: 'Minneapolis' },
  '651': { city: 'St. Paul', state: 'MN', region: 'Minneapolis' },
  
  // New Jersey
  '201': { city: 'Jersey City/Hoboken', state: 'NJ', region: 'NYC Metro' },
  '551': { city: 'Jersey City', state: 'NJ', region: 'NYC Metro' },
  '973': { city: 'Newark', state: 'NJ', region: 'NYC Metro' },
  '908': { city: 'Central NJ', state: 'NJ', region: 'Central NJ' },
  
  // Connecticut
  '203': { city: 'New Haven/Stamford', state: 'CT', region: 'Connecticut' },
  '475': { city: 'Connecticut', state: 'CT', region: 'Connecticut' },
  
  // Hawaii
  '808': { city: 'Hawaii', state: 'HI', region: 'Hawaii' },
};

// International country codes
const COUNTRY_CODES = {
  '1': { country: 'USA/Canada', region: 'North America' },
  '44': { country: 'United Kingdom', region: 'Europe' },
  '852': { country: 'Hong Kong', region: 'Asia Pacific' },
  '65': { country: 'Singapore', region: 'Asia Pacific' },
  '86': { country: 'China', region: 'Asia Pacific' },
  '81': { country: 'Japan', region: 'Asia Pacific' },
  '82': { country: 'South Korea', region: 'Asia Pacific' },
  '886': { country: 'Taiwan', region: 'Asia Pacific' },
  '91': { country: 'India', region: 'South Asia' },
  '971': { country: 'UAE', region: 'Middle East' },
  '966': { country: 'Saudi Arabia', region: 'Middle East' },
  '49': { country: 'Germany', region: 'Europe' },
  '33': { country: 'France', region: 'Europe' },
  '39': { country: 'Italy', region: 'Europe' },
  '34': { country: 'Spain', region: 'Europe' },
  '31': { country: 'Netherlands', region: 'Europe' },
  '41': { country: 'Switzerland', region: 'Europe' },
  '61': { country: 'Australia', region: 'Oceania' },
  '64': { country: 'New Zealand', region: 'Oceania' },
  '55': { country: 'Brazil', region: 'South America' },
  '52': { country: 'Mexico', region: 'North America' },
  '66': { country: 'Thailand', region: 'Southeast Asia' },
  '62': { country: 'Indonesia', region: 'Southeast Asia' },
  '63': { country: 'Philippines', region: 'Southeast Asia' },
  '84': { country: 'Vietnam', region: 'Southeast Asia' },
};

export function parsePhoneNumber(phone) {
  if (!phone) return null;
  
  // Clean the phone number
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Check if it starts with + or has country code
  if (cleaned.startsWith('+')) {
    const withoutPlus = cleaned.slice(1);
    
    // Check country codes (try longer codes first)
    for (const len of [3, 2, 1]) {
      const code = withoutPlus.slice(0, len);
      if (COUNTRY_CODES[code]) {
        const countryInfo = COUNTRY_CODES[code];
        
        // For US/Canada, also extract area code
        if (code === '1' && withoutPlus.length >= 4) {
          const areaCode = withoutPlus.slice(1, 4);
          const areaInfo = US_AREA_CODES[areaCode];
          
          return {
            raw: phone,
            cleaned: '+' + withoutPlus,
            country_code: '1',
            area_code: areaCode,
            ...countryInfo,
            ...(areaInfo || {}),
            confidence: areaInfo ? 0.7 : 0.3, // Higher if we matched area code
          };
        }
        
        return {
          raw: phone,
          cleaned: '+' + withoutPlus,
          country_code: code,
          ...countryInfo,
          confidence: 0.5,
        };
      }
    }
  }
  
  // Assume US if 10 digits starting with area code
  if (cleaned.length === 10 && /^[2-9]/.test(cleaned)) {
    const areaCode = cleaned.slice(0, 3);
    const areaInfo = US_AREA_CODES[areaCode];
    
    return {
      raw: phone,
      cleaned: '+1' + cleaned,
      country_code: '1',
      area_code: areaCode,
      country: 'USA',
      region: 'North America',
      ...(areaInfo || {}),
      confidence: areaInfo ? 0.7 : 0.3,
    };
  }
  
  // 11 digits starting with 1 (US)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const areaCode = cleaned.slice(1, 4);
    const areaInfo = US_AREA_CODES[areaCode];
    
    return {
      raw: phone,
      cleaned: '+' + cleaned,
      country_code: '1',
      area_code: areaCode,
      country: 'USA',
      region: 'North America',
      ...(areaInfo || {}),
      confidence: areaInfo ? 0.7 : 0.3,
    };
  }
  
  return {
    raw: phone,
    cleaned: cleaned,
    confidence: 0.1,
  };
}

// ═══════════════════════════════════════════════════════════
// HANDLE VERIFICATION
// ═══════════════════════════════════════════════════════════

export async function verifyInstagramHandle(handle) {
  const cleanHandle = handle.replace('@', '').trim();
  
  try {
    // Try to fetch the profile page
    const response = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    
    // Instagram returns 200 for valid profiles, 404 for invalid
    const exists = response.ok && !response.url.includes('/accounts/login');
    
    return {
      handle: cleanHandle,
      exists,
      url: exists ? `https://instagram.com/${cleanHandle}` : null,
    };
  } catch (e) {
    return {
      handle: cleanHandle,
      exists: null,
      error: e.message,
    };
  }
}

export async function verifyTwitterHandle(handle) {
  const cleanHandle = handle.replace('@', '').trim();
  
  try {
    // Try x.com first
    const response = await fetch(`https://x.com/${cleanHandle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    
    // Check if we got a valid profile (not suspended, not 404)
    const exists = response.ok;
    
    return {
      handle: cleanHandle,
      exists,
      url: exists ? `https://x.com/${cleanHandle}` : null,
    };
  } catch (e) {
    return {
      handle: cleanHandle,
      exists: null,
      error: e.message,
    };
  }
}

export async function verifyLinkedInUrl(url) {
  if (!url) return { exists: false };
  
  // Extract username from URL
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  if (!match) {
    return {
      url,
      exists: false,
      error: 'Invalid LinkedIn URL format',
    };
  }
  
  const username = match[1];
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    
    // LinkedIn returns 200 for valid profiles
    const exists = response.ok;
    
    return {
      url,
      username,
      exists,
    };
  } catch (e) {
    return {
      url,
      username,
      exists: null,
      error: e.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// UNIFIED PROFILE BUILDER
// ═══════════════════════════════════════════════════════════

export async function buildProfile(input) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🏗️  PROFILE BUILDER');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const { name, phone, linkedin, instagram, x, email } = input;
  
  const result = {
    input,
    user: null,
    phone_info: null,
    verifications: {},
    enrichments: {},
    merged_profile: {},
    completeness: 0,
    gaps: [],
    errors: [],
  };
  
  // ─── Step 1: Create or find user ───
  console.log('📝 Step 1: Creating/finding user...');
  
  try {
    // Check if user exists by phone or email
    let existingUser = null;
    if (phone) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .single();
      existingUser = data;
    }
    if (!existingUser && email) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      existingUser = data;
    }
    
    if (existingUser) {
      console.log(`  ✓ Found existing user: ${existingUser.id}`);
      result.user = existingUser;
    } else {
      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          name_full: name,
          phone: phone,
          email: email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      console.log(`  ✓ Created new user: ${newUser.id}`);
      result.user = newUser;
    }
  } catch (e) {
    result.errors.push({ step: 'create_user', error: e.message });
    console.error('  ✗ Failed to create user:', e.message);
  }
  
  const userId = result.user?.id;
  if (!userId) {
    return result;
  }
  
  // ─── Step 2: Parse phone number ───
  if (phone) {
    console.log('\n📱 Step 2: Parsing phone number...');
    result.phone_info = parsePhoneNumber(phone);
    
    if (result.phone_info.city) {
      console.log(`  ✓ Detected: ${result.phone_info.city}, ${result.phone_info.state} (${result.phone_info.region})`);
    } else if (result.phone_info.country) {
      console.log(`  ✓ Detected: ${result.phone_info.country}`);
    } else {
      console.log('  ⚠ Could not determine location from phone');
    }
  }
  
  // ─── Step 3: Verify handles (parallel) ───
  console.log('\n🔍 Step 3: Verifying social handles...');
  
  const verificationPromises = [];
  
  if (linkedin) {
    verificationPromises.push(
      verifyLinkedInUrl(linkedin).then(r => {
        result.verifications.linkedin = r;
        console.log(`  ${r.exists ? '✓' : '✗'} LinkedIn: ${r.exists ? 'valid' : r.error || 'not found'}`);
      })
    );
  }
  
  if (instagram) {
    verificationPromises.push(
      verifyInstagramHandle(instagram).then(r => {
        result.verifications.instagram = r;
        console.log(`  ${r.exists ? '✓' : '✗'} Instagram: @${r.handle} ${r.exists ? 'valid' : r.error || 'not found'}`);
      })
    );
  }
  
  if (x) {
    verificationPromises.push(
      verifyTwitterHandle(x).then(r => {
        result.verifications.x = r;
        console.log(`  ${r.exists ? '✓' : '✗'} X/Twitter: @${r.handle} ${r.exists ? 'valid' : r.error || 'not found'}`);
      })
    );
  }
  
  await Promise.all(verificationPromises);
  
  // ─── Step 4: Save social profiles ───
  console.log('\n💾 Step 4: Saving social profiles...');
  
  const socialProfiles = [];
  
  if (linkedin && result.verifications.linkedin?.exists) {
    socialProfiles.push({
      user_id: userId,
      platform: 'linkedin',
      url: linkedin,
      handle: result.verifications.linkedin?.username,
      is_connected: false,
    });
  }
  
  if (instagram && result.verifications.instagram?.exists) {
    socialProfiles.push({
      user_id: userId,
      platform: 'instagram',
      handle: result.verifications.instagram?.handle,
      url: result.verifications.instagram?.url,
      is_connected: false,
    });
  }
  
  if (x && result.verifications.x?.exists) {
    socialProfiles.push({
      user_id: userId,
      platform: 'twitter',
      handle: result.verifications.x?.handle,
      url: result.verifications.x?.url,
      is_connected: false,
    });
  }
  
  for (const profile of socialProfiles) {
    try {
      await supabase.from('social_profiles').upsert(profile, {
        onConflict: 'user_id,platform',
      });
      console.log(`  ✓ Saved ${profile.platform} profile`);
    } catch (e) {
      result.errors.push({ step: 'save_social', platform: profile.platform, error: e.message });
    }
  }
  
  // ─── Step 5: Run enrichments (parallel) ───
  console.log('\n🧠 Step 5: Running enrichments...');
  
  const enrichmentPromises = [];
  
  if (linkedin && result.verifications.linkedin?.exists) {
    enrichmentPromises.push(
      enrichment.enrichFromLinkedIn(userId, linkedin)
        .then(r => {
          result.enrichments.linkedin = r;
          console.log(`  ${r.success ? '✓' : '✗'} LinkedIn enrichment: ${r.success ? 'complete' : r.error}`);
        })
        .catch(e => {
          result.enrichments.linkedin = { error: e.message };
          result.errors.push({ step: 'enrich_linkedin', error: e.message });
        })
    );
  }
  
  if (instagram && result.verifications.instagram?.exists) {
    enrichmentPromises.push(
      enrichment.enrichFromInstagram(userId, instagram)
        .then(r => {
          result.enrichments.instagram = r;
          console.log(`  ${r.success ? '✓' : '✗'} Instagram enrichment: ${r.success ? 'complete' : r.error}`);
        })
        .catch(e => {
          result.enrichments.instagram = { error: e.message };
          result.errors.push({ step: 'enrich_instagram', error: e.message });
        })
    );
  }
  
  if (x && result.verifications.x?.exists) {
    enrichmentPromises.push(
      enrichment.enrichFromTwitter(userId, x)
        .then(r => {
          result.enrichments.x = r;
          console.log(`  ${r.success ? '✓' : '✗'} X/Twitter enrichment: ${r.success ? 'complete' : r.error}`);
        })
        .catch(e => {
          result.enrichments.x = { error: e.message };
          result.errors.push({ step: 'enrich_twitter', error: e.message });
        })
    );
  }
  
  await Promise.all(enrichmentPromises);
  
  // ─── Step 6: Merge into unified profile ───
  console.log('\n🔀 Step 6: Merging profile data...');
  
  const merged = {
    id: userId,
    name: name,
    phone: phone,
    email: email,
    
    // From phone
    phone_signals: result.phone_info ? {
      area_code: result.phone_info.area_code,
      city: result.phone_info.city,
      state: result.phone_info.state,
      region: result.phone_info.region,
      country: result.phone_info.country,
      confidence: result.phone_info.confidence,
    } : null,
    
    // Social handles
    social: {
      linkedin: result.verifications.linkedin?.exists ? {
        url: linkedin,
        verified: true,
      } : null,
      instagram: result.verifications.instagram?.exists ? {
        handle: result.verifications.instagram.handle,
        verified: true,
      } : null,
      x: result.verifications.x?.exists ? {
        handle: result.verifications.x.handle,
        verified: true,
      } : null,
    },
    
    // From enrichments
    work: null,
    education: null,
    location: null,
    interests: [],
    skills: [],
  };
  
  // Merge LinkedIn data
  if (result.enrichments.linkedin?.data) {
    const li = result.enrichments.linkedin.data;
    merged.work = li.current_role || null;
    merged.education = li.education || null;
    merged.location = li.location || null;
    merged.skills = li.skills || [];
    merged.social.linkedin.enriched = li;
  }
  
  // Merge Instagram data
  if (result.enrichments.instagram?.data) {
    const ig = result.enrichments.instagram.data;
    merged.interests.push(...(ig.interests || []));
    merged.interests.push(...(ig.lifestyle || []));
    merged.social.instagram.enriched = ig;
  }
  
  // Merge Twitter/X data
  if (result.enrichments.x?.data) {
    const tw = result.enrichments.x.data;
    merged.interests.push(...(tw.interests || []));
    merged.social.x.enriched = tw;
  }
  
  // Dedupe interests
  merged.interests = [...new Set(merged.interests)];
  
  result.merged_profile = merged;
  
  // ─── Step 7: Calculate completeness ───
  console.log('\n📊 Step 7: Calculating completeness...');
  
  const fields = {
    name: !!merged.name,
    phone: !!merged.phone,
    email: !!merged.email,
    location: !!merged.location || !!merged.phone_signals?.city,
    work: !!merged.work,
    education: !!merged.education,
    linkedin: !!merged.social?.linkedin?.verified,
    instagram: !!merged.social?.instagram?.verified,
    x: !!merged.social?.x?.verified,
    interests: merged.interests?.length > 0,
    skills: merged.skills?.length > 0,
  };
  
  const filled = Object.values(fields).filter(Boolean).length;
  result.completeness = Math.round((filled / Object.keys(fields).length) * 100);
  result.gaps = Object.entries(fields)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  
  console.log(`  Completeness: ${result.completeness}%`);
  console.log(`  Gaps: ${result.gaps.length > 0 ? result.gaps.join(', ') : 'none'}`);
  
  // ─── Step 8: Save to profiles table ───
  console.log('\n💾 Step 8: Saving to profiles table...');
  
  try {
    const savedProfile = await saveBuiltProfile(result);
    if (savedProfile) {
      result.saved_profile_id = savedProfile.id;
      console.log(`  ✓ Saved profile with ID: ${savedProfile.id}`);
    }
  } catch (e) {
    console.error(`  ✗ Failed to save profile: ${e.message}`);
    result.errors.push({ step: 'save_profile', error: e.message });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ PROFILE BUILD COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return result;
}

// ═══════════════════════════════════════════════════════════
// QUICK BUILD (verification only, no enrichment)
// ═══════════════════════════════════════════════════════════

export async function quickBuildProfile(input) {
  const { name, phone, linkedin, instagram, x } = input;
  
  const result = {
    input,
    phone_info: phone ? parsePhoneNumber(phone) : null,
    verifications: {},
  };
  
  // Run verifications in parallel
  const promises = [];
  
  if (linkedin) {
    promises.push(
      verifyLinkedInUrl(linkedin).then(r => { result.verifications.linkedin = r; })
    );
  }
  if (instagram) {
    promises.push(
      verifyInstagramHandle(instagram).then(r => { result.verifications.instagram = r; })
    );
  }
  if (x) {
    promises.push(
      verifyTwitterHandle(x).then(r => { result.verifications.x = r; })
    );
  }
  
  await Promise.all(promises);
  
  // Calculate quick completeness
  let valid = 0;
  let total = 0;
  
  if (name) valid++;
  total++;
  
  if (phone) {
    valid++;
    if (result.phone_info?.city) valid += 0.5; // Bonus for recognized area code
  }
  total++;
  
  for (const v of Object.values(result.verifications)) {
    total++;
    if (v.exists) valid++;
  }
  
  result.completeness = Math.round((valid / total) * 100);
  
  return result;
}

// ═══════════════════════════════════════════════════════════
// BATCH IMPORT
// Process multiple profiles at once
// ═══════════════════════════════════════════════════════════

export async function batchBuildProfiles(profiles, options = {}) {
  const { 
    concurrency = 3,  // How many to process in parallel
    quickMode = false, // Skip enrichment
    onProgress = null, // Callback for progress updates
  } = options;
  
  console.log(`\n🏗️ BATCH PROFILE BUILD: ${profiles.length} profiles\n`);
  
  const results = [];
  const errors = [];
  
  // Process in batches
  for (let i = 0; i < profiles.length; i += concurrency) {
    const batch = profiles.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (input, j) => {
      const index = i + j;
      try {
        const result = quickMode 
          ? await quickBuildProfile(input)
          : await buildProfile(input);
        
        results.push({ index, input, result, success: true });
        
        if (onProgress) {
          onProgress({
            current: results.length + errors.length,
            total: profiles.length,
            lastProcessed: input.name || input.phone,
            success: true,
          });
        }
        
        return result;
      } catch (e) {
        errors.push({ index, input, error: e.message });
        
        if (onProgress) {
          onProgress({
            current: results.length + errors.length,
            total: profiles.length,
            lastProcessed: input.name || input.phone,
            success: false,
            error: e.message,
          });
        }
        
        return null;
      }
    });
    
    await Promise.all(batchPromises);
    
    // Small delay between batches to avoid rate limiting
    if (i + concurrency < profiles.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Calculate summary stats
  const summary = {
    total: profiles.length,
    successful: results.length,
    failed: errors.length,
    avgCompleteness: results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + (r.result?.completeness || 0), 0) / results.length)
      : 0,
  };
  
  console.log(`\n✅ BATCH COMPLETE: ${summary.successful}/${summary.total} successful\n`);
  
  return { results, errors, summary };
}

// ═══════════════════════════════════════════════════════════
// CSV PARSING
// ═══════════════════════════════════════════════════════════

export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Map common column names
  const columnMap = {
    name: ['name', 'full name', 'fullname', 'display name', 'displayname'],
    phone: ['phone', 'phone number', 'phonenumber', 'mobile', 'cell', 'telephone'],
    email: ['email', 'e-mail', 'email address'],
    linkedin: ['linkedin', 'linkedin url', 'linkedinurl', 'li'],
    instagram: ['instagram', 'ig', 'insta'],
    x: ['x', 'twitter', 'x handle', 'twitter handle'],
  };
  
  // Find which columns correspond to which fields
  const fieldIndexes = {};
  for (const [field, aliases] of Object.entries(columnMap)) {
    const index = header.findIndex(h => aliases.includes(h));
    if (index >= 0) fieldIndexes[field] = index;
  }
  
  // Parse rows
  const profiles = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    
    const profile = {};
    for (const [field, index] of Object.entries(fieldIndexes)) {
      if (values[index]) {
        profile[field] = values[index];
      }
    }
    
    // Only add if we have at least name or phone
    if (profile.name || profile.phone) {
      profiles.push(profile);
    }
  }
  
  return profiles;
}

export default {
  parsePhoneNumber,
  verifyInstagramHandle,
  verifyTwitterHandle,
  verifyLinkedInUrl,
  buildProfile,
  quickBuildProfile,
  batchBuildProfiles,
  parseCSV,
};
