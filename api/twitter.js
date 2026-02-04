import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Connex Brain — an expert at extracting profile insights from X/Twitter data.

You'll receive either raw HTML/text from a Twitter profile page or copy-pasted content.

Extract EVERYTHING and return this JSON:

{
  "name": "Display Name",
  "handle": "@username",
  "bio": "Their bio text",
  "location": "Listed location",
  "website": "Personal website if any",
  "followers": "Follower count if visible",
  "interests": ["Inferred from bio, pinned tweets, recent topics"],
  "opinions": ["Strong viewpoints or takes they're known for"],
  "communities": ["Crypto Twitter, Tech Twitter, Sports Twitter, etc."],
  "tone": "How they communicate — sarcastic, professional, casual, provocative",
  "affinities": {
    "topics": ["What they tweet about most"],
    "people": ["Who they interact with / retweet"],
    "brands": ["Companies/products they mention"]
  },
  "personality_notes": "What their Twitter presence reveals about them",
  "connection_hooks": ["What makes them interesting to connect with based on their Twitter"]
}

RULES:
1. Return ONLY valid JSON
2. Twitter reveals personality more than LinkedIn — focus on tone, opinions, interests
3. connection_hooks should find the non-obvious: shared niche interests, complementary worldviews
4. communities matter — "Crypto Twitter" people bond differently than "VC Twitter"
5. Infer freely but note when you're inferring vs stating facts`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { twitterUrl, handle, profileText } = req.body;

  if (!twitterUrl && !handle && !profileText) {
    return res.status(400).json({ error: "twitterUrl, handle, or profileText is required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  let contentToAnalyze = profileText || "";

  // Try to fetch public profile
  if (!profileText && (twitterUrl || handle)) {
    const url = twitterUrl || `https://x.com/${handle.replace("@", "")}`;
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
          error: "Could not fetch X profile. Please paste the profile page text instead.",
          needsPaste: true,
        });
      }
    }
  }

  if (!contentToAnalyze || contentToAnalyze.trim().length < 30) {
    return res.status(422).json({
      error: "Not enough profile data. Please paste the X profile text.",
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
          content: `Extract a structured profile from this X/Twitter data:\n\n${truncated}`,
        },
      ],
    });

    const responseText = message.content[0]?.text || "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);

    return res.status(200).json({
      source: "twitter",
      profile: parsed,
    });
  } catch (error) {
    console.error("Twitter API error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "Failed to parse response as JSON" });
    }
    return res.status(500).json({ error: error.message || "Twitter analysis failed" });
  }
}
