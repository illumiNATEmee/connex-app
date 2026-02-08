import { useState } from "react";
import { API_BASE } from "./config.js";

/**
 * IDENTITY VERIFIER
 * 
 * Human-in-the-loop component for verifying identities
 * Shows search results, asks user to confirm/provide handles
 */

const C = {
  bg: "#0a0a0f", card: "#12121a", border: "#1e1e2e",
  accent: "#6366f1", accentSoft: "#6366f120",
  green: "#22c55e", greenSoft: "#22c55e20",
  yellow: "#eab308", yellowSoft: "#eab30820",
  red: "#ef4444", redSoft: "#ef444420",
  cyan: "#06b6d4", cyanSoft: "#06b6d420",
  text: "#e2e2ef", textMuted: "#8888a0", textDim: "#55556a",
};

function ConfidenceBadge({ tier }) {
  const styles = {
    verified: { bg: C.greenSoft, color: C.green, text: "✓ Verified" },
    likely: { bg: C.cyanSoft, color: C.cyan, text: "Likely" },
    possible: { bg: C.yellowSoft, color: C.yellow, text: "Possible" },
    unverified: { bg: C.redSoft, color: C.red, text: "Unverified" },
  };
  
  const style = styles[tier] || styles.unverified;
  
  return (
    <span style={{
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: style.bg,
      color: style.color,
    }}>
      {style.text}
    </span>
  );
}

