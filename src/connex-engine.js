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
// DEEP SIGNAL EXTRACTORS (from WhatsApp chat data)
// ═══════════════════════════════════════════════════════════

// Extract all URLs shared in messages
export function extractSharedLinks(messages) {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const links = [];
  messages.forEach(msg => {
    const urls = msg.text.match(urlPattern) || [];
    urls.forEach(url => {
      const domain = url.match(/https?:\/\/([^/]+)/)?.[1] || "";
      let type = "other";
      if (domain.includes("linkedin.com")) type = "linkedin";
      else if (domain.includes("twitter.com") || domain.includes("x.com")) type = "twitter";
      else if (domain.includes("instagram.com")) type = "instagram";
      else if (domain.includes("spotify.com") || domain.includes("open.spotify")) type = "spotify";
      else if (domain.includes("youtube.com") || domain.includes("youtu.be")) type = "youtube";
      else if (domain.includes("github.com")) type = "github";
      else if (domain.includes("medium.com") || domain.includes("substack.com")) type = "article";
      else if (domain.includes("eventbrite.com") || domain.includes("lu.ma") || domain.includes("meetup.com")) type = "event";
      else if (domain.includes("strava.com")) type = "fitness";
      else if (domain.includes("goodreads.com")) type = "books";
      links.push({ url, domain, type, sender: msg.sender, date: msg.date });
    });
  });
  return links;
}

// Extract phone number signals
export function extractPhoneSignals(members) {
  const areaCodeMap = {
    "212": "New York", "213": "Los Angeles", "310": "Los Angeles", "323": "Los Angeles",
    "415": "San Francisco", "408": "San Jose", "650": "Silicon Valley",
    "312": "Chicago", "305": "Miami", "206": "Seattle", "512": "Austin",
    "617": "Boston", "202": "Washington DC", "404": "Atlanta", "214": "Dallas",
    "713": "Houston", "303": "Denver", "503": "Portland", "775": "Reno/Nevada",
    "805": "Santa Barbara", "818": "LA Valley", "406": "Montana",
    "703": "Northern Virginia", "610": "Philadelphia", "412": "Pittsburgh",
  };
  const countryCodeMap = {
    "+1": "US/Canada", "+44": "UK", "+852": "Hong Kong", "+65": "Singapore",
    "+66": "Thailand", "+81": "Japan", "+86": "China", "+91": "India",
    "+61": "Australia", "+49": "Germany", "+33": "France", "+971": "UAE",
    "+886": "Taiwan", "+82": "South Korea",
  };

  return members.map(m => {
    const signals = { originalCity: null, country: null, confidence: 0 };
    const name = m.name || "";
    
    // Check for phone number in member name (common in WhatsApp exports)
    const phoneMatch = name.match(/\+(\d{1,3})\s*\(?(\d{3})\)?/);
    if (phoneMatch) {
      const countryCode = "+" + phoneMatch[1];
      const areaCode = phoneMatch[2];
      if (countryCodeMap[countryCode]) {
        signals.country = countryCodeMap[countryCode];
        signals.confidence += 0.3;
      }
      if (areaCodeMap[areaCode]) {
        signals.originalCity = areaCodeMap[areaCode];
        signals.confidence += 0.4;
      }
    }
    return { member: name, ...signals };
  });
}

// Extract timing patterns → timezone and behavior
export function extractTimingPatterns(messages) {
  const memberTimings = {};
  messages.forEach(msg => {
    if (!memberTimings[msg.sender]) memberTimings[msg.sender] = { hours: [], days: [] };
    const timeMatch = msg.time?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      if (timeMatch[4]?.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (timeMatch[4]?.toUpperCase() === "AM" && hour === 12) hour = 0;
      memberTimings[msg.sender].hours.push(hour);
    }
  });

  return Object.entries(memberTimings).map(([name, data]) => {
    const avgHour = data.hours.reduce((a, b) => a + b, 0) / data.hours.length;
    const peakHours = data.hours.sort((a, b) => a - b);
    const isNightOwl = peakHours.filter(h => h >= 22 || h <= 4).length > peakHours.length * 0.3;
    const isEarlyBird = peakHours.filter(h => h >= 5 && h <= 8).length > peakHours.length * 0.3;
    
    return {
      name,
      avgHour: Math.round(avgHour),
      peakRange: `${peakHours[0] || 0}:00 - ${peakHours[peakHours.length - 1] || 23}:00`,
      style: isNightOwl ? "night_owl" : isEarlyBird ? "early_bird" : "regular",
      messageCount: data.hours.length,
    };
  });
}

