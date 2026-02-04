/**
 * Connex Engine — WhatsApp Chat Analysis Pipeline
 * Browser-compatible, zero dependencies
 */

// ═══════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════

export function parseWhatsAppText(textContent) {
  const MESSAGE_PATTERNS = [
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\]\s*([^:]+):\s*(.+)$/i,
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s*-\s*([^:]+):\s*(.+)$/i,
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.+)$/i,
    /^(\d{4}-\d{2}-\d{2}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.+)$/i,
  ];
  const SYSTEM_PATTERNS = [/created group/i, /added/i, /left/i, /removed/i, /changed the subject/i, /changed this group's icon/i, /messages and calls are end-to-end encrypted/i, /your security code/i, /disappeared/i];
  const content = textContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = content.split("\n");
  const messages = [];
  const members = new Map();
  let currentMessage = null;
  for (const line of lines) {
    let matched = false;
    for (const pattern of MESSAGE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        if (currentMessage) messages.push(currentMessage);
        const [_, date, time, sender, text] = match;
        const isSystem = SYSTEM_PATTERNS.some((p) => p.test(text));
        if (!isSystem) {
          const trimmedSender = sender.trim();
          if (!members.has(trimmedSender)) {
            members.set(trimmedSender, { name: trimmedSender, messageCount: 0, firstSeen: date, lastSeen: date, messages: [] });
          }
          const member = members.get(trimmedSender);
          member.messageCount++;
          member.lastSeen = date;
          currentMessage = { date, time, sender: trimmedSender, text, isMedia: text.includes("<Media omitted>") || text.includes("omitted") };
          member.messages.push(currentMessage);
        } else { currentMessage = null; }
        matched = true;
        break;
      }
    }
    if (!matched && currentMessage && line.trim()) { currentMessage.text += "\n" + line; }
  }
  if (currentMessage) messages.push(currentMessage);
  return { messages, members: Array.from(members.values()), stats: { totalMessages: messages.length, totalMembers: members.size, dateRange: { start: messages[0]?.date, end: messages[messages.length - 1]?.date } } };
}

// ═══════════════════════════════════════════════════════════
// EXTRACTORS
// ═══════════════════════════════════════════════════════════

function extractLocation(messages) {
  const cities = ["bangkok","singapore","hong kong","hk","sg","bkk","los angeles","la","san francisco","sf","new york","nyc","london","tokyo","dubai","paris","berlin","sydney","melbourne","toronto","seattle","austin","miami","chicago","denver","portland","boston","atlanta","dallas","houston","dc","washington"];
  const location = { cities: [], mentions: [], confidence: 0.0 };
  const allText = messages.map((m) => m.text.toLowerCase()).join(" ");
  cities.forEach((city) => { if (allText.includes(city)) { location.cities.push(city); location.confidence += 0.3; } });
  if (location.cities.length > 0) {
    const cityCount = {};
    location.cities.forEach((city) => (cityCount[city] = (cityCount[city] || 0) + 1));
    location.primary = Object.keys(cityCount).reduce((a, b) => (cityCount[a] > cityCount[b] ? a : b));
  }
  return location;
}

function extractInterests(messages) {
  const interestKeywords = {
    sports: ["ufc","mma","warriors","basketball","golf","football","soccer","tennis","gym","workout","nba","nfl","boxing"],
    crypto: ["bitcoin","btc","ethereum","crypto","trading","blockchain","nft","defi","solana","web3"],
    food: ["dim sum","restaurant","brunch","dinner","thai food","sushi","ramen","coffee","cocktails","lunch","bar","drinks"],
    wellness: ["sauna","ice bath","massage","spa","wellness","yoga","meditation","mindfulness","recovery"],
    tech: ["ai","startup","coding","engineering","product","developer","software","app","llm","gpt","claude"],
    business: ["fundraising","investor","funding","strategy","revenue","growth","pitch","deal","vc","equity"],
    travel: ["flight","airport","hotel","trip","vacation","traveling","passport","airline"],
    music: ["concert","festival","spotify","playlist","dj","music","band","show","tickets"],
  };
  const interests = [];
  const allText = messages.map((m) => m.text.toLowerCase()).join(" ");
  Object.entries(interestKeywords).forEach(([category, keywords]) => {
    const matches = keywords.filter((kw) => allText.includes(kw));
    if (matches.length > 0) interests.push({ category, keywords: matches, confidence: Math.min(matches.length / keywords.length, 1) });
  });
  return interests.sort((a, b) => b.confidence - a.confidence);
}

