import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Connex Brain — an expert at analyzing WhatsApp group chat exports to build rich member profiles.

Given a WhatsApp chat export, analyze every member and return structured JSON profiles.

For each member, extract as much as you can infer from their messages and the context of conversations about them:

PROFILE SCHEMA (return this exact structure for each member):
{
  "name": "Display Name from chat",
  "role": "Job title/role if mentioned or inferable",
  "company": "Company if mentioned",
  "industry": "Industry if inferable",
  "location": {
    "city": "Primary city (best guess from context)",
    "neighborhood": "If mentioned",
    "timezone": "Inferred timezone"
  },
  "interests": ["Array of specific interests mentioned or implied"],
  "expertise": ["What they seem to know deeply based on how they talk"],
  "affinities": {
    "sports": ["Teams or sports mentioned"],
    "food": ["Food preferences, restaurants, cuisines"],
    "other": ["Other hobbies, activities"]
  },
  "looking_for": ["What they seem to need — cofounder, advice, connections, etc."],
  "offering": ["What they could provide to others — expertise, introductions, resources"],
  "activity_score": 0.0,
  "personality_notes": "Brief personality read based on communication style",
  "context_sources": [
    {"type": "direct_statement|inference|mention_by_others", "detail": "what was said", "confidence": 0.0}
  ]
}

RULES:
1. Return ONLY valid JSON — an object with "profiles", "group_insights", and "trust_activations" arrays
2. activity_score: 0.0-1.0 based on message volume relative to group
3. confidence in context_sources: 0.9+ for direct statements ("I'm in SF"), 0.5-0.8 for strong inference, 0.3-0.5 for weak inference
4. Be creative with inference — if someone discusses fundraising strategy fluently, they likely have startup/VC expertise
5. looking_for and offering should be inferred from context, not just stated
6. For group_insights, identify: key_themes, geographic_clusters, potential_matches (complementary needs/offers), and suggested_activations

IMPORTANT: Every field should have a value if you can infer one. Use null only if truly unknown. Prefer informed guesses with lower confidence over empty fields.

TRUST ACTIVATIONS — This is critical. After profiling everyone, automatically:
1. Identify the CONNECTOR (who created the group, who added people, who's the hub)
2. Cross-match ALL members against each other for valuable introductions
3. Return a "trust_activations" array:

"trust_activations": [
  {
    "type": "warm_intro",
    "person_a": "Name",
    "person_b": "Name", 
    "connector": "Who should make the intro",
    "score": 85,
    "why": "Both in SF, complementary needs — Sarah needs a technical cofounder, Tom is an engineer looking for a startup to join",
    "conversation_starter": "Specific topic they'd bond over",
    "intro_message": "Pre-written message the connector can send"
  },
  {
    "type": "group_activation",
    "participants": ["Name1", "Name2", "Name3"],
    "activity": "UFC Watch Party in LA",
    "why": "3 members in LA all follow UFC",
    "poll_message": "Ready-to-send WhatsApp poll message"
  }
]

Generate BOTH warm_intro (1:1 connections) and group_activation (meetup suggestions). Prioritize by score. The goal is PLANNED SERENDIPITY — surface the connections that would never happen organically.

CREATIVE MATCHING — Go beyond the obvious. Hunt for these non-obvious touchpoints:
- **Rival schools/companies** → instant rapport through friendly rivalry
- **Parallel life transitions** → both leaving corporate, both new parents, both relocating
- **Complementary expertise** → designer + engineer, fundraiser + operator, creative + analytical
- **Hidden shared experiences** → traveled to same places, similar career pivots, shared niche hobbies
- **Cross-industry insight** → someone in healthcare + someone in fintech could spark innovation
- **Lifestyle alignment** → both early risers, both wellness-focused, both foodies exploring the same cuisines
- **Timing coincidences** → both visiting the same city soon, both at career crossroads
- **Personality chemistry** → one's a big-picture thinker, the other's a detail executor — they'd complement
- **Unspoken needs** → someone venting about a problem + someone who solved that exact problem

The BEST connections feel like "how did you know?!" — not "well, duh." That's the Connex difference.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { chatText, userProfile } = req.body;

  if (!chatText || typeof chatText !== "string") {
    return res.status(400).json({ error: "chatText is required" });
  }

  // userProfile is optional — enriched data from LinkedIn/X to improve matching
  // { linkedinUrl, twitterHandle, name, ... }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Truncate very large chats to stay within token limits
  const maxChars = 80000;
  const truncated = chatText.length > maxChars
    ? chatText.slice(0, maxChars) + "\n\n[... chat truncated for analysis ...]"
    : chatText;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this WhatsApp group chat export and return rich structured profiles for every member.${
            userProfile ? `\n\nADDITIONAL CONTEXT — The person running this analysis:\nName: ${userProfile.name || "Unknown"}\nLinkedIn: ${userProfile.linkedinUrl || "N/A"}\nX/Twitter: ${userProfile.twitterHandle || "N/A"}\nInstagram: ${userProfile.instagramHandle || "N/A"}\nCity: ${userProfile.city || "N/A"}\n\nWhen generating trust_activations, PRIORITIZE connections relevant to this person. Who should THEY meet from this group? Use their social profiles to infer their interests and find non-obvious matches.` : ""
          }\n\nCHAT EXPORT:\n${truncated}`,
        },
      ],
    });

    const responseText = message.content[0]?.text || "";

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return res.status(200).json({
      source: "claude",
      ...parsed,
    });
  } catch (error) {
    console.error("Analyze API error:", error);

    if (error instanceof SyntaxError) {
      return res.status(502).json({
        error: "Failed to parse Claude response as JSON",
        source: "claude",
      });
    }

    return res.status(500).json({
      error: error.message || "Analysis failed",
      source: "claude",
    });
  }
}
