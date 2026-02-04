import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Connex Brain — an expert at extracting structured profile data from LinkedIn content.

You'll receive either:
- Raw HTML/text from a LinkedIn profile page
- Copy-pasted text from a LinkedIn profile
- A mix of both

Extract EVERYTHING you can and return this JSON structure:

{
  "name": "Full Name",
  "headline": "Their LinkedIn headline",
  "role": "Current job title",
  "company": "Current company",
  "industry": "Industry they work in",
  "location": {
    "city": "City",
    "country": "Country",
    "timezone": "Inferred timezone"
  },
  "experience": [
    {"title": "Role", "company": "Company", "duration": "Time period", "description": "Key details"}
  ],
  "education": [
    {"school": "University/School", "degree": "Degree", "field": "Field of study", "years": "Year range"}
  ],
  "skills": ["Skill1", "Skill2"],
  "interests": ["Inferred interests from their background"],
  "expertise": ["What they deeply know based on career"],
  "looking_for": ["Inferred needs — career moves, connections, opportunities"],
  "offering": ["What they could provide — mentorship, expertise, introductions, hiring"],
  "affinities": {
    "schools": ["Alumni networks"],
    "companies": ["Past company networks"],
    "industries": ["Industry connections"],
    "other": ["Inferred from background"]
  },
  "personality_notes": "Communication style / career pattern observations",
  "connection_hooks": ["Specific things that make them interesting to connect with — unique experiences, rare skill combos, etc."]
}

RULES:
1. Return ONLY valid JSON
2. Be creative with inference — a Stanford MBA who worked at McKinsey then joined a startup likely is entrepreneurial and values high-caliber networks
3. connection_hooks should highlight what makes this person UNIQUELY interesting — the non-obvious stuff
4. looking_for and offering should be smart inferences, not just restating their job title
5. If information is clearly not available, use null — but prefer informed inference over empty fields`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { linkedinUrl, profileText } = req.body;

  if (!linkedinUrl && !profileText) {
    return res.status(400).json({ error: "linkedinUrl or profileText is required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  let contentToAnalyze = profileText || "";

  // If URL provided, try to fetch public profile
  if (linkedinUrl && !profileText) {
    try {
      // Try fetching via a simple GET — will get limited public data
      // In production, use Proxycurl or similar service
      const response = await fetch(linkedinUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      if (response.ok) {
        const html = await response.text();
        // Extract text content, strip most HTML
        contentToAnalyze = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 50000); // Cap at 50K chars
      }
    } catch (e) {
      // Fetch failed — will fall through to ask for paste
      if (!profileText) {
        return res.status(422).json({
          error: "Could not fetch LinkedIn profile. Please paste the profile text instead.",
          needsPaste: true,
        });
      }
    }
  }

  if (!contentToAnalyze || contentToAnalyze.trim().length < 50) {
    return res.status(422).json({
      error: "Not enough profile data. Please paste the full LinkedIn profile text.",
      needsPaste: true,
    });
  }

  // Truncate if massive
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
          content: `Extract a structured profile from this LinkedIn data:\n\n${truncated}`,
        },
      ],
    });

    const responseText = message.content[0]?.text || "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);

    return res.status(200).json({
      source: "linkedin",
      profile: parsed,
    });
  } catch (error) {
    console.error("LinkedIn API error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "Failed to parse response as JSON" });
    }
    return res.status(500).json({ error: error.message || "LinkedIn analysis failed" });
  }
}