// Extract emoji usage → personality fingerprint
export function extractEmojiProfile(messages) {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const memberEmojis = {};
  
  messages.forEach(msg => {
    const emojis = msg.text.match(emojiRegex) || [];
    if (!memberEmojis[msg.sender]) memberEmojis[msg.sender] = {};
    emojis.forEach(e => {
      memberEmojis[msg.sender][e] = (memberEmojis[msg.sender][e] || 0) + 1;
    });
  });

  return Object.entries(memberEmojis).map(([name, emojis]) => {
    const sorted = Object.entries(emojis).sort((a, b) => b[1] - a[1]);
    return {
      name,
      topEmojis: sorted.slice(0, 5).map(([e, c]) => ({ emoji: e, count: c })),
      totalEmojis: sorted.reduce((sum, [_, c]) => sum + c, 0),
      emojiDensity: sorted.reduce((sum, [_, c]) => sum + c, 0) / (messages.filter(m => m.sender === name).length || 1),
    };
  });
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
// RELATIONSHIP WEIGHT SCORING
// ═══════════════════════════════════════════════════════════

export function buildRelationshipGraph(parsedChat) {
  const graph = {};

  // Build directional interaction matrix
  parsedChat.messages.forEach((msg, idx) => {
    const sender = msg.sender;
    if (!graph[sender]) graph[sender] = {};

    // Look at who they're replying to (message within 5 min of previous = likely reply)
    if (idx > 0) {
      const prevMsg = parsedChat.messages[idx - 1];
      if (prevMsg.sender !== sender) {
        // Crude reply detection — sequential messages from different people
        if (!graph[sender][prevMsg.sender]) {
          graph[sender][prevMsg.sender] = { replies: 0, mentions: 0, avgDepth: 0, depths: [], lateNight: 0, mediaShared: 0 };
        }
        graph[sender][prevMsg.sender].replies++;

        // Message depth (word count)
        const wordCount = msg.text.split(/\s+/).length;
        graph[sender][prevMsg.sender].depths.push(wordCount);

        // Late night check
        const timeMatch = msg.time?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1]);
          if (timeMatch[4]?.toUpperCase() === "PM" && hour !== 12) hour += 12;
          if (timeMatch[4]?.toUpperCase() === "AM" && hour === 12) hour = 0;
          if (hour >= 23 || hour <= 4) graph[sender][prevMsg.sender].lateNight++;
        }

        // Media sharing
        if (msg.isMedia) graph[sender][prevMsg.sender].mediaShared++;
      }
    }

    // Mention detection
    const text = msg.text.toLowerCase();
    parsedChat.members.forEach(member => {
      if (member.name !== sender) {
        const firstName = member.name.toLowerCase().split(" ")[0];
        if (firstName.length > 2 && text.includes(firstName)) {
          if (!graph[sender][member.name]) {
            graph[sender][member.name] = { replies: 0, mentions: 0, avgDepth: 0, depths: [], lateNight: 0, mediaShared: 0 };
          }
          graph[sender][member.name].mentions++;
        }
      }
    });
  });

  // Calculate relationship scores
  const relationships = [];
  const processed = new Set();

  Object.entries(graph).forEach(([personA, connections]) => {
    Object.entries(connections).forEach(([personB, data]) => {
      const key = [personA, personB].sort().join("↔");
      if (processed.has(key)) return;
      processed.add(key);

      const reverseData = graph[personB]?.[personA] || { replies: 0, mentions: 0, depths: [], lateNight: 0, mediaShared: 0 };

      // Bidirectional metrics
      const totalInteractions = data.replies + reverseData.replies + data.mentions + reverseData.mentions;
      const allDepths = [...data.depths, ...reverseData.depths];
      const avgDepth = allDepths.length > 0 ? allDepths.reduce((a, b) => a + b, 0) / allDepths.length : 0;
      const lateNightTotal = data.lateNight + reverseData.lateNight;
      const mediaTotal = data.mediaShared + reverseData.mediaShared;
      const isBidirectional = data.replies > 0 && reverseData.replies > 0;

      // Response speed — check time gaps between sequential messages
      let responseSpeedScore = 0;
      for (let i = 1; i < parsedChat.messages.length; i++) {
        const prev = parsedChat.messages[i - 1];
        const curr = parsedChat.messages[i];
        if ((prev.sender === personA && curr.sender === personB) ||
            (prev.sender === personB && curr.sender === personA)) {
          // Parse times for rough gap estimation
          const parseHour = (t) => {
            const m = t?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
            if (!m) return null;
            let h = parseInt(m[1]);
            if (m[4]?.toUpperCase() === "PM" && h !== 12) h += 12;
            if (m[4]?.toUpperCase() === "AM" && h === 12) h = 0;
            return h * 60 + parseInt(m[2]);
          };
          const t1 = parseHour(prev.time);
          const t2 = parseHour(curr.time);
          if (t1 !== null && t2 !== null) {
            const gap = Math.abs(t2 - t1);
            if (gap <= 5) responseSpeedScore += 3;      // Within 5 min = very engaged
            else if (gap <= 30) responseSpeedScore += 1; // Within 30 min = normal
          }
        }
      }

      // Informal language detection (crude: emoji + lowercase + short msgs + slang)
      const allMsgsA = parsedChat.messages.filter(m => m.sender === personA).map(m => m.text);
      const allMsgsB = parsedChat.messages.filter(m => m.sender === personB).map(m => m.text);
      const informalScore = (msgs) => {
        let score = 0;
        msgs.forEach(t => {
          if (/😂|🤣|💀|lmao|lol|haha|omg|bruh|dude|bro/i.test(t)) score += 2;
          if (t === t.toLowerCase() && t.length < 50) score += 0.5;
        });
        return score;
      };
      const informalityAB = informalScore(allMsgsA) + informalScore(allMsgsB);

      // Weighted score
      let strength = 0;
      strength += Math.min(totalInteractions * 3, 25);          // Interaction volume (max 25)
      strength += isBidirectional ? 12 : 0;                     // Two-way conversation (12)
      strength += Math.min(avgDepth * 0.5, 12);                 // Message depth (max 12)
      strength += Math.min(lateNightTotal * 5, 12);             // Late night = closeness (max 12)
      strength += Math.min(mediaTotal * 4, 10);                 // Media sharing (max 10)
      strength += Math.min((data.mentions + reverseData.mentions) * 3, 10); // Mentions (max 10)
      strength += Math.min(responseSpeedScore, 10);             // Response speed (max 10)
      strength += Math.min(informalityAB, 9);                   // Informal/casual tone (max 9)

      relationships.push({
        personA,
        personB,
        strength: Math.min(Math.round(strength), 100),
        interactions: totalInteractions,
        bidirectional: isBidirectional,
        avgMessageDepth: Math.round(avgDepth),
        lateNightMessages: lateNightTotal,
        mediaShared: mediaTotal,
        responseSpeed: responseSpeedScore > 5 ? "fast" : responseSpeedScore > 2 ? "normal" : "slow",
        informality: informalityAB > 5 ? "casual" : "formal",
        label: strength >= 60 ? "strong" : strength >= 30 ? "moderate" : "weak",
      });
    });
  });

  return relationships.sort((a, b) => b.strength - a.strength);
}

