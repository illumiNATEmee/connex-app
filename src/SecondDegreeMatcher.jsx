/**
 * SecondDegreeMatcher — The Killer Feature
 * "I know Arul. Arul knows 30 people. Who should I meet — and why?"
 */

import { useState, useCallback, useRef } from "react";
import { API_BASE } from "./config.js";
import {
  parseWhatsAppText,
  enrichProfiles,
  normLoc,
  extractIntents,
  extractEndorsements,
  extractSelfDisclosures,
  buildRelationshipGraph,
} from "./connex-engine.js";

// ═══════════════════════════════════════════════════════════
// THEME (matching main app)
// ═══════════════════════════════════════════════════════════

const C = {
  bg: "#0a0a0f", card: "#12121a", border: "#1e1e2e",
  accent: "#6366f1", accentSoft: "#6366f120",
  green: "#22c55e", greenSoft: "#22c55e20", yellow: "#eab308", yellowSoft: "#eab30820",
  red: "#ef4444", cyan: "#06b6d4", cyanSoft: "#06b6d420", orange: "#f97316",
  text: "#e2e2ef", textMuted: "#8888a0", textDim: "#55556a",
};

const IE = { sports:"🏆", crypto:"₿", food:"🍜", wellness:"🧘", tech:"💻", business:"📊", travel:"✈️", music:"🎵", general:"📋" };

// ═══════════════════════════════════════════════════════════
// MATCH SCORING ALGORITHM
// ═══════════════════════════════════════════════════════════

