import { useState, useCallback, useRef } from "react";
import { runPipeline, normLoc, parseWhatsAppText, enrichProfiles, analyzeNetwork, generateSuggestions, getDMStrategy, extractSharedLinks, extractPhoneSignals, extractTimingPatterns, extractEmojiProfile, prioritizeContacts, buildRelationshipGraph, extractIntents, extractEndorsements, extractSelfDisclosures, generateSearchQueries } from "./connex-engine.js";
import SecondDegreeMatcher from "./SecondDegreeMatcher.jsx";
import ProfileBuilder from "./ProfileBuilder.jsx";
import BrainDashboard from "./BrainDashboard.jsx";
import { API_BASE } from "./config.js";

// Engine imported from connex-engine.js — offline fallback
// API endpoint at /api/analyze — Claude-powered Brain analysis

// ═══════════════════════════════════════════════════════════
// BRAIN → ENGINE BRIDGE
// ═══════════════════════════════════════════════════════════
// Converts Claude Brain profiles into the format the existing
// UI + suggestion/network/DM pipeline expects.

function bridgeBrainProfiles(brainProfiles, parsedChat) {
  const INTEREST_CATEGORIES = ["sports","crypto","food","wellness","tech","business","travel","music"];

  return brainProfiles.map((bp) => {
    // Find matching parsed member for message counts
    const member = parsedChat.members.find((m) => m.name === bp.name) || {};

    // Convert Brain interests array to engine format [{category, keywords, confidence}]
    const interests = [];
    const brainInterests = bp.interests || [];
    INTEREST_CATEGORIES.forEach((cat) => {
      const matches = brainInterests.filter((i) => i.toLowerCase().includes(cat) || cat.includes(i.toLowerCase().split(" ")[0]));
      if (matches.length > 0) {
        interests.push({ category: cat, keywords: matches, confidence: 0.8 });
      }
    });
    // Add any interests that didn't match a category as their own
    const mappedKeywords = new Set(interests.flatMap((i) => i.keywords));
    const unmapped = brainInterests.filter((i) => !mappedKeywords.has(i));
    if (unmapped.length > 0 && interests.length === 0) {
      // Best-effort: map to "tech" if AI/startup related, etc.
      interests.push({ category: "general", keywords: unmapped, confidence: 0.7 });
    }

    // Convert Brain affinities object to engine format
    const affinities = {};
    if (bp.affinities) {
      if (bp.affinities.sports?.length) affinities.sports_teams = bp.affinities.sports;
      if (bp.affinities.food?.length) affinities.food_types = bp.affinities.food;
      if (bp.affinities.other?.length) affinities.activities = bp.affinities.other;
    }

    // Determine activity level from Brain score
    const score = bp.activity_score ?? 0;
    const activity_level = score > 0.6 ? "high" : score > 0.3 ? "medium" : "low";

    // Location bridge
    const location = {
      cities: bp.location?.city ? [bp.location.city.toLowerCase()] : [],
      mentions: [],
      confidence: bp.location?.city ? 0.9 : 0,
      primary: bp.location?.city?.toLowerCase() || null,
    };

    return {
      // Standard engine fields
      id: bp.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      source_name: bp.name,
      display_name: bp.name,
      message_count: member.messageCount || 0,
      first_seen: member.firstSeen || null,
      last_seen: member.lastSeen || null,
      location,
      interests,
      affinities,
      activity_level,
      mentions: member.messages ? [] : [], // Will be filled by engine if needed
      mentioned_by: [],
      // Brain-enriched fields (new)
      brain: {
        role: bp.role,
        company: bp.company,
        industry: bp.industry,
        expertise: bp.expertise || [],
        looking_for: bp.looking_for || [],
        offering: bp.offering || [],
        personality_notes: bp.personality_notes,
        context_sources: bp.context_sources || [],
        location_detail: bp.location || {},
      },
    };
  });
}

