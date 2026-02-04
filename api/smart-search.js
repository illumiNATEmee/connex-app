import Anthropic from "@anthropic-ai/sdk";

/**
 * Smart Search — Iterative Contact Intelligence
 * 
 * The loop:
 * 1. Build YOUR profile from inputs
 * 2. Extract names + phone numbers from WhatsApp group
 * 3. Search each contact using name + phone area code + any chat clues
 * 4. Score potential commonalities with YOU
 * 5. Re-prioritize: focus next search round on promising leads
 * 6. Repeat until strong matches emerge
 * 
 * Each round reveals more data → better prioritization → smarter searches
 */

const MATCH_PROMPT = `You are the Connex Brain — Match Evaluator.

You've been given:
1. USER PROFILE — who the user is (from LinkedIn, X, and their inputs)
2. CONTACT DATA — what we've found about a contact so far (from search + chat)

Evaluate: How likely is a meaningful connection between these two people?

Return JSON:
{
  "match_score": 0-100,
  "match_tier": "strong|promising|weak|insufficient_data",
  "commonalities": [
    {"type": "school|company|location|interest|industry|lifestyle", "detail": "Specific commonality", "confidence": 0.0-1.0}
  ],
  "non_obvious": ["Things that aren't surface-level but could create real connection"],
  "needs_more_data": true/false,
  "next_search_queries": ["If needs_more_data, what should we search next to confirm/deny this match"],
  "connection_potential": "One paragraph: why these two should or shouldn't meet",
  "intro_angle": "If strong match: the specific angle for the introduction"
}

Be ruthlessly honest. A weak match with high confidence is more valuable than a strong match based on guesses.`;

// Phone number to search context
function phoneToSearchClues(phoneStr) {
  const clues = [];
  const match = phoneStr.match(/\+?(\d{1,3})[\s.-]?\(?(\d{3})\)?/);
  if (!match) return clues;

  const countryCode = match[1];
  const areaCode = match[2];

  const areaCities = {
    "212": "New York", "213": "Los Angeles", "310": "Los Angeles",
    "415": "San Francisco", "408": "San Jose", "650": "Silicon Valley",
    "312": "Chicago", "305": "Miami", "206": "Seattle", "512": "Austin",
    "617": "Boston", "202": "Washington DC", "404": "Atlanta",
    "703": "Northern Virginia", "818": "Los Angeles",
  };

  if (areaCities[areaCode]) clues.push(areaCities[areaCode]);
  if (countryCode === "1") clues.push("United States");
  
  return clues;
}

// Simple web search
async function searchWeb(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const html = await response.text();
      return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12000);
    }
  } catch (_) {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userProfile, contacts, round = 1, previousResults = [] } = req.body;
  // userProfile: { name, city, linkedinUrl, twitterHandle, interests, expertise, ... }
  // contacts: [{ name, phone, chatMessages, clues }]

  if (!userProfile || !contacts?.length) {
    return res.status(400).json({ error: "userProfile and contacts required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results = [];

  // Determine how many to search this round
  // Round 1: broad scan (top 8)
  // Round 2+: narrow focus on promising (top 3-5)
  const maxContacts = round === 1 ? 8 : 4;
  const searchContacts = contacts.slice(0, maxContacts);

  for (const contact of searchContacts) {
    const { name, phone, chatMessages = "", clues = [] } = contact;

    // Check if we already have results from previous rounds
    const prevResult = previousResults.find(r => r.name === name);
    
    // Build search queries based on what we know
    const searchClues = [...clues];
    if (phone) searchClues.push(...phoneToSearchClues(phone));

    // Round 1: basic search
    // Round 2+: use previous results to refine queries
    let queries;
    if (round === 1) {
      queries = [
        `"${name}" ${searchClues[0] || ""}`.trim(),
        searchClues[1] ? `"${name}" ${searchClues[1]}` : `"${name}" linkedin`,
      ].filter(Boolean);
    } else if (prevResult?.needs_more_data && prevResult?.next_search_queries?.length) {
      // Use Brain's suggested next queries
      queries = prevResult.next_search_queries.slice(0, 2);
    } else {
      // Skip — already have enough data
      if (prevResult && !prevResult.needs_more_data) {
        results.push(prevResult);
        continue;
      }
      queries = [`"${name}" ${searchClues.join(" ")}`.trim()];
    }

    // Execute searches
    const searchResults = await Promise.all(queries.map(q => searchWeb(q)));
    const combinedSearch = searchResults.filter(Boolean).join("\n---\n").slice(0, 15000);

    // Build user profile summary for matching
    const userSummary = `Name: ${userProfile.name || "Unknown"}
City: ${userProfile.city || "Unknown"}
LinkedIn: ${userProfile.linkedinUrl || "N/A"}
X: ${userProfile.twitterHandle || "N/A"}
Interests: ${(userProfile.interests || []).join(", ") || "N/A"}
Expertise: ${(userProfile.expertise || []).join(", ") || "N/A"}
Looking for: ${(userProfile.looking_for || []).join(", ") || "N/A"}`;

    // Contact data so far
    const contactData = `Name: ${name}
Phone: ${phone || "Unknown"}
Phone region: ${phone ? phoneToSearchClues(phone).join(", ") : "Unknown"}
Chat messages: ${chatMessages.slice(0, 1500)}
Previous findings: ${prevResult ? JSON.stringify(prevResult.commonalities || []) : "None"}
Search results (Round ${round}): ${combinedSearch || "Nothing found"}`;

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: MATCH_PROMPT,
        messages: [{
          role: "user",
          content: `USER PROFILE:\n${userSummary}\n\nCONTACT DATA:\n${contactData}`,
        }],
      });

      const responseText = message.content[0]?.text || "";
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      const parsed = JSON.parse(jsonStr);
      results.push({ name, phone, round, ...parsed });
    } catch (e) {
      results.push({ name, phone, round, match_score: 0, match_tier: "insufficient_data", needs_more_data: true });
    }
  }

  // Sort by match score
  results.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

  // Determine if another round is needed
  const promising = results.filter(r => r.match_tier === "promising" && r.needs_more_data);
  const needsAnotherRound = promising.length > 0 && round < 3;

  return res.status(200).json({
    source: "smart-search",
    round,
    results,
    summary: {
      strong: results.filter(r => r.match_tier === "strong").length,
      promising: results.filter(r => r.match_tier === "promising").length,
      weak: results.filter(r => r.match_tier === "weak").length,
      insufficient: results.filter(r => r.match_tier === "insufficient_data").length,
    },
    needsAnotherRound,
    nextRoundContacts: needsAnotherRound ? promising.map(p => ({
      name: p.name,
      phone: p.phone,
      clues: [...(p.commonalities || []).map(c => c.detail), ...(p.next_search_queries || [])],
    })) : [],
  });
}