function scoreMatch(userProfile, candidateProfile, deepSignals) {
  let score = 0;
  const reasons = [];
  const evidence = [];

  // 1. LOCATION MATCH (20% weight)
  const userCity = userProfile.city?.toLowerCase();
  const candidateCity = normLoc(candidateProfile.location?.primary)?.toLowerCase();
  
  if (userCity && candidateCity) {
    if (userCity === candidateCity || candidateCity?.includes(userCity) || userCity?.includes(candidateCity)) {
      score += 20;
      reasons.push(`📍 Both in ${normLoc(candidateProfile.location?.primary)}`);
    }
  }

  // 2. SHARED INTERESTS (25% weight)
  const userInterests = new Set((userProfile.interests || []).map(i => i.toLowerCase()));
  const candidateInterests = candidateProfile.interests || [];
  
  const sharedInterests = candidateInterests.filter(ci => 
    userInterests.has(ci.category?.toLowerCase()) ||
    ci.keywords?.some(kw => userInterests.has(kw.toLowerCase()))
  );
  
  if (sharedInterests.length > 0) {
    const interestScore = Math.min(sharedInterests.length * 8, 25);
    score += interestScore;
    const interestNames = sharedInterests.map(i => i.category).slice(0, 3);
    reasons.push(`🎯 Shared interests: ${interestNames.join(", ")}`);
  }

  // 3. COMPLEMENTARY NEEDS (30% weight - highest!)
  const userLookingFor = (userProfile.looking_for || []).map(l => l.toLowerCase());
  const candidateOffering = (candidateProfile.brain?.offering || []).map(o => o.toLowerCase());
  const candidateLookingFor = (candidateProfile.brain?.looking_for || []).map(l => l.toLowerCase());
  const userOffering = (userProfile.offering || []).map(o => o.toLowerCase());

  // Check if candidate offers what user needs
  const candidateCanHelp = candidateOffering.filter(offer => 
    userLookingFor.some(need => offer.includes(need) || need.includes(offer))
  );
  
  // Check if user can help candidate
  const userCanHelp = userOffering.filter(offer =>
    candidateLookingFor.some(need => offer.includes(need) || need.includes(offer))
  );

  if (candidateCanHelp.length > 0) {
    score += 15;
    reasons.push(`✅ They can help: ${candidateCanHelp.slice(0, 2).join(", ")}`);
  }
  
  if (userCanHelp.length > 0) {
    score += 15;
    reasons.push(`🤝 You can help: ${userCanHelp.slice(0, 2).join(", ")}`);
  }

  // 4. INDUSTRY/ROLE OVERLAP (15% weight)
  if (candidateProfile.brain?.industry && userProfile.industry) {
    if (candidateProfile.brain.industry.toLowerCase().includes(userProfile.industry.toLowerCase()) ||
        userProfile.industry.toLowerCase().includes(candidateProfile.brain.industry.toLowerCase())) {
      score += 10;
      reasons.push(`💼 Same industry: ${candidateProfile.brain.industry}`);
    }
  }

  if (candidateProfile.brain?.role && userProfile.role) {
    // Similar roles or complementary (e.g., founder + investor)
    const complementaryPairs = [
      ["founder", "investor"], ["ceo", "investor"], ["engineer", "product"],
      ["designer", "engineer"], ["marketing", "product"], ["sales", "founder"]
    ];
    const candidateRole = candidateProfile.brain.role.toLowerCase();
    const userRole = userProfile.role.toLowerCase();
    
    const isComplementary = complementaryPairs.some(pair =>
      (candidateRole.includes(pair[0]) && userRole.includes(pair[1])) ||
      (candidateRole.includes(pair[1]) && userRole.includes(pair[0]))
    );
    
    if (isComplementary) {
      score += 5;
      reasons.push(`🔗 Complementary roles`);
    }
  }

  // 5. AFFINITY MATCH (10% weight)
  const userAffinities = Object.values(userProfile.affinities || {}).flat().map(a => a.toLowerCase());
  const candidateAffinities = Object.values(candidateProfile.affinities || {}).flat().map(a => a.toLowerCase());
  
  const sharedAffinities = userAffinities.filter(ua => 
    candidateAffinities.some(ca => ca.includes(ua) || ua.includes(ca))
  );
  
  if (sharedAffinities.length > 0) {
    score += Math.min(sharedAffinities.length * 5, 10);
    reasons.push(`⚡ Shared vibes: ${sharedAffinities.slice(0, 2).join(", ")}`);
  }

  // 6. EXTRACT EVIDENCE FROM CHAT
  // Self-disclosures by this person
  const selfDisclosures = (deepSignals?.selfDisclosures || []).filter(d => 
    d.sender === candidateProfile.display_name
  );
  
  selfDisclosures.slice(0, 2).forEach(d => {
    evidence.push({
      type: "self_disclosure",
      quote: d.fullText.slice(0, 150),
      field: d.field,
      date: d.date,
    });
  });

  // Endorsements about this person
  const endorsements = (deepSignals?.endorsements || []).filter(e =>
    e.about === candidateProfile.display_name
  );
  
  endorsements.slice(0, 2).forEach(e => {
    evidence.push({
      type: "endorsement",
      quote: e.fullText.slice(0, 150),
      by: e.by,
      skill: e.skill,
      date: e.date,
    });
  });

  // Intents (what they're looking for)
  const intents = (deepSignals?.intents || []).filter(i =>
    i.sender === candidateProfile.display_name
  );
  
  intents.slice(0, 2).forEach(i => {
    evidence.push({
      type: "intent",
      quote: i.fullText.slice(0, 150),
      intentType: i.type,
      date: i.date,
    });
  });

  return {
    score: Math.min(Math.round(score), 100),
    reasons,
    evidence,
  };
}

// ═══════════════════════════════════════════════════════════
// INTRO MESSAGE GENERATOR
// ═══════════════════════════════════════════════════════════

function generateIntroRequest(userProfile, candidateProfile, connectorName, matchData) {
  const userName = userProfile.name || "Hey";
  const candidateName = candidateProfile.display_name;
  const candidateFirst = candidateName.split(" ")[0];
  
  // Pick the strongest reason
  const mainReason = matchData.reasons[0] || "seems like an interesting connection";
  
  return `Hey ${connectorName.split(" ")[0]}! 👋

Would you mind introducing me to ${candidateFirst}? 

${mainReason}

Would love to connect if you think it makes sense!`;
}