// Fill in mentions from the parsed chat for Brain profiles
function fillMentions(profiles, parsedChat) {
  const allMessages = parsedChat.messages;
  profiles.forEach((p) => {
    const memberMsgs = allMessages.filter((m) => m.sender === p.display_name);
    const otherNames = [...new Set(allMessages.map((m) => m.sender))].filter((n) => n !== p.display_name);
    const mentions = new Set();
    memberMsgs.forEach((msg) => {
      const text = msg.text.toLowerCase();
      otherNames.forEach((name) => {
        const first = name.toLowerCase().split(" ")[0];
        if (first.length > 2 && text.includes(first)) mentions.add(name);
      });
    });
    p.mentions = [...mentions];

    const mentionedBy = new Set();
    const nameVariations = [p.display_name.toLowerCase(), p.display_name.toLowerCase().split(" ")[0]].filter((n) => n.length > 2);
    allMessages.forEach((msg) => {
      if (msg.sender !== p.display_name) {
        const text = msg.text.toLowerCase();
        if (nameVariations.some((n) => text.includes(n))) mentionedBy.add(msg.sender);
      }
    });
    p.mentioned_by = [...mentionedBy];
  });
  return profiles;
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY COORDINATOR
// ═══════════════════════════════════════════════════════════

const ACTIVITY_TYPES = [
  { id: "ufc", emoji: "🥊", label: "UFC Watch Party", tpl: (l, n) => `🥊 *UFC Watch Party — ${l}*\n\nHey ${n}! Let's catch the next UFC card together.\n\n📅 When works?\n• This Saturday\n• Next Saturday\n• Other (reply below)\n\n📍 Sports bar in ${l} — suggestions welcome!\n\nWho's in? 👊` },
  { id: "dimsum", emoji: "🍜", label: "Dim Sum / Food Meetup", tpl: (l, n) => `🍜 *${l} Food Meetup*\n\nHey ${n}! Let's do dim sum (or whatever sounds good).\n\n📅 When works?\n• Weekend brunch\n• Weeknight dinner\n• Other\n\n📍 ${l} — drop your favorite spots!\n\nReply with your pick 🍽️` },
  { id: "crypto", emoji: "₿", label: "Crypto Discussion", tpl: (l, n) => `₿ *${l} Crypto Discussion*\n\nHey ${n}! Let's meet up and talk crypto, markets, and what's next.\n\n📅 When works?\n• Weeknight evening\n• Weekend afternoon\n• Coffee this week\n\n📍 ${l} café or co-working space\n\nWho's in? 📈` },
  { id: "coworking", emoji: "💻", label: "Co-working / Tech", tpl: (l, n) => `💻 *${l} Tech Co-working Day*\n\nHey ${n}! Let's grab a space, hack on projects, swap ideas.\n\n📅 When works?\n• This week\n• Next week\n• Weekend session\n\n📍 ${l} — know any good spots?\n\nLet's build 🚀` },
  { id: "wellness", emoji: "🧘", label: "Wellness Session", tpl: (l, n) => `🧘 *${l} Wellness Session*\n\nHey ${n}! Group wellness day — sauna, ice bath, yoga, whatever works.\n\n📅 When free?\n• This weekend\n• Next weekend\n• Weekday evening\n\n📍 ${l} — I'll research the best spots!\n\nWho needs this? 🙌` },
  { id: "golf", emoji: "⛳", label: "Golf Outing", tpl: (l, n) => `⛳ *${l} Golf Outing*\n\nHey ${n}! Let's hit the course.\n\n📅 When works?\n• Saturday AM\n• Sunday AM\n• Weekday\n\n📍 ${l} — course preferences?\n\nAll levels welcome! 🏌️` },
  { id: "coffee", emoji: "☕", label: "Business Coffee", tpl: (l, n) => `☕ *${l} Business Coffee*\n\nHey ${n}! Let's grab coffee and catch up on projects.\n\n📅 When works?\n• Morning this week\n• Afternoon\n• Lunch\n\n📍 ${l} — café suggestions?\n\nCasual & productive ☕` },
  { id: "music", emoji: "🎵", label: "Music Night", tpl: (l, n) => `🎵 *${l} Music Night*\n\nHey ${n}! Let's check out live music together.\n\n📅 When?\n• This weekend\n• Next weekend\n• Weeknight\n\n📍 ${l} — anyone know what's playing?\n\nLet's go! 🎶` },
];

const INTEREST_TO_ACTIVITY = { sports:"ufc", crypto:"crypto", food:"dimsum", wellness:"wellness", tech:"coworking", business:"coffee", travel:"coffee", music:"music" };

// ═══════════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════════

const SAMPLE_CHAT = `[1/15/26, 9:02:31 AM] Mike Chen: Anyone watching the UFC fights this weekend? I'm in Bangkok
[1/15/26, 9:05:12 AM] Sarah Kim: Yes! I'm in BKK too. Let's find a sports bar
[1/15/26, 9:08:44 AM] James Liu: I'm flying to Bangkok next week. Count me in for anything crypto or tech related
[1/15/26, 9:12:01 AM] Priya Sharma: The Warriors game last night was insane. Anyone else follow basketball?
[1/15/26, 9:15:33 AM] Mike Chen: Priya you should come to Bangkok! Great dim sum spots here. Sarah knows the best ones
[1/15/26, 9:18:22 AM] Sarah Kim: Yes! Let's do dim sum this weekend. I also found an amazing sauna and ice bath place
[1/15/26, 9:22:45 AM] Alex Wong: I'm based in Singapore but visiting BKK next month. Into the crypto scene and AI startups
[1/15/26, 9:25:11 AM] James Liu: Alex we should definitely connect on crypto. I've been trading bitcoin and ethereum lately
[1/15/26, 9:28:33 AM] Priya Sharma: I'm in Singapore too! Would love a wellness session - yoga or meditation anyone?
[1/15/26, 9:31:55 AM] Tom Hayes: Late to the party but I'm in Hong Kong. Golf anyone? Also following the crypto trading scene
[1/15/26, 9:35:17 AM] Mike Chen: Tom I played golf in HK last month! Great courses there
[1/15/26, 9:38:44 AM] Sarah Kim: Who's into the startup scene? I'm building an AI product and would love feedback
[1/15/26, 9:42:01 AM] Alex Wong: Sarah that's awesome! I'm working on a blockchain startup in Singapore. Let's do a tech networking dinner
[1/15/26, 9:45:33 AM] James Liu: The investor funding landscape for AI is wild right now. Anyone doing fundraising?
[1/15/26, 9:48:22 AM] Priya Sharma: James yes! We're in the middle of a funding round. Would love strategy advice
[1/15/26, 9:52:45 AM] Tom Hayes: I know some investors in HK. Happy to make introductions. Also there's a great concert next week
[1/15/26, 9:55:11 AM] Mike Chen: Let's plan something for when everyone's in town. UFC watch party plus dim sum? Bangkok crew let's go
[1/15/26, 9:58:33 AM] Sarah Kim: I'll find the venue. Mike, bring the crew. Let's also do an ice bath recovery session after
[1/15/26, 10:02:01 AM] Alex Wong: Singapore crew - Priya let's do sushi and talk wellness and coding
[1/15/26, 10:05:22 AM] Priya Sharma: Yes Alex! There's a great ramen spot near my office too
[1/15/26, 10:08:44 AM] Tom Hayes: HK is lonely over here haha. But seriously the golf and crypto combo is unbeatable
[1/15/26, 10:12:01 AM] James Liu: Tom I'll be in Hong Kong in February. Let's do golf and crypto discussion
[1/15/26, 10:15:33 AM] Mike Chen: This group is the best. Everyone's into something interesting. Let's make these meetups happen!`;

// ═══════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════

const C = {
  bg: "#0a0a0f", card: "#12121a", border: "#1e1e2e",
  accent: "#6366f1", accentSoft: "#6366f120",
  green: "#22c55e", greenSoft: "#22c55e20", yellow: "#eab308", yellowSoft: "#eab30820",
  red: "#ef4444", cyan: "#06b6d4", cyanSoft: "#06b6d420", orange: "#f97316",
  text: "#e2e2ef", textMuted: "#8888a0", textDim: "#55556a",
};
const IE = { sports:"🏆",crypto:"₿",food:"🍜",wellness:"🧘",tech:"💻",business:"📊",travel:"✈️",music:"🎵" };

function ActivityBadge({ level }) {
  const color = level === "high" ? C.green : level === "medium" ? C.yellow : C.textDim;
  const bg = level === "high" ? C.greenSoft : level === "medium" ? C.yellowSoft : C.border + "40";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: bg, color }}>● {level}</span>;
}

