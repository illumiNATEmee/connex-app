import Anthropic from "@anthropic-ai/sdk";

/**
 * Profile Aggregation Hub
 * 
 * Takes all available data sources, scrapes them, merges into one profile,
 * then passes the ENRICHED context to the Brain for analysis.
 * 
 * This is the connective tissue between scrapers and the Brain.
 */

const MERGE_PROMPT = `You are the Connex Brain — Profile Merger.

You'll receive data from multiple sources about ONE person. Merge everything into a single, rich profile.

Cross-reference across sources:
- If LinkedIn says "San Francisco" and WhatsApp mentions "SF" → HIGH confidence location
- If only one source mentions something → MEDIUM confidence
- If sources contradict → flag it, go with most recent/reliable

Return this JSON:
{
  "name": "Best name found",
  "photo": "URL if available",
  "headline": "One-line summary of who they are",
  "role": "Current role",
  "company": "Current company",
  "industry": "Industry",
  "location": {
    "city": "Best guess city",
    "country": "Country",
    "confidence": 0.9,
    "sources": ["linkedin", "whatsapp"]
  },
  "interests": [{"topic": "AI", "confidence": 0.8, "sources": ["twitter", "whatsapp"]}],
  "expertise": [{"skill": "Product Design", "depth": "expert|intermediate|casual", "source": "linkedin"}],
  "affinities": {
    "sports": [], "food": [], "travel": [], "wellness": [], "music": [], "hobbies": []
  },
  "personality": {
    "communication_style": "From WhatsApp messages",
    "online_persona": "From Twitter/IG",
    "professional_tone": "From LinkedIn",
    "overall": "Merged personality read"
  },
  "looking_for": [{"need": "Technical cofounder", "confidence": 0.7, "source": "inference"}],
  "offering": [{"value": "Design mentorship", "confidence": 0.8, "source": "linkedin"}],
  "connection_hooks": [
    "Non-obvious things that make this person uniquely interesting to connect with"
  ],
  "life_context": {
    "career_stage": "early|growth|established|transition",
    "recent_changes": ["Just moved to Bangkok", "Left Google last month"],
    "upcoming": ["Traveling to Tokyo in Feb", "Speaking at a conference"]
  },
  "data_quality": {
    "sources_used": ["linkedin", "twitter", "instagram", "whatsapp"],
    "overall_confidence": 0.8,
    "gaps": ["No calendar data", "Instagram was private"]
  }
}`;

async function scrapeSource(type, input) {
  const endpoints = {
    linkedin: "/api/linkedin",
    twitter: "/api/twitter",
    instagram: "/api/instagram",
  };

  // In serverless, we can't call our own endpoints easily
  // So we do inline scraping + Claude analysis here
  const url = type === "linkedin" ? input
    : type === "twitter" ? `https://x.com/${input.replace("@", "")}`
    : type === "instagram" ? `https://www.instagram.com/${input.replace("@", "")}/`
    : null;

  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const html = await response.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 30000);
    }
  } catch (e) {
    console.log(`Scrape failed for ${type}: ${e.message}`);
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { linkedinUrl, twitterHandle, instagramHandle, chatMessages } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Scrape all available sources in parallel
  const scrapePromises = [];
  const sourceLabels = [];

  if (linkedinUrl) {
    scrapePromises.push(scrapeSource("linkedin", linkedinUrl));
    sourceLabels.push("linkedin");
  }
  if (twitterHandle) {
    scrapePromises.push(scrapeSource("twitter", twitterHandle));
    sourceLabels.push("twitter");
  }
  if (instagramHandle) {
    scrapePromises.push(scrapeSource("instagram", instagramHandle));
    sourceLabels.push("instagram");
  }

  const scrapeResults = await Promise.all(scrapePromises);

  // Build context from all sources
  let allContext = "";
  scrapeResults.forEach((result, i) => {
    if (result) {
      allContext += `\n\n=== ${sourceLabels[i].toUpperCase()} DATA ===\n${result}`;
    } else {
      allContext += `\n\n=== ${sourceLabels[i].toUpperCase()} ===\n[Could not fetch — profile may be private]`;
    }
  });

  if (chatMessages) {
    allContext += `\n\n=== WHATSAPP MESSAGES ===\n${chatMessages.slice(0, 20000)}`;
  }

  if (!allContext.trim()) {
    return res.status(400).json({ error: "No data sources provided" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: MERGE_PROMPT,
      messages: [
        {
          role: "user",
          content: `Merge these data sources into a single rich profile:\n${allContext}`,
        },
      ],
    });

    const responseText = message.content[0]?.text || "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);

    return res.status(200).json({
      source: "aggregated",
      profile: parsed,
      sources_attempted: sourceLabels,
      sources_fetched: sourceLabels.filter((_, i) => scrapeResults[i] !== null),
    });
  } catch (error) {
    console.error("Aggregate API error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "Failed to parse response" });
    }
    return res.status(500).json({ error: error.message || "Aggregation failed" });
  }
}