function generateIntroMessage(userProfile, candidateProfile, connectorName, matchData) {
  const userName = userProfile.name || "a friend";
  const userFirst = (userProfile.name || "").split(" ")[0] || "them";
  const candidateFirst = candidateProfile.display_name.split(" ")[0];
  
  // Build context from match reasons
  const context = matchData.reasons.slice(0, 2).map(r => 
    r.replace(/^[📍🎯✅🤝💼🔗⚡]\s*/, "")
  ).join(", ");

  return `Hey ${candidateFirst}! 👋

Wanted to connect you with ${userName}${userProfile.role ? ` (${userProfile.role})` : ""}.

${context ? `You two have some overlap: ${context}.` : "Think you'd have a lot to chat about."}

${userFirst}, meet ${candidateFirst}${candidateProfile.brain?.role ? ` — ${candidateProfile.brain.role}` : ""}${candidateProfile.brain?.company ? ` at ${candidateProfile.brain.company}` : ""}.

I'll let you two take it from here! 🤝`;
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function SecondDegreeMatcher({ onBack }) {
  // User profile state
  const [userProfile, setUserProfile] = useState({
    name: "",
    city: "",
    role: "",
    industry: "",
    interests: [],
    looking_for: [],
    offering: [],
    affinities: {},
  });
  
  // Connector info
  const [connectorName, setConnectorName] = useState("");
  
  // Analysis state
  const [matches, setMatches] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState(null);
  
  // Interest input
  const [interestInput, setInterestInput] = useState("");
  const [lookingForInput, setLookingForInput] = useState("");
  const [offeringInput, setOfferingInput] = useState("");
  
  const fileRef = useRef(null);

  // Handle interest additions
  const addInterest = useCallback(() => {
    if (interestInput.trim()) {
      setUserProfile(p => ({
        ...p,
        interests: [...p.interests, interestInput.trim().toLowerCase()]
      }));
      setInterestInput("");
    }
  }, [interestInput]);

  const addLookingFor = useCallback(() => {
    if (lookingForInput.trim()) {
      setUserProfile(p => ({
        ...p,
        looking_for: [...p.looking_for, lookingForInput.trim()]
      }));
      setLookingForInput("");
    }
  }, [lookingForInput]);

  const addOffering = useCallback(() => {
    if (offeringInput.trim()) {
      setUserProfile(p => ({
        ...p,
        offering: [...p.offering, offeringInput.trim()]
      }));
      setOfferingInput("");
    }
  }, [offeringInput]);

  // Process the chat
  const processFile = useCallback(async (text) => {
    setProcessing(true);
    setProcessingStatus("Parsing messages...");

    // Parse chat
    const parsedChat = parseWhatsAppText(text);
    if (parsedChat.stats.totalMessages === 0) {
      setProcessing(false);
      setProcessingStatus("No messages found");
      return;
    }

    setProcessingStatus(`Found ${parsedChat.stats.totalMembers} members, ${parsedChat.stats.totalMessages} messages`);

    // Extract deep signals
    setProcessingStatus("Extracting signals...");
    const memberNames = parsedChat.members.map(m => m.name);
    const deepSignals = {
      intents: extractIntents(parsedChat.messages),
      endorsements: extractEndorsements(parsedChat.messages, memberNames),
      selfDisclosures: extractSelfDisclosures(parsedChat.messages),
      relationshipGraph: buildRelationshipGraph(parsedChat),
    };

    // Enrich profiles
    setProcessingStatus("Building profiles...");
    let profiles = enrichProfiles(parsedChat);

    // Try Claude Brain API for richer profiles
    try {
      setProcessingStatus("🧠 Brain analyzing profiles...");
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chatText: text,
          mode: "profiles_only", // Just get profiles, not full analysis
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.profiles && data.profiles.length > 0) {
          // Merge Brain profiles with local profiles
          profiles = profiles.map(localProfile => {
            const brainProfile = data.profiles.find(bp => 
              bp.name.toLowerCase() === localProfile.display_name.toLowerCase()
            );
            if (brainProfile) {
              return {
                ...localProfile,
                brain: {
                  role: brainProfile.role,
                  company: brainProfile.company,
                  industry: brainProfile.industry,
                  expertise: brainProfile.expertise || [],
                  looking_for: brainProfile.looking_for || [],
                  offering: brainProfile.offering || [],
                  personality_notes: brainProfile.personality_notes,
                },
              };
            }
            return localProfile;
          });
        }
      }
    } catch (e) {
      // Continue with local profiles
      setProcessingStatus("Running local analysis...");
    }

    // Score each profile against user
    setProcessingStatus("Finding your matches...");
    const scoredMatches = profiles
      .map(profile => {
        const matchData = scoreMatch(userProfile, profile, deepSignals);
        return {
          profile,
          ...matchData,
          introRequest: generateIntroRequest(userProfile, profile, connectorName || "your friend", matchData),
          introMessage: generateIntroMessage(userProfile, profile, connectorName || "your friend", matchData),
        };
      })
      .filter(m => m.score > 20) // Minimum relevance threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10 matches

    setMatches({
      profiles,
      scoredMatches,
      parsedChat,
      deepSignals,
    });
    setProcessing(false);
    setProcessingStatus("");
  }, [userProfile, connectorName]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => processFile(e.target.result);
    reader.readAsText(file);
  }, [processFile]);

  const copy = useCallback((text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // Styles
  const card = { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 };
  const tag = (bg, color, bc) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, marginRight: 4, marginBottom: 4, background: bg, color, border: bc ? `1px solid ${bc}` : "none" });
  const secTitle = { fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.textMuted, marginBottom: 12, fontWeight: 600 };
  const btnG = { background: C.green, color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 };
  const btnO = { background: "transparent", color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const inputStyle = { padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

  // ─────────────── RESULTS VIEW ───────────────
  if (matches) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", background: C.bg, color: C.text, minHeight: "100vh" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 6, textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>▲ Connex</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Your Matches in {connectorName || "this network"}</div>
            </div>
            <button style={btnO} onClick={() => setMatches(null)}>← Try Another</button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <div style={{ ...card, textAlign: "center", padding: 16, marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.accent }}>{matches.profiles.length}</div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.textMuted }}>People Analyzed</div>
            </div>
            <div style={{ ...card, textAlign: "center", padding: 16, marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.green }}>{matches.scoredMatches.length}</div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.textMuted }}>Matches Found</div>
            </div>
            <div style={{ ...card, textAlign: "center", padding: 16, marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.yellow }}>{matches.scoredMatches.filter(m => m.score >= 50).length}</div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.textMuted }}>Strong Matches</div>
            </div>
          </div>

          {/* No matches */}
          {matches.scoredMatches.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤔</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No strong matches found</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24 }}>
                Try adding more interests or updating what you're looking for
              </div>
              <button style={btnO} onClick={() => setMatches(null)}>← Update Profile</button>
            </div>
          ) : (
            /* Match cards */
            matches.scoredMatches.map((match, idx) => {
              const p = match.profile;
              const isExpanded = expandedMatch === idx;
              const loc = normLoc(p.location?.primary);
              const scoreColor = match.score >= 70 ? C.green : match.score >= 50 ? C.yellow : C.textMuted;
              
              return (
                <div 
                  key={idx} 
                  style={{ 
                    ...card, 
                    borderColor: isExpanded ? C.accent + "60" : match.score >= 70 ? C.green + "40" : C.border,
                    background: match.score >= 70 ? C.greenSoft : C.card,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedMatch(isExpanded ? null : idx)}
                >
                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ 
                          width: 32, height: 32, borderRadius: 8, 
                          background: idx === 0 ? C.accent : idx < 3 ? C.cyan : C.border,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 800, color: idx < 3 ? "#fff" : C.textMuted,
                        }}>
                          {idx + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{p.display_name}</div>
                          {p.brain?.role && (
                            <div style={{ fontSize: 12, color: C.textMuted }}>
                              {p.brain.role}{p.brain.company ? ` @ ${p.brain.company}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Reasons */}
                      <div style={{ marginTop: 10 }}>
                        {match.reasons.slice(0, 3).map((reason, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.textMuted, marginBottom: 3 }}>
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ 
                        padding: "8px 16px", borderRadius: 10,
                        background: scoreColor + "20", 
                        border: `1px solid ${scoreColor}40`,
                      }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{match.score}%</div>
                        <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.textDim }}>Match</div>
                      </div>
                      {loc && (
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>📍 {loc}</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                      {/* Profile details */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                        {p.brain?.expertise?.length > 0 && (
                          <div>
                            <div style={secTitle}>Expertise</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {p.brain.expertise.map((e, i) => (
                                <span key={i} style={tag(C.greenSoft, C.green, C.green + "30")}>{e}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {p.interests?.length > 0 && (
                          <div>
                            <div style={secTitle}>Interests</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {p.interests.map((int, i) => (
                                <span key={i} style={tag(C.accentSoft, C.accent, C.accent + "30")}>
                                  {IE[int.category] || "📋"} {int.category}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {p.brain?.looking_for?.length > 0 && (
                          <div>
                            <div style={secTitle}>Looking For</div>
                            {p.brain.looking_for.map((l, i) => (
                              <div key={i} style={{ fontSize: 12, color: C.yellow, marginBottom: 2 }}>→ {l}</div>
                            ))}
                          </div>
                        )}
                        
                        {p.brain?.offering?.length > 0 && (
                          <div>
                            <div style={secTitle}>Can Offer</div>
                            {p.brain.offering.map((o, i) => (
                              <div key={i} style={{ fontSize: 12, color: C.green, marginBottom: 2 }}>→ {o}</div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Evidence from chat */}
                      {match.evidence.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={secTitle}>📜 Evidence from Chat</div>
                          {match.evidence.map((ev, i) => (
                            <div key={i} style={{ 
                              background: C.bg, 
                              borderRadius: 8, 
                              padding: 12, 
                              marginBottom: 8,
                              border: `1px solid ${C.border}`,
                            }}>
                              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                                {ev.type === "endorsement" ? `Endorsed by ${ev.by}` : 
                                 ev.type === "self_disclosure" ? `Self-disclosed ${ev.field}` :
                                 ev.type === "intent" ? `Intent: ${ev.intentType}` : ev.type}
                              </div>
                              <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
                                "{ev.quote}"
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Intro messages */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {/* Request to connector */}
                        <div>
                          <div style={secTitle}>📤 Ask {connectorName || "Your Friend"} for Intro</div>
                          <div style={{ 
                            background: C.bg, 
                            borderRadius: 8, 
                            padding: 14,
                            border: `1px solid ${C.border}`,
                            fontSize: 12,
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            color: C.textMuted,
                          }}>
                            {match.introRequest}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); copy(match.introRequest); }}
                            style={{ ...btnO, marginTop: 10, fontSize: 11, padding: "6px 14px" }}
                          >
                            📋 Copy Request
                          </button>
                        </div>

                        {/* Intro message to forward */}
                        <div>
                          <div style={secTitle}>📨 Intro Message (for {connectorName || "them"} to send)</div>
                          <div style={{ 
                            background: C.bg, 
                            borderRadius: 8, 
                            padding: 14,
                            border: `1px solid ${C.border}`,
                            fontSize: 12,
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            color: C.textMuted,
                          }}>
                            {match.introMessage}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); copy(match.introMessage); }}
                            style={{ ...btnO, marginTop: 10, fontSize: 11, padding: "6px 14px" }}
                          >
                            📋 Copy Intro
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        
        {copied && (
          <div style={{ 
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", 
            background: C.green, color: "#000", padding: "10px 24px", borderRadius: 8, 
            fontSize: 12, fontWeight: 700, letterSpacing: 1, zIndex: 999 
          }}>
            ✓ COPIED TO CLIPBOARD
          </div>
        )}
      </div>
    );
  }

  // ─────────────── INPUT VIEW ───────────────
  return (
    <div style={{ fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
          <div style={{ fontSize: 13, letterSpacing: 6, textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>▲ Connex</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "8px 0", letterSpacing: -0.5 }}>2nd Degree Network Finder</h1>
          <p style={{ fontSize: 13, color: C.textMuted, maxWidth: 480, margin: "0 auto" }}>
            Upload a friend's group chat → find who YOU should meet in THEIR network
          </p>
        </div>

        {onBack && (
          <div style={{ marginBottom: 20 }}>
            <button style={btnO} onClick={onBack}>← Back to Group Analysis</button>
          </div>
        )}

        {/* Step 1: Your Profile */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Step 1: Tell us about YOU
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
            The more context you provide, the better we can match you
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>YOUR NAME</div>
              <input 
                value={userProfile.name} 
                onChange={(e) => setUserProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="Nathan"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>YOUR CITY</div>
              <input 
                value={userProfile.city} 
                onChange={(e) => setUserProfile(p => ({ ...p, city: e.target.value }))}
                placeholder="Bangkok"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>YOUR ROLE</div>
              <input 
                value={userProfile.role} 
                onChange={(e) => setUserProfile(p => ({ ...p, role: e.target.value }))}
                placeholder="Investor / Operator"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>INDUSTRY</div>
              <input 
                value={userProfile.industry} 
                onChange={(e) => setUserProfile(p => ({ ...p, industry: e.target.value }))}
                placeholder="Tech / Crypto"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Interests */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>YOUR INTERESTS</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input 
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addInterest()}
                placeholder="crypto, UFC, wellness..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addInterest} style={{ ...btnO, padding: "8px 16px" }}>Add</button>
            </div>
            {userProfile.interests.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {userProfile.interests.map((int, i) => (
                  <span key={i} style={tag(C.accentSoft, C.accent, C.accent + "30")}>
                    {int}
                    <span 
                      onClick={() => setUserProfile(p => ({ ...p, interests: p.interests.filter((_, idx) => idx !== i) }))}
                      style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                    >×</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Looking For */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>WHAT YOU'RE LOOKING FOR</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input 
                value={lookingForInput}
                onChange={(e) => setLookingForInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLookingFor()}
                placeholder="technical cofounder, investors, mentors..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addLookingFor} style={{ ...btnO, padding: "8px 16px" }}>Add</button>
            </div>
            {userProfile.looking_for.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {userProfile.looking_for.map((item, i) => (
                  <span key={i} style={tag(C.yellowSoft, C.yellow, C.yellow + "30")}>
                    {item}
                    <span 
                      onClick={() => setUserProfile(p => ({ ...p, looking_for: p.looking_for.filter((_, idx) => idx !== i) }))}
                      style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                    >×</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Offering */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, letterSpacing: 1 }}>WHAT YOU CAN OFFER</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input 
                value={offeringInput}
                onChange={(e) => setOfferingInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addOffering()}
                placeholder="investment advice, product feedback, intros..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addOffering} style={{ ...btnO, padding: "8px 16px" }}>Add</button>
            </div>
            {userProfile.offering.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {userProfile.offering.map((item, i) => (
                  <span key={i} style={tag(C.greenSoft, C.green, C.green + "30")}>
                    {item}
                    <span 
                      onClick={() => setUserProfile(p => ({ ...p, offering: p.offering.filter((_, idx) => idx !== i) }))}
                      style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                    >×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Connector */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Step 2: Who's your connector?
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>
            The friend whose network you're exploring
          </div>
          <input 
            value={connectorName}
            onChange={(e) => setConnectorName(e.target.value)}
            placeholder="Arul"
            style={inputStyle}
          />
        </div>

        {/* Step 3: Upload */}
        <div 
          style={{ 
            ...card, 
            border: `2px dashed ${C.accent}`, 
            textAlign: "center", 
            padding: 40,
            cursor: "pointer",
            background: processing ? C.accentSoft : C.card,
          }}
          onClick={() => !processing && fileRef.current?.click()}
        >
          <input 
            ref={fileRef} 
            type="file" 
            accept=".txt,.text" 
            style={{ display: "none" }} 
            onChange={(e) => handleFile(e.target.files[0])} 
          />
          
          {processing ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Analyzing...</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{processingStatus}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                Step 3: Upload {connectorName ? `${connectorName}'s` : "their"} group chat
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                WhatsApp → Export Chat → Without Media → Drop here
              </div>
            </>
          )}
        </div>

        {/* How it works */}
        <div style={{ ...card, marginTop: 24, padding: 24 }}>
          <div style={secTitle}>How it works</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
            {[
              { i: "👤", t: "Your Profile", d: "Tell us about you, your interests, what you need" },
              { i: "📁", t: "Their Chat", d: "Upload a friend's group chat export" },
              { i: "🧠", t: "Brain Match", d: "We score everyone against YOUR profile" },
              { i: "📋", t: "Get Intros", d: "Copy ready-to-send intro request messages" },
            ].map((s, idx) => (
              <div key={idx} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{s.i}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{s.t}</div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