function ConfBar({ value }) {
  const color = value >= 70 ? C.green : value >= 50 ? C.yellow : C.textMuted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", flex: 1 }}><div style={{ height: "100%", borderRadius: 3, width: `${value}%`, background: color, transition: "width 0.6s" }} /></div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 32 }}>{value}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════

export default function ConnexApp() {
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("overview");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expProfile, setExpProfile] = useState(null);
  
  // Mode toggle: "group" = analyze a group | "2nd_degree" = find YOUR matches
  const [mode, setMode] = useState(null); // null = mode selector, "group" | "2nd_degree"
  const [analysisMode, setAnalysisMode] = useState(null); // "claude" | "offline"
  const [processingStatus, setProcessingStatus] = useState("");
  const [groupInsights, setGroupInsights] = useState(null);
  const [trustActivations, setTrustActivations] = useState([]);

  // User profile state (optional enrichment)
  const [userLinkedin, setUserLinkedin] = useState("");
  const [userTwitter, setUserTwitter] = useState("");
  const [userInstagram, setUserInstagram] = useState("");
  const [userName, setUserName] = useState("");
  const [userCity, setUserCity] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // Coordinator state
  const [coordActive, setCoordActive] = useState(false);
  const [coordActId, setCoordActId] = useState(null);
  const [coordParts, setCoordParts] = useState([]);
  const [coordLoc, setCoordLoc] = useState("");
  const [coordMsg, setCoordMsg] = useState("");
  const [coordSrcId, setCoordSrcId] = useState(null);

  const fileRef = useRef(null);
  const coordRef = useRef(null);

  const processFile = useCallback(async (text) => {
    setProcessing(true);
    setProcessingStatus("Parsing messages...");

    // Always run the local parser first for message stats
    const parsedChat = parseWhatsAppText(text);
    if (parsedChat.stats.totalMessages === 0) {
      setProcessing(false);
      setProcessingStatus("");
      return;
    }

    // Try Claude API first
    try {
      // Step 1: Aggregate user profile from social sources (if provided)
      let userProfile = undefined;
      let aggregatedProfile = null;
      if (userName || userLinkedin || userTwitter || userInstagram || userCity) {
        userProfile = { name: userName, linkedinUrl: userLinkedin, twitterHandle: userTwitter, instagramHandle: userInstagram, city: userCity };

        if (userLinkedin || userTwitter || userInstagram) {
          setProcessingStatus("🧬 Scraping your social profiles...");
          try {
            const aggRes = await fetch(`${API_BASE}/api/aggregate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                linkedinUrl: userLinkedin || undefined,
                twitterHandle: userTwitter || undefined,
                instagramHandle: userInstagram || undefined,
              }),
            });
            if (aggRes.ok) {
              const aggData = await aggRes.json();
              aggregatedProfile = aggData.profile;
              setProcessingStatus("🧬 Profile enriched! Analyzing chat...");
            }
          } catch (_) { /* aggregation failed — continue without it */ }
        }
      }

      // Step 2: Extract deep signals from chat
      setProcessingStatus("🔍 Extracting deep signals...");
      const memberNames = parsedChat.members.map(m => m.name);
      const intents = extractIntents(parsedChat.messages);
      const endorsements = extractEndorsements(parsedChat.messages, memberNames);
      const selfDisclosures = extractSelfDisclosures(parsedChat.messages);

      const deepSignals = {
        sharedLinks: extractSharedLinks(parsedChat.messages),
        phoneSignals: extractPhoneSignals(parsedChat.members),
        timingPatterns: extractTimingPatterns(parsedChat.messages),
        emojiProfiles: extractEmojiProfile(parsedChat.messages),
        relationshipGraph: buildRelationshipGraph(parsedChat),
        intents,
        endorsements,
        selfDisclosures,
      };

      // Step 3: Prioritize contacts (quick local scan)
      setProcessingStatus("🎯 Prioritizing contacts...");
      const localProfiles = enrichProfiles(parsedChat);
      const prioritized = prioritizeContacts(localProfiles, userProfile, deepSignals);
      const highPriority = prioritized.filter(p => p.tier === "deep_dive");
      const highPriorityNames = highPriority.map(p => p.name);

      // Step 4: Smart Search — iterative contact intelligence
      let searchEnrichments = null;
      if (highPriority.length > 0 && userProfile) {
        // Build contact list with phone numbers + chat context
        const searchContacts = highPriority.slice(0, 8).map(p => {
          const member = parsedChat.members.find(m => m.name === p.name);
          const phoneMatch = p.name.match(/\+[\d\s()-]+/);
          return {
            name: p.name,
            phone: phoneMatch ? phoneMatch[0] : null,
            clues: [
              ...p.signals.filter(s => !s.startsWith("⚠️")),
              ...(selfDisclosures.filter(d => d.sender === p.name).map(d => `${d.field}: ${d.value}`)),
              ...(endorsements.filter(e => e.about === p.name).map(e => `Endorsed for: ${e.skill}`)),
            ],
            chatMessages: parsedChat.messages.filter(m => m.sender === p.name).map(m => m.text).join("\n").slice(0, 1500),
          };
        });

        // Round 1: Broad scan
        setProcessingStatus(`🔍 Round 1: Scanning ${searchContacts.length} contacts...`);
        try {
          const r1 = await fetch(`${API_BASE}/api/smart-search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userProfile, contacts: searchContacts, round: 1 }),
          });
          if (r1.ok) {
            const r1Data = await r1.json();
            setProcessingStatus(`📊 Found ${r1Data.summary.strong} strong, ${r1Data.summary.promising} promising matches`);

            // Round 2: Deep dive on promising leads
            if (r1Data.needsAnotherRound && r1Data.nextRoundContacts.length > 0) {
              setProcessingStatus(`🔍 Round 2: Deep-diving ${r1Data.nextRoundContacts.length} promising leads...`);
              try {
                const r2 = await fetch(`${API_BASE}/api/smart-search`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userProfile,
                    contacts: r1Data.nextRoundContacts,
                    round: 2,
                    previousResults: r1Data.results,
                  }),
                });
                if (r2.ok) {
                  const r2Data = await r2.json();
                  // Merge round 2 results with round 1
                  const allResults = [...r1Data.results];
                  r2Data.results.forEach(r2r => {
                    const idx = allResults.findIndex(r => r.name === r2r.name);
                    if (idx >= 0) allResults[idx] = r2r; // Replace with deeper data
                    else allResults.push(r2r);
                  });
                  searchEnrichments = allResults;
                  setProcessingStatus(`✅ ${allResults.filter(r => r.match_tier === "strong").length} strong matches confirmed`);
                }
              } catch (_) {
                searchEnrichments = r1Data.results;
              }
            } else {
              searchEnrichments = r1Data.results;
            }
          }
        } catch (_) { /* search failed — continue without */ }
      }

      // Step 5: Analyze chat with ALL intelligence
      setProcessingStatus(`🧠 Connex Brain analyzing...`);
      const analyzePayload = { chatText: text, userProfile, deepSignals, highPriorityContacts: highPriorityNames, searchEnrichments };
      if (aggregatedProfile) {
        analyzePayload.enrichedUserProfile = aggregatedProfile;
      }
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyzePayload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.profiles && data.profiles.length > 0) {
          setProcessingStatus("Building rich profiles...");
          let profiles = bridgeBrainProfiles(data.profiles, parsedChat);
          profiles = fillMentions(profiles, parsedChat);
          const analysis = analyzeNetwork(profiles);
          const suggestions = generateSuggestions(profiles);
          const dmStrategy = getDMStrategy(profiles);
          setGroupInsights(data.group_insights || null);
          setTrustActivations(data.trust_activations || []);
          setAnalysisMode("claude");
          
          // Save top profiles to network (async, non-blocking)
          setProcessingStatus("Saving to network...");
          const topProfiles = profiles.slice(0, 20);
          fetch(`${API_BASE}/api/profile/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profiles: topProfiles.map(p => ({
                name: p.display_name,
                // phone would come from contact if available
              })),
              quickMode: true,
            }),
          }).catch(() => {}); // Fire and forget
          
          setResults({ parsedChat, profiles, analysis, suggestions, dmStrategy });
          setProcessing(false);
          setProcessingStatus("");
          setTab("overview");
          return;
        }
      }
    } catch (apiError) {
      // API unavailable — fall through to offline
      console.error("Brain API error:", apiError);
    }

    // Fallback: run local engine
    setProcessingStatus("Running local analysis...");
    setTimeout(() => {
      const localProfiles = enrichProfiles(parsedChat);
      const analysis = analyzeNetwork(localProfiles);
      const suggestions = generateSuggestions(localProfiles);
      const dmStrategy = getDMStrategy(localProfiles);
      setAnalysisMode("offline");
      setGroupInsights(null);
      setTrustActivations([]);
      setResults({ parsedChat, profiles: localProfiles, analysis, suggestions, dmStrategy });
      setProcessing(false);
      setProcessingStatus("");
      setTab("overview");
    }, 300);
  }, []);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => processFile(e.target.result);
    reader.readAsText(file);
  }, [processFile]);

  const copy = useCallback((text) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, []);

  const buildMessage = (actId, parts, loc) => {
    const act = ACTIVITY_TYPES.find((a) => a.id === actId);
    if (!act || parts.length === 0) return "";
    return act.tpl(loc || "TBD", parts.map((n) => n.split(" ")[0]).join(", "));
  };

  const handleUseSuggestion = useCallback((suggestion) => {
    const actId = INTEREST_TO_ACTIVITY[suggestion.activity] || "coworking";
    setCoordActive(true);
    setCoordActId(actId);
    setCoordParts(suggestion.participants);
    setCoordLoc(suggestion.location);
    setCoordMsg(buildMessage(actId, suggestion.participants, suggestion.location));
    setCoordSrcId(suggestion.id);
    setTab("suggestions");
    setTimeout(() => { coordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150);
  }, []);

  const changeActivity = useCallback((actId) => {
    setCoordActId(actId);
    setCoordMsg(buildMessage(actId, coordParts, coordLoc));
  }, [coordParts, coordLoc]);

  const removePart = useCallback((name) => {
    const updated = coordParts.filter((p) => p !== name);
    setCoordParts(updated);
    if (coordActId) setCoordMsg(buildMessage(coordActId, updated, coordLoc));
  }, [coordParts, coordActId, coordLoc]);

  const clearCoord = useCallback(() => {
    setCoordActive(false); setCoordActId(null); setCoordParts([]); setCoordLoc(""); setCoordMsg(""); setCoordSrcId(null);
  }, []);

  // ─── Shared styles ───
  const card = { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 };
  const tag = (bg, color, bc) => ({ display: "inline-block", padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, marginRight: 4, marginBottom: 4, background: bg, color, border: bc ? `1px solid ${bc}` : "none" });
  const secTitle = { fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.textMuted, marginBottom: 16, fontWeight: 600 };
  const btnG = { background: C.green, color: "#000", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 };
  const btnO = { background: "transparent", color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const btnA = { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 };
  const tabS = (active) => ({ flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", borderRadius: 8, border: "none", fontFamily: "inherit", background: active ? C.accent : "transparent", color: active ? "#fff" : C.textMuted });

  // ─── MODE SELECTOR ───
  if (mode === "2nd_degree") {
    return <SecondDegreeMatcher onBack={() => setMode(null)} />;
  }
  
  if (mode === "profile_builder") {
    return <ProfileBuilder onBack={() => setMode(null)} />;
  }
  
  if (mode === "brain") {
    return <BrainDashboard onBack={() => setMode(null)} />;
  }

  // ─── UPLOAD (Group Analysis) ───
  if (!results) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", background: C.bg, color: C.text, minHeight: "100vh" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
            <div style={{ fontSize: 13, letterSpacing: 6, textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>▲ Connex</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0", letterSpacing: -0.5 }}>Unlock Your Network</h1>
            <p style={{ fontSize: 13, color: C.textMuted }}>Upload a WhatsApp chat → discover connections you didn't know existed</p>
          </div>
          
          {/* ─── MODE TOGGLE ─── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <div 
              onClick={() => setMode("group")}
              style={{ 
                flex: 1, ...card, marginBottom: 0, cursor: "pointer", 
                borderColor: mode === "group" ? C.accent : C.border,
                background: mode === "group" ? C.accentSoft : C.card,
                padding: 20, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Analyze a Group</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                See who should meet within<br/>your own community
              </div>
            </div>
            <div 
              onClick={() => setMode("2nd_degree")}
              style={{ 
                flex: 1, ...card, marginBottom: 0, cursor: "pointer",
                borderColor: C.green + "60",
                background: C.greenSoft,
                padding: 20, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: C.green }}>Find YOUR Matches</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                Upload a friend's chat →<br/>find who YOU should meet
              </div>
            </div>
            <div 
              onClick={() => setMode("profile_builder")}
              style={{ 
                flex: 1, ...card, marginBottom: 0, cursor: "pointer",
                borderColor: C.cyan + "60",
                background: C.cyanSoft,
                padding: 20, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏗️</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: C.cyan }}>Build a Profile</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                Enter name + handles →<br/>auto-enrich from socials
              </div>
            </div>
            <div 
              onClick={() => setMode("brain")}
              style={{ 
                flex: 1, ...card, marginBottom: 0, cursor: "pointer",
                borderColor: "#bc8cff60",
                background: "rgba(188,140,255,0.1)",
                padding: 20, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#bc8cff" }}>Unified Brain</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                Your context + proactive<br/>connection intelligence
              </div>
              <div style={{ marginTop: 8, fontSize: 10, padding: "4px 10px", borderRadius: 4, background: "#bc8cff", color: "#000", display: "inline-block", fontWeight: 700, letterSpacing: 1 }}>NEW</div>
            </div>
          </div>
          {/* ─── YOUR PROFILE ─── */}
          <div style={{ ...card, marginBottom: 20, padding: 20, border: profileSaved ? `1px solid ${C.green}` : `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>🧬 About You <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>(helps find connections relevant to YOU)</span></div>
              {profileSaved && <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>The more you share, the smarter the suggestions. All data stays private.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={userName} onChange={(e) => { setUserName(e.target.value); setProfileSaved(false); }} placeholder="Your name" style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none" }} />
              <input value={userCity} onChange={(e) => { setUserCity(e.target.value); setProfileSaved(false); }} placeholder="Your city (e.g. Bangkok)" style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none" }} />
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{ position: "absolute", left: 10, top: 9, fontSize: 11, color: C.textDim }}>𝕏</span>
                  <input value={userTwitter} onChange={(e) => { setUserTwitter(e.target.value); setProfileSaved(false); }} placeholder="X handle (e.g. @username)" style={{ width: "100%", padding: "8px 12px 8px 28px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{ position: "absolute", left: 10, top: 9, fontSize: 11, color: C.textDim }}>in</span>
                  <input value={userLinkedin} onChange={(e) => { setUserLinkedin(e.target.value); setProfileSaved(false); }} placeholder="LinkedIn URL" style={{ width: "100%", padding: "8px 12px 8px 28px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1", position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: 9, fontSize: 11, color: C.textDim }}>📷</span>
                <input value={userInstagram} onChange={(e) => { setUserInstagram(e.target.value); setProfileSaved(false); }} placeholder="Instagram (e.g. @username)" style={{ width: "100%", padding: "8px 12px 8px 28px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                <button 
                  onClick={() => setProfileSaved(true)} 
                  disabled={!userName && !userCity && !userTwitter && !userLinkedin && !userInstagram}
                  style={{ 
                    padding: "10px 24px", 
                    borderRadius: 8, 
                    border: "none", 
                    background: (userName || userCity || userTwitter || userLinkedin || userInstagram) ? C.accent : C.border, 
                    color: (userName || userCity || userTwitter || userLinkedin || userInstagram) ? "#fff" : C.textDim, 
                    fontSize: 12, 
                    fontWeight: 700, 
                    cursor: (userName || userCity || userTwitter || userLinkedin || userInstagram) ? "pointer" : "not-allowed",
                    width: "100%"
                  }}
                >
                  {profileSaved ? "✓ Profile Saved" : "Save Profile"}
                </button>
              </div>
            </div>
          </div>

          {/* ─── FILE UPLOAD ─── */}
          <div
            style={{ border: `2px dashed ${dragging ? C.accent : C.border}`, borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: dragging ? C.accentSoft : C.card }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".txt,.text" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 36, marginBottom: 12 }}>{processing ? "⏳" : "📁"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{processing ? "Analyzing chat..." : "Drop WhatsApp export here"}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{processing ? (processingStatus || "Parsing messages, enriching profiles...") : ".txt file · WhatsApp → Export Chat → Without Media"}</div>
          </div>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <span style={{ fontSize: 12, color: C.textDim, marginRight: 12 }}>No chat handy?</span>
            <button style={btnO} onClick={() => processFile(SAMPLE_CHAT)}>Load Demo Data</button>
          </div>
          <div style={{ ...card, marginTop: 32, padding: 24 }}>
            <div style={secTitle}>How it works</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
              {[{ i: "📁", t: "Upload", d: "Drop a WhatsApp group export" }, { i: "🧠", t: "Brain AI", d: "Profiles everyone from their messages" }, { i: "🔗", t: "Connect", d: "Finds who should meet & why" }, { i: "📋", t: "Activate", d: "Copy intro messages & send" }].map((s, idx) => (
                <div key={idx} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{s.i}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.t}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { parsedChat, profiles, analysis, suggestions, dmStrategy } = results;
  const warmIntros = trustActivations.filter(a => a.type === "warm_intro");
  const groupActs = trustActivations.filter(a => a.type === "group_activation");
  const tabs = [
    { id: "overview", l: "Overview" },
    { id: "connections", l: `🔗 Connections (${trustActivations.length})` },
    { id: "profiles", l: `Members (${profiles.length})` },
    { id: "suggestions", l: `Meetups (${suggestions.length})` },
    { id: "dm", l: "DM Strategy" },
  ];

  return (
    <div style={{ fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 6, textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>▲ Connex</div>
            {analysisMode && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", background: analysisMode === "claude" ? C.greenSoft : C.yellowSoft, color: analysisMode === "claude" ? C.green : C.yellow, border: `1px solid ${analysisMode === "claude" ? C.green + "30" : C.yellow + "30"}` }}>
                {analysisMode === "claude" ? "Brain AI" : "Offline"}
              </span>
            )}
          </div>
          <button style={btnO} onClick={() => { setResults(null); setTab("overview"); clearCoord(); setAnalysisMode(null); setGroupInsights(null); setTrustActivations([]); }}>← New Analysis</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 24, padding: 4, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
          {tabs.map((t) => <button key={t.id} style={tabS(tab === t.id)} onClick={() => setTab(t.id)}>{t.l}</button>)}
        </div>

        {/* ════════════ OVERVIEW ════════════ */}
        {tab === "overview" && (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {[{ n: parsedChat.stats.totalMessages, l: "Messages", c: C.accent }, { n: parsedChat.stats.totalMembers, l: "Members", c: C.cyan }, { n: trustActivations.length || suggestions.length, l: trustActivations.length ? "Connections" : "Meetup Ideas", c: C.green }, { n: new Set(profiles.map((p) => normLoc(p.location?.primary)).filter(Boolean)).size, l: "Cities", c: C.yellow }].map((s, i) => (
              <div key={i} style={{ ...card, textAlign: "center", padding: "16px 14px", marginBottom: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.textMuted, marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
          {parsedChat.stats.dateRange.start && (
            <div style={{ ...card, marginTop: 16, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Date range</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{parsedChat.stats.dateRange.start} → {parsedChat.stats.dateRange.end}</span>
            </div>
          )}
          <div style={{ ...card, marginTop: 16 }}>
            <div style={secTitle}>Group Interests</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[...new Set(profiles.flatMap((p) => p.interests.map((i) => i.category)))].map((int) => (
                <span key={int} style={tag(C.accentSoft, C.accent, C.accent + "30")}>{IE[int] || "📋"} {int}</span>
              ))}
            </div>
          </div>
          {groupInsights && (
            <div style={{ ...card, marginTop: 16, borderColor: C.green + "30", background: C.greenSoft }}>
              <div style={secTitle}>Brain Insights</div>
              {groupInsights.key_themes?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Key Themes</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{groupInsights.key_themes.map((t, i) => <span key={i} style={tag(C.greenSoft, C.green, C.green + "30")}>{t}</span>)}</div>
                </div>
              )}
              {groupInsights.geographic_clusters?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Geographic Clusters</div>
                  {groupInsights.geographic_clusters.map((gc, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}>
                      <span style={{ color: C.cyan, marginRight: 6 }}>📍</span>
                      {typeof gc === "string" ? gc : `${gc.city || gc.location}: ${(gc.members || []).join(", ")}`}
                    </div>
                  ))}
                </div>
              )}
              {groupInsights.potential_matches?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Potential Matches</div>
                  {groupInsights.potential_matches.map((m, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                      <span style={{ color: C.accent, marginRight: 6 }}>↔</span>
                      {typeof m === "string" ? m : `${(m.members || m.people || []).join(" + ")}: ${m.reason || m.basis || ""}`}
                    </div>
                  ))}
                </div>
              )}
              {groupInsights.suggested_activations?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Suggested Activations</div>
                  {groupInsights.suggested_activations.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                      <span style={{ color: C.orange, marginRight: 6 }}>→</span>
                      {typeof a === "string" ? a : `${a.type || a.activity}: ${a.description || a.reason || (a.participants || []).join(", ")}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {analysis.hubs.length > 0 && (
            <div style={card}>
              <div style={secTitle}>Network Hubs</div>
              {analysis.hubs.slice(0, 5).map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < Math.min(analysis.hubs.length, 5) - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div><span style={{ fontSize: 13, fontWeight: 700 }}>{h.name}</span>{h.location && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>📍 {normLoc(h.location)}</span>}</div>
                  <span style={{ fontSize: 11, color: C.cyan }}>{h.inDegree} mention{h.inDegree !== 1 ? "s" : ""} · {h.messageCount} msgs</span>
                </div>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div style={{ ...card, borderColor: C.accent + "40", background: C.accentSoft }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎯 Top: {suggestions[0].type}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{suggestions[0].reason}</div>
                </div>
                <button style={btnG} onClick={() => handleUseSuggestion(suggestions[0])}>Use This →</button>
              </div>
            </div>
          )}
        </div>)}

        {/* ════════════ CONNECTIONS (Trust Activations) ════════════ */}
        {tab === "connections" && (<div>
          {trustActivations.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Brain AI Required</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>Trust activations need the Claude Brain API. Deploy to Vercel with your ANTHROPIC_API_KEY to unlock this.</div>
            </div>
          ) : (
            <div>
              {warmIntros.length > 0 && (
                <div>
                  <div style={{ ...card, borderColor: C.accent + "40", background: C.accentSoft, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🤝 Warm Introductions</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>People who should meet — the Brain found complementary interests, needs, or locations.</div>
                  </div>
                  {warmIntros.sort((a, b) => (b.score || 0) - (a.score || 0)).map((act, i) => (
                    <div key={`intro-${i}`} style={card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 22 }}>🔗</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>
                            {act.person_a} <span style={{ color: C.accent }}>↔</span> {act.person_b}
                          </div>
                          {act.connector && <div style={{ fontSize: 11, color: C.textMuted }}>via {act.connector}</div>}
                        </div>
                        {act.score && (
                          <div style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: act.score >= 70 ? C.greenSoft : act.score >= 40 ? C.yellowSoft : C.border, color: act.score >= 70 ? C.green : act.score >= 40 ? C.yellow : C.textMuted }}>{act.score}%</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 8, lineHeight: 1.6 }}>{act.why}</div>
                      {act.conversation_starter && (
                        <div style={{ fontSize: 11, color: C.cyan, marginBottom: 8 }}>💬 Starter: "{act.conversation_starter}"</div>
                      )}
                      {act.intro_message && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.textDim, marginBottom: 6 }}>Ready-to-send intro message</div>
                            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{act.intro_message}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                            <button onClick={() => { navigator.clipboard.writeText(act.intro_message); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...btnO, fontSize: 11, padding: "6px 14px" }}>📋 Copy Message</button>
                            <span style={{ fontSize: 11, color: C.textDim, marginLeft: "auto" }}>Did you connect?</span>
                            <button onClick={() => {}} style={{ background: "none", border: `1px solid ${C.green}30`, borderRadius: 6, padding: "4px 8px", fontSize: 14, cursor: "pointer" }}>👍</button>
                            <button onClick={() => {}} style={{ background: "none", border: `1px solid ${C.red}30`, borderRadius: 6, padding: "4px 8px", fontSize: 14, cursor: "pointer" }}>👎</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {groupActs.length > 0 && (
                <div style={{ marginTop: warmIntros.length > 0 ? 24 : 0 }}>
                  <div style={{ ...card, borderColor: C.green + "40", background: C.greenSoft, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🎯 Group Activations</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>Meetup suggestions based on shared interests and locations.</div>
                  </div>
                  {groupActs.map((act, i) => (
                    <div key={`group-${i}`} style={card}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{act.activity}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{act.why}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {(act.participants || []).map((p, j) => (
                          <span key={j} style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, background: C.border, color: C.text }}>{p}</span>
                        ))}
                      </div>
                      {act.poll_message && (
                        <div>
                          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.textDim, marginBottom: 6 }}>Ready-to-send poll</div>
                            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{act.poll_message}</div>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(act.poll_message); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...btnO, marginTop: 8, fontSize: 11, padding: "6px 14px" }}>📋 Copy Poll</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>)}

        {/* ════════════ PROFILES ════════════ */}
        {tab === "profiles" && (<div>
          {profiles.sort((a, b) => b.message_count - a.message_count).map((p, i) => {
            const exp = expProfile === i;
            const loc = normLoc(p.location?.primary);
            return (
              <div key={i} style={{ ...card, cursor: "pointer", borderColor: exp ? C.accent + "60" : C.border }} onClick={() => setExpProfile(exp ? null : i)}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{p.display_name}</span>
                      <ActivityBadge level={p.activity_level} />
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>{p.message_count} msgs</span>{loc && <span>📍 {loc}</span>}{p.brain?.role && <span>{p.brain.role}{p.brain.company ? ` @ ${p.brain.company}` : ""}</span>}{p.mentioned_by.length > 0 && <span>↗ by {p.mentioned_by.length}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textDim }}>{exp ? "▲" : "▼"}</span>
                </div>
                {p.interests.length > 0 && <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>{p.interests.map((int, j) => <span key={j} style={tag(C.border, C.textMuted)}>{IE[int.category] || "📋"} {int.category}</span>)}</div>}
                {exp && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    {/* Brain-enriched identity row */}
                    {p.brain && (p.brain.role || p.brain.company) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                        {p.brain.role && <span style={tag(C.accentSoft, C.accent, C.accent + "30")}>{p.brain.role}</span>}
                        {p.brain.company && <span style={tag(C.cyanSoft, C.cyan, C.cyan + "30")}>{p.brain.company}</span>}
                        {p.brain.industry && <span style={tag(C.border, C.textMuted)}>{p.brain.industry}</span>}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                      <div><div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Active Period</div><div>{p.first_seen} → {p.last_seen}</div></div>
                      {Object.keys(p.affinities).length > 0 && <div><div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Affinities</div><div>{Object.values(p.affinities).flat().join(", ")}</div></div>}
                    </div>
                    {/* Brain: Expertise */}
                    {p.brain?.expertise?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Expertise</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{p.brain.expertise.map((e, j) => <span key={j} style={tag(C.greenSoft, C.green, C.green + "30")}>{e}</span>)}</div>
                      </div>
                    )}
                    {/* Brain: Looking For / Offering */}
                    {(p.brain?.looking_for?.length > 0 || p.brain?.offering?.length > 0) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                        {p.brain?.looking_for?.length > 0 && (
                          <div>
                            <div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Looking For</div>
                            {p.brain.looking_for.map((l, j) => <div key={j} style={{ fontSize: 11, color: C.yellow, marginBottom: 2 }}>→ {l}</div>)}
                          </div>
                        )}
                        {p.brain?.offering?.length > 0 && (
                          <div>
                            <div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Can Offer</div>
                            {p.brain.offering.map((o, j) => <div key={j} style={{ fontSize: 11, color: C.green, marginBottom: 2 }}>→ {o}</div>)}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Brain: Personality */}
                    {p.brain?.personality_notes && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Personality Read</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>{p.brain.personality_notes}</div>
                      </div>
                    )}
                    {p.mentions.length > 0 && <div style={{ marginTop: 12 }}><div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Mentions</div><div style={{ fontSize: 12 }}>{p.mentions.join(", ")}</div></div>}
                    {p.mentioned_by.length > 0 && <div style={{ marginTop: 8 }}><div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Mentioned By</div><div style={{ fontSize: 12 }}>{p.mentioned_by.join(", ")}</div></div>}
                    {p.interests.length > 0 && <div style={{ marginTop: 12 }}><div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Interest Confidence</div>{p.interests.map((int, j) => <div key={j} style={{ marginBottom: 6 }}><div style={{ fontSize: 11, marginBottom: 3, color: C.textMuted }}>{IE[int.category]} {int.category} — {int.keywords.join(", ")}</div><ConfBar value={Math.round(int.confidence * 100)} /></div>)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>)}

        {/* ════════════ SUGGESTIONS + COORDINATOR ════════════ */}
        {tab === "suggestions" && (<div>
          {suggestions.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🤔</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No meetup suggestions yet</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>Need 2+ people in the same city with shared interests</div>
            </div>
          ) : (
            suggestions.map((s, i) => {
              const isActive = coordSrcId === s.id;
              return (
                <div key={i} style={{ ...card, borderColor: isActive ? C.green + "80" : C.border, background: isActive ? C.greenSoft : C.card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{s.emoji} {s.type}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{s.reason}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {s.participants.map((name, j) => <span key={j} style={tag(C.cyanSoft, C.cyan, C.cyan + "30")}>{name}</span>)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 110 }}>
                      <ConfBar value={s.confidence} />
                      <button style={{ ...btnG, fontSize: 11, padding: "7px 14px", whiteSpace: "nowrap", opacity: isActive ? 0.7 : 1 }} onClick={() => handleUseSuggestion(s)}>
                        {isActive ? "✓ Active" : "Use This →"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* ─── ACTIVITY COORDINATOR ─── */}
          <div ref={coordRef} style={{ marginTop: 24, scrollMarginTop: 20 }}>
            <div style={{ ...card, borderColor: coordActive ? C.green + "50" : C.accent + "30", padding: 24, background: coordActive ? "#0f1a12" : C.card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={secTitle}>📋 Activity Coordinator</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: -8 }}>
                    {coordActive ? "Customize your activity type and copy the poll message" : "Click \"Use This →\" on a suggestion above to get started"}
                  </div>
                </div>
                {coordActive && (
                  <button style={{ ...btnO, fontSize: 10, padding: "5px 10px", color: C.red, borderColor: C.red + "40" }} onClick={clearCoord}>Clear</button>
                )}
              </div>

              {/* Activity type buttons */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Activity Type</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ACTIVITY_TYPES.map((a) => (
                    <button key={a.id} onClick={() => { if (coordParts.length > 0) changeActivity(a.id); }} style={{
                      background: coordActId === a.id ? C.accent : C.border,
                      color: coordActId === a.id ? "#fff" : C.textMuted,
                      border: `1px solid ${coordActId === a.id ? C.accent : C.border}`,
                      borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600,
                      cursor: coordParts.length > 0 ? "pointer" : "default", fontFamily: "inherit",
                      opacity: coordParts.length > 0 ? 1 : 0.4,
                    }}>{a.emoji} {a.label}</button>
                  ))}
                </div>
              </div>

              {/* Participants */}
              {coordParts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Participants ({coordParts.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {coordParts.map((name, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: C.cyanSoft, color: C.cyan, border: `1px solid ${C.cyan}30` }}>
                        {name}
                        <span onClick={() => removePart(name)} style={{ cursor: "pointer", opacity: 0.6, fontSize: 13, lineHeight: 1 }} title="Remove">×</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              {coordLoc && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, marginBottom: 4, fontWeight: 600 }}>Location</div>
                  <div style={{ fontSize: 13 }}>📍 {coordLoc}</div>
                </div>
              )}

              {/* Message output */}
              {coordMsg ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, fontWeight: 600 }}>Poll Message — Ready to Send</div>
                    <button style={btnG} onClick={() => copy(coordMsg)}>📋 Copy Message</button>
                  </div>
                  <div style={{ background: "#0d0d14", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.text, border: `1px solid ${C.border}` }}>{coordMsg}</div>
                  <div style={{ marginTop: 10, fontSize: 11, color: C.textDim, textAlign: "center" }}>Paste this directly into your WhatsApp group chat</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.textDim, fontSize: 12 }}>
                  ↑ Select a meetup suggestion above to generate a poll message
                </div>
              )}
            </div>
          </div>
        </div>)}

        {/* ════════════ DM STRATEGY ════════════ */}
        {tab === "dm" && (<div>
          <div style={{ ...card, borderColor: C.accent + "40", background: C.accentSoft, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🎯 Who to DM First</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Ranked by influence: message volume, mentions, and engagement.</div>
          </div>
          {dmStrategy.map((dm, i) => {
            const p = dm.profile;
            const loc = normLoc(p.location?.primary);
            return (
              <div key={i} style={card}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? C.accent : i === 1 ? C.cyan : C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: i < 2 ? "#fff" : C.textMuted, flexShrink: 0 }}>{dm.rank}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{dm.name}</span>
                      <ActivityBadge level={p.activity_level} />
                      {loc && <span style={{ fontSize: 11, color: C.textMuted }}>📍 {loc}</span>}
                    </div>
                    {dm.reasons.map((r, j) => <div key={j} style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}><span style={{ color: C.green, marginRight: 6 }}>→</span>{r}</div>)}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{p.message_count} msgs</div>
                </div>
              </div>
            );
          })}
        </div>)}

        {copied && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#000", padding: "10px 24px", borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1, zIndex: 999 }}>✓ COPIED TO CLIPBOARD</div>}
      </div>
    </div>
  );
}
