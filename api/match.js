import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the Connex Brain — an expert at matching people across networks for warm introductions.

You'll receive:
1. MY PROFILE — who I am, what I'm into, what I need
2. GROUP CHAT — a WhatsApp export from a friend's group

Your job: Analyze the group, profile every member, then MATCH them against my profile.

Return JSON with this structure:
{
  "matches": [
    {
      "name": "Person Name",
      "score": 85,
      "role": "What they do",
      "city": "Where they are",
      "why_connect": "2-3 sentence explanation of why we'd click",
      "shared_interests": ["specific shared interests"],
      "complementary": "What they offer that I need, or vice versa",
      "conversation_starter": "A specific topic we could bond over",
      "intro_request": "Pre-written message I can send to our mutual friend asking for the intro",
      "intro_message": "Pre-written message the connector can forward to introduce us"
    }
  ],
  "group_context": {
    "group_name": "Name of the group",
    "total_members": 0,
    "key_themes": ["What this group is about"],
    "connector_role": "Who the connector (my friend) is in this group"
  },
  "strategy": "Brief paragraph on how to approach these intros — timing, order, any tips"
}

RULES:
1. Return ONLY valid JSON
2. Score 0-100 based on: shared interests (25%), complementary needs (30%), same city (20%), industry overlap (15%), shared affinities (10%)
3. Only include people with score > 20
4. Rank by score descending, max 10 matches
5. Be creative with inference — read between the lines of chat messages
6. intro_request should feel natural, not robotic
7. intro_message should highlight mutual value — why BOTH people benefit
8. conversation_starter should be specific, not generic`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { myProfile, chatText } = req.body;

  if (!myProfile || !chatText) {
    return res.status(400).json({ error: "myProfile and chatText are required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const maxChars = 80000;
  const truncated = chatText.length > maxChars
    ? chatText.slice(0, maxChars) + "\n\n[... chat truncated for analysis ...]"
    : chatText;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userMessage = `MY PROFILE:
Name: ${myProfile.name}
City: ${myProfile.city || "Not specified"}
Interests: ${(myProfile.interests || []).join(", ")}
Expertise: ${(myProfile.expertise || []).join(", ")}
Looking for: ${(myProfile.looking_for || []).join(", ")}
I can offer: ${(myProfile.offering || []).join(", ")}
Affinities: ${JSON.stringify(myProfile.affinities || {})}

FRIEND'S GROUP CHAT:
${truncated}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const responseText = message.content[0]?.text || "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    return res.status(200).json({ source: "claude", ...parsed });
  } catch (error) {
    console.error("Match API error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "Failed to parse response as JSON", source: "claude" });
    }
    return res.status(500).json({ error: error.message || "Matching failed", source: "claude" });
  }
}