function extractAffinities(messages) {
  const patterns = { sports_teams: ["warriors","niners","49ers","lakers","celtics","yankees","chiefs"], food_types: ["dim sum","sushi","thai","ramen","pizza","tacos","bbq","korean"], activities: ["golf","sauna","cycling","hiking","surfing","climbing","running","poker"] };
  const affinities = {};
  const allText = messages.map((m) => m.text.toLowerCase()).join(" ");
  Object.entries(patterns).forEach(([type, items]) => {
    const matches = items.filter((item) => allText.includes(item));
    if (matches.length > 0) affinities[type] = matches;
  });
  return affinities;
}

function calculateActivityLevel(member, parsedChat) {
  const ratio = member.messageCount / Math.max(parsedChat.stats.totalMessages, 1);
  return ratio > 0.15 ? "high" : ratio > 0.05 ? "medium" : "low";
}

function findMentions(memberName, allMessages) {
  const mentions = new Set();
  const memberMessages = allMessages.filter((m) => m.sender === memberName);
  const otherNames = [...new Set(allMessages.map((m) => m.sender))].filter((n) => n !== memberName);
  memberMessages.forEach((msg) => {
    const text = msg.text.toLowerCase();
    otherNames.forEach((name) => {
      const first = name.toLowerCase().split(" ")[0];
      if (first.length > 2 && text.includes(first)) mentions.add(name);
    });
  });
  return [...mentions];
}

function findMentionedBy(memberName, allMessages) {
  const mentionedBy = new Set();
  const nameVariations = [memberName.toLowerCase(), memberName.toLowerCase().split(" ")[0]].filter((n) => n.length > 2);
  allMessages.forEach((msg) => {
    if (msg.sender !== memberName) {
      const text = msg.text.toLowerCase();
      if (nameVariations.some((n) => text.includes(n))) mentionedBy.add(msg.sender);
    }
  });
  return [...mentionedBy];
}

// ═══════════════════════════════════════════════════════════
// PROFILE ENRICHMENT
// ═══════════════════════════════════════════════════════════

export function enrichProfiles(parsedChat) {
  return parsedChat.members.map((member) => ({
    id: member.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    source_name: member.name,
    display_name: member.name,
    message_count: member.messageCount,
    first_seen: member.firstSeen,
    last_seen: member.lastSeen,
    location: extractLocation(member.messages),
    interests: extractInterests(member.messages),
    affinities: extractAffinities(member.messages),
    activity_level: calculateActivityLevel(member, parsedChat),
    mentions: findMentions(member.name, parsedChat.messages),
    mentioned_by: findMentionedBy(member.name, parsedChat.messages),
  }));
}

// ═══════════════════════════════════════════════════════════
// NETWORK ANALYSIS
// ═══════════════════════════════════════════════════════════

export function analyzeNetwork(profiles) {
  const metrics = profiles.map((p) => ({
    id: p.id, name: p.display_name, messageCount: p.message_count,
    inDegree: p.mentioned_by.length, outDegree: p.mentions.length,
    totalConnections: p.mentioned_by.length + p.mentions.length,
    location: p.location?.primary, activityLevel: p.activity_level,
  }));
  return {
    hubs: metrics.filter((n) => n.inDegree > 0).sort((a, b) => b.inDegree - a.inDegree),
    connectors: metrics.filter((n) => n.outDegree > 0).sort((a, b) => b.outDegree - a.outDegree),
    lurkers: metrics.filter((n) => n.messageCount < 5),
    nodeMetrics: metrics.sort((a, b) => b.messageCount - a.messageCount),
  };
}

// ═══════════════════════════════════════════════════════════
// LOCATION HELPERS
// ═══════════════════════════════════════════════════════════