export default function IdentityVerifier({ profile, onVerified, onSkip }) {
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [manualInput, setManualInput] = useState({
    linkedin: "",
    twitter: "",
    instagram: "",
  });
  const [error, setError] = useState(null);
  
  const handleSearch = async () => {
    setSearching(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/research/web`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.display_name || profile.name,
          hints: {
            city: profile.location?.city || profile.city,
            context: profile.context,
          },
        }),
      });
      
      if (!res.ok) throw new Error("Search failed");
      
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };
  
  const handleVerify = () => {
    const verifiedProfile = {
      ...profile,
      identity_verified: true,
      verified_at: new Date().toISOString(),
    };
    
    // Add selected search result
    if (selectedResult) {
      if (selectedResult.url?.includes("linkedin.com")) {
        verifiedProfile.linkedin_url = selectedResult.url;
        verifiedProfile.linkedin_source = "user_selected";
      }
      if (selectedResult.url?.includes("twitter.com") || selectedResult.url?.includes("x.com")) {
        verifiedProfile.twitter_url = selectedResult.url;
        verifiedProfile.twitter_source = "user_selected";
      }
    }
    
    // Add manual inputs
    if (manualInput.linkedin) {
      verifiedProfile.linkedin_url = manualInput.linkedin;
      verifiedProfile.linkedin_source = "user_input";
    }
    if (manualInput.twitter) {
      verifiedProfile.twitter_handle = manualInput.twitter.replace("@", "");
      verifiedProfile.twitter_source = "user_input";
    }
    if (manualInput.instagram) {
      verifiedProfile.instagram_handle = manualInput.instagram.replace("@", "");
      verifiedProfile.instagram_source = "user_input";
    }
    
    // Recalculate confidence
    let confidence = 50; // Base for user verified
    if (verifiedProfile.linkedin_url) confidence += 25;
    if (verifiedProfile.twitter_handle) confidence += 15;
    if (verifiedProfile.instagram_handle) confidence += 10;
    verifiedProfile.identity_confidence = {
      score: Math.min(confidence, 100),
      tier: confidence >= 80 ? "verified" : confidence >= 50 ? "likely" : "possible",
    };
    
    onVerified(verifiedProfile);
  };
  
  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 13,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    outline: "none",
  };
  
  const cardStyle = {
    background: C.card,
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    padding: 20,
    marginBottom: 16,
  };
  
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ ...cardStyle, textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
          Verify Identity
        </h2>
        <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>
          Help us confirm who <strong>{profile.display_name || profile.name}</strong> is
        </p>
        
        {profile.identity_confidence && (
          <div style={{ marginTop: 12 }}>
            <ConfidenceBadge tier={profile.identity_confidence.tier} />
          </div>
        )}
      </div>
      
      {/* What we know */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>
          What We Know
        </h3>
        <div style={{ fontSize: 13, color: C.text }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Name:</strong> {profile.display_name || profile.name}
          </div>
          {profile.location?.city && (
            <div style={{ marginBottom: 8 }}>
              <strong>Location hint:</strong> {profile.location.city}
            </div>
          )}
          {profile.message_count && (
            <div style={{ marginBottom: 8 }}>
              <strong>Messages:</strong> {profile.message_count}
            </div>
          )}
          {profile.context && (
            <div style={{ marginBottom: 8 }}>
              <strong>Context:</strong> {profile.context}
            </div>
          )}
        </div>
      </div>
      
      {/* Search for profiles */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>
          Find Their Profiles
        </h3>
        
        <button
          onClick={handleSearch}
          disabled={searching}
          style={{
            width: "100%",
            padding: "12px",
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: searching ? "not-allowed" : "pointer",
            opacity: searching ? 0.7 : 1,
          }}
        >
          {searching ? "Searching..." : "🔍 Search Web for Profiles"}
        </button>
        
        {error && (
          <div style={{ marginTop: 12, padding: 12, background: C.redSoft, borderRadius: 8, color: C.red, fontSize: 12 }}>
            {error}
          </div>
        )}
        
        {/* Search results */}
        {searchResults && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
              Found {searchResults.raw_data?.length || 0} results — select the correct one:
            </div>
            
            {searchResults.raw_data?.slice(0, 5).map((result, i) => (
              <div
                key={i}
                onClick={() => setSelectedResult(selectedResult?.url === result.url ? null : result)}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: selectedResult?.url === result.url ? C.greenSoft : C.bg,
                  border: `1px solid ${selectedResult?.url === result.url ? C.green : C.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                  {selectedResult?.url === result.url && "✓ "}{result.title}
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>
                  {result.url}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  {result.description?.slice(0, 150)}...
                </div>
              </div>
            ))}
            
            <div
              onClick={() => setSelectedResult({ url: "none", title: "None of these" })}
              style={{
                padding: 12,
                background: selectedResult?.url === "none" ? C.yellowSoft : C.bg,
                border: `1px solid ${selectedResult?.url === "none" ? C.yellow : C.border}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "center",
                fontSize: 13,
                color: C.textMuted,
              }}
            >
              ❌ None of these are correct
            </div>
          </div>
        )}
      </div>
      
      {/* Manual input */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>
          Or Enter Directly
        </h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: C.textDim, display: "block", marginBottom: 4 }}>
              LinkedIn URL
            </label>
            <input
              type="url"
              placeholder="https://linkedin.com/in/..."
              value={manualInput.linkedin}
              onChange={(e) => setManualInput({ ...manualInput, linkedin: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={{ fontSize: 11, color: C.textDim, display: "block", marginBottom: 4 }}>
              Twitter/X Handle
            </label>
            <input
              type="text"
              placeholder="@username"
              value={manualInput.twitter}
              onChange={(e) => setManualInput({ ...manualInput, twitter: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={{ fontSize: 11, color: C.textDim, display: "block", marginBottom: 4 }}>
              Instagram Handle
            </label>
            <input
              type="text"
              placeholder="@username"
              value={manualInput.instagram}
              onChange={(e) => setManualInput({ ...manualInput, instagram: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: "14px",
            background: C.card,
            color: C.textMuted,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Skip for Now
        </button>
        
        <button
          onClick={handleVerify}
          disabled={!selectedResult && !manualInput.linkedin && !manualInput.twitter && !manualInput.instagram}
          style={{
            flex: 2,
            padding: "14px",
            background: C.green,
            color: "#000",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            opacity: (!selectedResult && !manualInput.linkedin && !manualInput.twitter && !manualInput.instagram) ? 0.5 : 1,
          }}
        >
          ✓ Verify Identity
        </button>
      </div>
    </div>
  );
}
