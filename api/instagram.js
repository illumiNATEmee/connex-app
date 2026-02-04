import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Connex Brain — an expert at extracting profile insights from Instagram data.

You'll receive raw HTML/text from an Instagram profile page or copy-pasted content.

Instagram reveals LIFESTYLE — travel, food, fitness, aesthetics, social circles. This is goldmine data for friendship/connection matching that LinkedIn and Twitter can't provide.

Extract EVERYTHING and return this JSON:

{
  "name": "Display Name",
  "username": "@username",
  "bio": "Their bio text",
  "location": "If listed or inferable",
  "website": "Link in bio",
  "followers": "Count if visible",
  "content_themes": ["Travel", "Food", "Fitness", "Tech", "Fashion", etc.],
  "lifestyle": {
    "travel": ["Cities/countries they post about"],
    "food": ["Cuisines, restaurants, cooking style"],
    "fitness": ["Gym, yoga, running, etc."],
    "hobbies": ["Photography, art, music, etc."],
    "social_style": "Party person / intimate gatherings / outdoorsy / homebody"
  },
  "aesthetic": "Minimalist / Luxury / Adventure / Casual / Professional",
  "vibe": "Overall energy — chill, ambitious, creative, social butterfly, etc.",
  "affinities": {
    "brands": ["Brands/products they feature"],
    "places": ["Regular spots, favorite cities"],
    "activities": ["Regular activities visible in posts"]
  },
  "personality_notes": "What their Instagram reveals about who they are",
  "connection_hooks": ["What makes them interesting — unique lifestyle elements, shared potential activities"]
}

RULES:
1. Return ONLY valid JSON
2. Instagram is about LIFESTYLE and VIBES — focus on that, not professional stuff
3. Travel patterns are gold for connection matching ("both love Bali" or "both foodies in Bangkok")
4. connection_hooks should highlight shared activity potential: "Would be great hiking buddy" or "Fellow wine enthusiast"
5. Infer freely from content themes and bio`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { instagramUrl, username, profileText } = req.body;

  if (!instagramUrl && !username && !profileText) {
    return res.status(400).json({ error: "instagramUrl, username, or profileText is required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  let contentToAnalyze = profileText || "";

  if (!profileText && (instagramUrl || username)) {
    const url = instagramUrl || `https://www.instagram.com/${username.replace("@", "")}/`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      if (response.ok) {
        const html = await response.text();
        contentToAnalyze = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 50000);
      }
    } catch (e) {
      if (!profileText) {
        return res.status(422).json({
          error: "Could not fetch Instagram profile. Please paste the profile page text instead.",
          needsPaste: true,
        });
      }
    }
  }

  if (!contentToAnalyze || contentToAnalyze.trim().length < 30) {
    return res.status(422).json({
      error: "Not enough profile data. Please paste the Instagram profile text.",
      needsPaste: true,
    });
  }

  const maxChars = 50000;
  const truncated = contentToAnalyze.length > maxChars
    ? contentToAnalyze.slice(0, maxChars)
    : contentToAnalyze;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extract a structured profile from this Instagram data:\n\n${truncated}`,
        },
      ],
    });

    const responseText = message.content[0]?.text || "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);

    return res.status(200).json({
      source: "instagram",
      profile: parsed,
    });
  } catch (error) {
    console.error("Instagram API error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "Failed to parse response as JSON" });
    }
    return res.status(500).json({ error: error.message || "Instagram analysis failed" });
  }
}
