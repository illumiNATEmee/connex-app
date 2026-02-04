import Anthropic from "@anthropic-ai/sdk";

/**
 * Smart Search Agent
 * 
 * Takes a contact name + contextual clues from chat,
 * searches the web, and builds a verified profile.
 * 
 * This is the "detective" — it goes out and FINDS data,
 * not just waits for it.
 */

const PROFILE_PROMPT = `You are the Connex Brain — Profile Detective.

You've been given search results about a person. Your job is to build a verified profile from what you find.

CRITICAL: Only include information you can tie to THIS specific person. Common names may return wrong results — use the contextual clues to verify identity.

Return JSON:
{
  "verified": true/false,
  "confidence": 0.0-1.0,
  "name": "Full name",
  "headline": "One-line summary",
  "role": "Current role",
  "company": "Current company",
  "industry": "Industry",
  "location": "City, Country",
  "education": [{"school": "", "degree": "", "years": ""}],
  "career_history": [{"role": "", "company": "", "period": ""}],
  "expertise": ["Deep skills"],
  "public_presence": {
    "articles": ["URLs or titles of articles by/about them"],
    "talks": ["Conference talks, podcasts"],
    "social": ["Social profiles found"]
  },
  "interests": ["Inferred from public presence"],
  "connection_hooks": ["What makes them uniquely interesting"],
  "looking_for": ["Inferred needs"],
  "offering": ["What they could provide"],
  "sources": ["Where each piece of info came from"]
}

Rules:
1. Return ONLY valid JSON
2. If you can't verify this is the right person, set verified=false
3. Include sources for every claim
4. connection_hooks should be SPECIFIC and NON-OBVIOUS`;

// Simple web search using Google
async function searchWeb(query) {
  try {
    // Use Google's custom search or a simple fetch
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const html = await response.text();
      // Extract text, strip HTML
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 15000);
    }
  } catch (e) {
    console.log(`Search failed for: ${query}`);
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { contacts } = req.body;
  // contacts: [{ name, clues: [], chatContext: "" }]

  if (!contacts?.length) {
    return res.status(400).json({ error: "contacts array is required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results = [];

  // Process contacts (limit to top 5 to control costs)
  const topContacts = contacts.slice(0, 5);

  for (const contact of topContacts) {
    const { name, clues = [], chatContext = "" } = contact;

    // Build smart search queries
    const queries = [
      `"${name}" ${clues[0] || ""}`.trim(),
      clues[1] ? `"${name}" ${clues[1]}` : null,
      `"${name}" linkedin`,
    ].filter(Boolean);

    // Execute searches in parallel
    const searchResults = await Promise.all(queries.map(q => searchWeb(q)));
    const combinedResults = searchResults.filter(Boolean).join("\n\n---\n\n");

    if (!combinedResults) {
      results.push({ name, verified: false, confidence: 0, reason: "No search results found" });
      continue;
    }

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: PROFILE_PROMPT,
        messages: [{
          role: "user",
          content: `Build a profile for "${name}" from these search results.\n\nCONTEXTUAL CLUES (from their WhatsApp messages):\n${clues.join("\n")}\n\nCHAT CONTEXT:\n${chatContext.slice(0, 2000)}\n\nSEARCH RESULTS:\n${combinedResults.slice(0, 20000)}`,
        }],
      });

      const responseText = message.content[0]?.text || "";
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      const parsed = JSON.parse(jsonStr);
      results.push({ name, ...parsed });
    } catch (e) {
      results.push({ name, verified: false, confidence: 0, reason: "Analysis failed" });
    }
  }

  return res.status(200).json({
    source: "search-agent",
    profiles: results,
    searched: topContacts.length,
  });
}