// ═══════════════════════════════════════════════════════════
// CONTACT PRIORITIZATION (Pass 1: Who's worth a deep dive?)
// ═══════════════════════════════════════════════════════════

export function prioritizeContacts(profiles, userProfile, deepSignals) {
  // Score each contact on likelihood of meaningful connection
  return profiles.map(profile => {
    let priority = 0;
    const signals = [];

    // 1. Activity level — more messages = more data to work with
    if (profile.activity_level === "high") { priority += 20; signals.push("Very active in group"); }
    else if (profile.activity_level === "medium") { priority += 10; signals.push("Moderately active"); }
    else { priority += 2; }

    // 2. Social capital — mentioned by others = respected/valued
    if (profile.mentioned_by?.length >= 3) { priority += 25; signals.push(`Referenced by ${profile.mentioned_by.length} people — high social capital`); }
    else if (profile.mentioned_by?.length >= 1) { priority += 10; signals.push(`Referenced by ${profile.mentioned_by.length} people`); }

    // 3. Interest overlap with user
    if (userProfile) {
      const userInterests = (userProfile.interests || []).map(i => i.toLowerCase());
      const theirInterests = profile.interests?.flatMap(i => [i.category, ...(i.keywords || [])]) || [];
      const overlap = userInterests.filter(ui => theirInterests.some(ti => ti.toLowerCase().includes(ui) || ui.includes(ti.toLowerCase())));
      if (overlap.length > 0) {
        priority += overlap.length * 10;
        signals.push(`Shared interests: ${overlap.join(", ")}`);
      }
    }

    // 4. Location proximity
    if (userProfile?.city && profile.location?.primary) {
      const userCity = normLoc(userProfile.city);
      const theirCity = normLoc(profile.location.primary);
      if (userCity && theirCity && userCity.toLowerCase() === theirCity.toLowerCase()) {
        priority += 20;
        signals.push(`Same city: ${userCity}`);
      }
    }

    // 5. Shared links — people who share content are more interesting
    if (deepSignals?.sharedLinks) {
      const theirLinks = deepSignals.sharedLinks.filter(l => l.sender === profile.display_name);
      if (theirLinks.length > 0) {
        priority += theirLinks.length * 3;
        const types = [...new Set(theirLinks.map(l => l.type).filter(t => t !== "other"))];
        if (types.length > 0) signals.push(`Shares: ${types.join(", ")}`);
      }
    }

    // 6. Connector potential — mentions many others = well-connected
    if (profile.mentions?.length >= 3) {
      priority += 10;
      signals.push(`Connects with ${profile.mentions.length} members — potential bridge`);
    }

    // 7. Phone signals — if from same area/country
    if (deepSignals?.phoneSignals) {
      const phoneData = deepSignals.phoneSignals.find(p => p.member === profile.display_name);
      if (phoneData?.originalCity) {
        priority += 5;
        signals.push(`Phone: ${phoneData.originalCity} area`);
      }
    }

    // 8. Message count — minimum threshold for meaningful profiling
    if (profile.message_count < 3) {
      priority = Math.min(priority, 10);
      signals.push("⚠️ Low messages — limited data for profiling");
    }

    return {
      name: profile.display_name,
      priority: Math.min(priority, 100),
      tier: priority >= 40 ? "deep_dive" : priority >= 20 ? "worth_checking" : "low_priority",
      signals,
      messageCount: profile.message_count,
      profile,
    };
  })
  .sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════════
// 2ND DEGREE NETWORK MATCHING
// ═══════════════════════════════════════════════════════════

export function matchMyProfile(myProfile, groupProfiles) {
  // myProfile: { name, city, interests: [], expertise: [], looking_for: [], offering: [], affinities: {} }
  // groupProfiles: enriched profiles from a friend's group chat
  
  const matches = groupProfiles.map(profile => {
    let score = 0;
    const reasons = [];

    // Shared interests (0.25)
    const myInterests = (myProfile.interests || []).map(i => i.toLowerCase());
    const theirInterests = profile.interests.flatMap(i => i.keywords || [i.category]);
    const sharedInterests = myInterests.filter(i => theirInterests.some(t => t.toLowerCase().includes(i) || i.includes(t.toLowerCase())));
    if (sharedInterests.length > 0) {
      score += Math.min(sharedInterests.length * 0.08, 0.25);
      reasons.push(`Shared interests: ${sharedInterests.join(', ')}`);
    }

    // Complementary needs/offers (0.30)
    const myNeeds = (myProfile.looking_for || []).map(n => n.toLowerCase());
    const theirOffers = (profile.interests || []).map(i => i.category);
    const myOffers = (myProfile.offering || []).map(o => o.toLowerCase());
    const theirNeeds = []; // Can't extract needs from keyword engine alone — Brain API does this

    const needsMatch = myNeeds.filter(n => theirOffers.some(o => o.includes(n) || n.includes(o)));
    if (needsMatch.length > 0) {
      score += Math.min(needsMatch.length * 0.15, 0.30);
      reasons.push(`They might help with: ${needsMatch.join(', ')}`);
    }

    // Geographic proximity (0.20)
    const myCity = normLoc(myProfile.city);
    const theirCity = normLoc(profile.location?.primary);
    if (myCity && theirCity && myCity.toLowerCase() === theirCity.toLowerCase()) {
      score += 0.20;
      reasons.push(`Both in ${myCity}`);
    }

    // Industry overlap (0.15)
    const myExpertise = (myProfile.expertise || []).map(e => e.toLowerCase());
    const theirExpertise = profile.interests.map(i => i.category);
    const expertiseOverlap = myExpertise.filter(e => theirExpertise.some(t => t.includes(e) || e.includes(t)));
    if (expertiseOverlap.length > 0) {
      score += Math.min(expertiseOverlap.length * 0.08, 0.15);
      reasons.push(`Industry overlap: ${expertiseOverlap.join(', ')}`);
    }

    // Affinity match (0.10)
    const myAffinities = Object.values(myProfile.affinities || {}).flat().map(a => a.toLowerCase());
    const theirAffinities = Object.values(profile.affinities || {}).flat().map(a => a.toLowerCase());
    const sharedAffinities = myAffinities.filter(a => theirAffinities.includes(a));
    if (sharedAffinities.length > 0) {
      score += Math.min(sharedAffinities.length * 0.05, 0.10);
      reasons.push(`Shared vibes: ${sharedAffinities.join(', ')}`);
    }

    return {
      name: profile.display_name,
      score: Math.round(score * 100),
      reasons,
      profile,
      introMessage: generateIntroRequest(myProfile.name, profile.display_name, reasons),
    };
  });

  return matches
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function generateIntroRequest(myName, theirName, reasons) {
  const reasonText = reasons.slice(0, 2).join(' and ');
  return `Hey! Would you mind introducing me to ${theirName}? ${reasonText}. Would love to connect!`;
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

  // Deep signal extraction
  const deepSignals = {
    sharedLinks: extractSharedLinks(parsedChat.messages),
    phoneSignals: extractPhoneSignals(parsedChat.members),
    timingPatterns: extractTimingPatterns(parsedChat.messages),
    emojiProfiles: extractEmojiProfile(parsedChat.messages),
    relationshipGraph: buildRelationshipGraph(parsedChat),
  };

  return { parsedChat, profiles, analysis, suggestions, dmStrategy, deepSignals };
}