const LOC_MAP = { bkk:"Bangkok",bangkok:"Bangkok",sg:"Singapore",singapore:"Singapore",hk:"Hong Kong","hong kong":"Hong Kong",la:"Los Angeles","los angeles":"Los Angeles",sf:"San Francisco","san francisco":"San Francisco",nyc:"New York","new york":"New York",london:"London",tokyo:"Tokyo",dubai:"Dubai",paris:"Paris",berlin:"Berlin",sydney:"Sydney",melbourne:"Melbourne",toronto:"Toronto",seattle:"Seattle",austin:"Austin",miami:"Miami",chicago:"Chicago",denver:"Denver",portland:"Portland",boston:"Boston",atlanta:"Atlanta",dallas:"Dallas",houston:"Houston",dc:"Washington DC",washington:"Washington DC" };

export function normLoc(loc) { return loc ? (LOC_MAP[loc.toLowerCase()] || loc) : null; }

// ═══════════════════════════════════════════════════════════
// SMART SUGGESTIONS
// ═══════════════════════════════════════════════════════════

export function generateSuggestions(profiles) {
  const suggestions = [];
  const locationGroups = {};
  profiles.forEach((p) => {
    const loc = normLoc(p.location?.primary);
    if (loc) { if (!locationGroups[loc]) locationGroups[loc] = []; locationGroups[loc].push(p); }
  });
  Object.entries(locationGroups).forEach(([loc, members]) => {
    if (members.length >= 2) {
      const allInterests = new Set();
      members.forEach((m) => m.interests.forEach((i) => allInterests.add(i.category)));
      allInterests.forEach((interest) => {
        const group = members.filter((m) => m.interests.some((i) => i.category === interest));
        if (group.length >= 2) {
          const confidence = Math.min(0.5 + (group.length - 1) * 0.12, 0.95);
          const emoji = { sports:"🏆",crypto:"₿",food:"🍜",wellness:"🧘",tech:"💻",business:"📊",travel:"✈️",music:"🎵" };
          const titles = { sports:"Sports Watch Party",crypto:"Crypto Discussion",food:"Food Meetup",wellness:"Wellness Session",tech:"Tech Networking",business:"Business Lunch",travel:"Travel Crew",music:"Music Night" };
          suggestions.push({
            id: `${loc}-${interest}`,
            type: `${loc} ${titles[interest] || interest + " Meetup"}`,
            emoji: emoji[interest] || "📋",
            participants: group.map((m) => m.display_name),
            location: loc,
            activity: interest,
            reason: `${group.length} people in ${loc} into ${interest}`,
            confidence: Math.round(confidence * 100),
          });
        }
      });
    }
  });
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

// ═══════════════════════════════════════════════════════════
// DM STRATEGY
// ═══════════════════════════════════════════════════════════

export function getDMStrategy(profiles) {
  const ranked = [...profiles].sort((a, b) => {
    const s = (p) => p.message_count * 0.4 + p.mentioned_by.length * 3 + p.mentions.length * 2 + (p.activity_level === "high" ? 10 : p.activity_level === "medium" ? 5 : 0);
    return s(b) - s(a);
  });
  return ranked.slice(0, 5).map((p, i) => {
    const reasons = [];
    if (p.activity_level === "high") reasons.push("Very active in group");
    if (p.mentioned_by.length > 0) reasons.push(`Referenced by ${p.mentioned_by.length} others`);
    if (p.mentions.length > 0) reasons.push(`Engages with ${p.mentions.length} members`);
    if (p.interests.length > 0) reasons.push(`Into: ${p.interests.slice(0, 3).map((i) => i.category).join(", ")}`);
    const loc = normLoc(p.location?.primary);
    if (loc) reasons.push(`Based in ${loc}`);
    return { rank: i + 1, name: p.display_name, reasons, profile: p };
  });
}

// ═══════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════

export function runPipeline(chatText) {
  const parsedChat = parseWhatsAppText(chatText);
  if (parsedChat.stats.totalMessages === 0) return null;
  const profiles = enrichProfiles(parsedChat);
  const analysis = analyzeNetwork(profiles);
  const suggestions = generateSuggestions(profiles);
  const dmStrategy = getDMStrategy(profiles);
  return { parsedChat, profiles, analysis, suggestions, dmStrategy };
}
