import { useState } from "react";
import { API_BASE } from "./config.js";

// ═══════════════════════════════════════════════════════════
// PROFILE BUILDER
// Manual input → rich profile pipeline
// ═══════════════════════════════════════════════════════════

const C = {
  bg: "#0a0a0f", card: "#12121a", border: "#1e1e2e",
  accent: "#6366f1", accentSoft: "#6366f120",
  green: "#22c55e", greenSoft: "#22c55e20", 
  yellow: "#eab308", yellowSoft: "#eab30820",
  red: "#ef4444", redSoft: "#ef444420",
  cyan: "#06b6d4", cyanSoft: "#06b6d420",
  text: "#e2e2ef", textMuted: "#8888a0", textDim: "#55556a",
};

function StatusBadge({ status }) {
  if (status === true || status === "verified") {
    return <span style={{ color: C.green, fontSize: 12 }}>✓ verified</span>;
  }
  if (status === false) {
    return <span style={{ color: C.red, fontSize: 12 }}>✗ not found</span>;
  }
  if (status === "pending") {
    return <span style={{ color: C.yellow, fontSize: 12 }}>⏳ checking...</span>;
  }
  return <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>;
}

function CompletionRing({ percent }) {
  const radius = 40;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  
  const color = percent >= 70 ? C.green : percent >= 40 ? C.yellow : C.red;
  
  return (
    <div style={{ position: "relative", width: radius * 2, height: radius * 2 }}>
      <svg height={radius * 2} width={radius * 2} style={{ transform: "rotate(-90deg)" }}>
        <circle
          stroke={C.border}
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease" }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: 16,
        fontWeight: 700,
        color: color,
      }}>
        {percent}%
      </div>
    </div>
  );
}

export default function ProfileBuilder({ onBack }) {
  const [mode, setMode] = useState("single"); // single | batch
  const [inputs, setInputs] = useState({
    name: "",
    phone: "",
    email: "",
    linkedin: "",
    instagram: "",
    x: "",
  });
  
  const [processing, setProcessing] = useState(false);
  const [quickMode, setQuickMode] = useState(true); // Start with quick verification
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState("input"); // input | processing | result
  
  // Batch import state
  const [csvText, setCsvText] = useState("");
  const [parsedProfiles, setParsedProfiles] = useState([]);
  const [batchResult, setBatchResult] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  
  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };
  
  const handleQuickCheck = async () => {
    setProcessing(true);
    setError(null);
    setStep("processing");
    
    try {
      const res = await fetch(`${API_BASE}/api/profile/quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      
      if (!res.ok) throw new Error("Failed to verify profile");
      
      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (e) {
      setError(e.message);
      setStep("input");
    } finally {
      setProcessing(false);
    }
  };
  
  const handleFullBuild = async () => {
    setProcessing(true);
    setError(null);
    setStep("processing");
    
    try {
      const res = await fetch(`${API_BASE}/api/profile/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      
      if (!res.ok) throw new Error("Failed to build profile");
      
      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (e) {
      setError(e.message);
      setStep("input");
    } finally {
      setProcessing(false);
    }
  };
  
  const handleReset = () => {
    setInputs({ name: "", phone: "", email: "", linkedin: "", instagram: "", x: "" });
    setResult(null);
    setBatchResult(null);
    setParsedProfiles([]);
    setCsvText("");
    setError(null);
    setStep("input");
  };
  
  // Batch import handlers
  const handleParseCSV = async () => {
    if (!csvText.trim()) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/profile/parse-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      
      if (!res.ok) throw new Error("Failed to parse CSV");
      
      const data = await res.json();
      setParsedProfiles(data.profiles);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };
  
  const handleBatchImport = async (quick = false) => {
    if (parsedProfiles.length === 0) return;
    
    setProcessing(true);
    setError(null);
    setStep("processing");
    setBatchProgress({ current: 0, total: parsedProfiles.length });
    
    try {
      const res = await fetch(`${API_BASE}/api/profile/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          profiles: parsedProfiles,
          quickMode: quick,
          concurrency: 3,
        }),
      });
      
      if (!res.ok) throw new Error("Batch import failed");
      
      const data = await res.json();
      setBatchResult(data);
      setStep("result");
    } catch (e) {
      setError(e.message);
      setStep("input");
    } finally {
      setProcessing(false);
    }
  };
  
  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    fontSize: 14,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    outline: "none",
    transition: "border-color 0.2s",
  };
  
  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: C.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  
  const buttonStyle = (primary = false) => ({
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.2s",
    background: primary ? C.accent : C.card,
    color: primary ? "#fff" : C.text,
  });
  
  // ─── INPUT FORM ───
  if (step === "input") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            {onBack && (
              <button 
                onClick={onBack}
                style={{ 
                  background: "none", 
                  border: "none", 
                  color: C.textMuted, 
                  cursor: "pointer",
                  fontSize: 14,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ← Back
              </button>
            )}
            <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
              🏗️ Profile Builder
            </h1>
            <p style={{ color: C.textMuted, marginTop: 8, fontSize: 14 }}>
              Build rich profiles from basic inputs
            </p>
          </div>
          
          {/* Mode Toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <button
              onClick={() => setMode("single")}
              style={{
                flex: 1,
                padding: "12px",
                background: mode === "single" ? C.accent : C.card,
                color: mode === "single" ? "#fff" : C.textMuted,
                border: `1px solid ${mode === "single" ? C.accent : C.border}`,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              👤 Single Profile
            </button>
            <button
              onClick={() => setMode("batch")}
              style={{
                flex: 1,
                padding: "12px",
                background: mode === "batch" ? C.cyan : C.card,
                color: mode === "batch" ? "#fff" : C.textMuted,
                border: `1px solid ${mode === "batch" ? C.cyan : C.border}`,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              📋 Batch Import (CSV)
            </button>
          </div>
          
          {/* ─── SINGLE PROFILE FORM ─── */}
          {mode === "single" && (
          <div style={{ 
            background: C.card, 
            borderRadius: 12, 
            padding: 24,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "grid", gap: 20 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input
                  type="text"
                  placeholder="Sarah Chen"
                  value={inputs.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  style={inputStyle}
                />
              </div>
              
              {/* Phone */}
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="+1 415 555 1234"
                  value={inputs.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                  We'll infer city/region from area code
                </p>
              </div>
              
              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  placeholder="sarah@example.com"
                  value={inputs.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  style={inputStyle}
                />
              </div>
              
              {/* Divider */}
              <div style={{ 
                borderTop: `1px solid ${C.border}`, 
                margin: "8px 0",
                position: "relative",
              }}>
                <span style={{
                  position: "absolute",
                  top: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: C.card,
                  padding: "0 12px",
                  fontSize: 11,
                  color: C.textDim,
                  textTransform: "uppercase",
                }}>
                  Social Profiles
                </span>
              </div>
              
              {/* LinkedIn */}
              <div>
                <label style={labelStyle}>LinkedIn URL</label>
                <input
                  type="url"
                  placeholder="https://linkedin.com/in/sarahchen"
                  value={inputs.linkedin}
                  onChange={(e) => handleInputChange("linkedin", e.target.value)}
                  style={inputStyle}
                />
              </div>
              
              {/* Instagram */}
              <div>
                <label style={labelStyle}>Instagram Handle</label>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.textDim,
                  }}>@</span>
                  <input
                    type="text"
                    placeholder="sarahchen"
                    value={inputs.instagram}
                    onChange={(e) => handleInputChange("instagram", e.target.value.replace("@", ""))}
                    style={{ ...inputStyle, paddingLeft: 28 }}
                  />
                </div>
              </div>
              
              {/* X/Twitter */}
              <div>
                <label style={labelStyle}>X (Twitter) Handle</label>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.textDim,
                  }}>@</span>
                  <input
                    type="text"
                    placeholder="sarahchen"
                    value={inputs.x}
                    onChange={(e) => handleInputChange("x", e.target.value.replace("@", ""))}
                    style={{ ...inputStyle, paddingLeft: 28 }}
                  />
                </div>
              </div>
            </div>
            
            {/* Error */}
            {error && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: C.redSoft,
                borderRadius: 8,
                color: C.red,
                fontSize: 13,
              }}>
                {error}
              </div>
            )}
            
            {/* Actions */}
            <div style={{ 
              display: "flex", 
              gap: 12, 
              marginTop: 24,
              justifyContent: "flex-end",
            }}>
              <button
                onClick={handleQuickCheck}
                disabled={!inputs.name && !inputs.phone && !inputs.email}
                style={{
                  ...buttonStyle(false),
                  opacity: (!inputs.name && !inputs.phone && !inputs.email) ? 0.5 : 1,
                }}
              >
                Quick Verify
              </button>
              <button
                onClick={handleFullBuild}
                disabled={!inputs.name && !inputs.phone && !inputs.email}
                style={{
                  ...buttonStyle(true),
                  opacity: (!inputs.name && !inputs.phone && !inputs.email) ? 0.5 : 1,
                }}
              >
                Build Full Profile
              </button>
            </div>
          </div>
          )}
          
          {/* Info - only show for single mode */}
          {mode === "single" && (
          <div style={{ 
            marginTop: 24, 
            padding: 16, 
            background: C.cyanSoft, 
            borderRadius: 8,
            border: `1px solid ${C.cyan}30`,
          }}>
            <p style={{ fontSize: 13, color: C.cyan, margin: 0 }}>
              <strong>Quick Verify:</strong> Just checks if handles exist (fast, no enrichment)<br />
              <strong>Full Build:</strong> Fetches bios, work history, interests from each platform
            </p>
          </div>
          )}
          
          {/* ─── BATCH IMPORT FORM ─── */}
          {mode === "batch" && (
          <div style={{ 
            background: C.card, 
            borderRadius: 12, 
            padding: 24,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Paste CSV Data</label>
              <textarea
                placeholder={`name,phone,linkedin,instagram,x
Sarah Chen,+14155551234,https://linkedin.com/in/sarah,sarah_sf,sarahchen
Mike Wang,+16502223333,,,mikew`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                style={{
                  ...inputStyle,
                  minHeight: 150,
                  fontFamily: "monospace",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
              <p style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                Columns: name, phone, email, linkedin, instagram, x (twitter)
              </p>
            </div>
            
            <button
              onClick={handleParseCSV}
              disabled={!csvText.trim()}
              style={{
                ...buttonStyle(false),
                width: "100%",
                opacity: !csvText.trim() ? 0.5 : 1,
              }}
            >
              Parse CSV
            </button>
            
            {/* Parsed Preview */}
            {parsedProfiles.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  marginBottom: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {parsedProfiles.length} profiles parsed
                  </span>
                  <button
                    onClick={() => setParsedProfiles([])}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.textMuted,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Clear
                  </button>
                </div>
                
                <div style={{ 
                  maxHeight: 200, 
                  overflow: "auto", 
                  background: C.bg,
                  borderRadius: 8,
                  padding: 12,
                }}>
                  {parsedProfiles.slice(0, 10).map((p, i) => (
                    <div key={i} style={{ 
                      display: "flex", 
                      gap: 12, 
                      padding: "8px 0",
                      borderBottom: i < Math.min(parsedProfiles.length, 10) - 1 ? `1px solid ${C.border}` : "none",
                      fontSize: 12,
                    }}>
                      <span style={{ color: C.text, fontWeight: 500, minWidth: 120 }}>
                        {p.name || "—"}
                      </span>
                      <span style={{ color: C.textMuted }}>
                        {p.phone || ""}
                      </span>
                      <span style={{ color: C.textDim, flex: 1, textAlign: "right" }}>
                        {[p.linkedin && "in", p.instagram && "ig", p.x && "x"].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  ))}
                  {parsedProfiles.length > 10 && (
                    <div style={{ color: C.textDim, fontSize: 11, marginTop: 8 }}>
                      + {parsedProfiles.length - 10} more...
                    </div>
                  )}
                </div>
                
                {/* Batch Actions */}
                <div style={{ 
                  display: "flex", 
                  gap: 12, 
                  marginTop: 16,
                  justifyContent: "flex-end",
                }}>
                  <button
                    onClick={() => handleBatchImport(true)}
                    style={buttonStyle(false)}
                  >
                    Quick Verify All
                  </button>
                  <button
                    onClick={() => handleBatchImport(false)}
                    style={buttonStyle(true)}
                  >
                    Full Build All
                  </button>
                </div>
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: C.redSoft,
                borderRadius: 8,
                color: C.red,
                fontSize: 13,
              }}>
                {error}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    );
  }
  
  // ─── PROCESSING ───
  if (step === "processing") {
    const isBatch = mode === "batch" && parsedProfiles.length > 0;
    
    return (
      <div style={{ 
        minHeight: "100vh", 
        background: C.bg, 
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 60,
            height: 60,
            border: `3px solid ${C.border}`,
            borderTopColor: isBatch ? C.cyan : C.accent,
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 24px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <h2 style={{ color: C.text, fontSize: 20, margin: 0 }}>
            {isBatch ? `Processing ${parsedProfiles.length} Profiles...` : "Building Profile..."}
          </h2>
          <p style={{ color: C.textMuted, marginTop: 8 }}>
            {isBatch ? "This may take a minute" : "Verifying handles and enriching data"}
          </p>
        </div>
      </div>
    );
  }
  
  // ─── BATCH RESULT ───
  if (step === "result" && batchResult) {
    const { results, errors, summary } = batchResult;
    
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: 24,
          }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
                📋 Batch Import Complete
              </h1>
              <p style={{ color: C.textMuted, marginTop: 4, fontSize: 14 }}>
                {summary.successful} of {summary.total} profiles processed successfully
              </p>
            </div>
            <CompletionRing percent={Math.round((summary.successful / summary.total) * 100)} />
          </div>
          
          {/* Summary Cards */}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 24 }}>
            <div style={{ background: C.greenSoft, borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.green }}>{summary.successful}</div>
              <div style={{ fontSize: 12, color: C.green }}>Successful</div>
            </div>
            <div style={{ background: C.redSoft, borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.red }}>{summary.failed}</div>
              <div style={{ fontSize: 12, color: C.red }}>Failed</div>
            </div>
            <div style={{ background: C.accentSoft, borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>{summary.avgCompleteness}%</div>
              <div style={{ fontSize: 12, color: C.accent }}>Avg Completeness</div>
            </div>
          </div>
          
          {/* Results Table */}
          <div style={{ 
            background: C.card, 
            borderRadius: 12, 
            padding: 20,
            border: `1px solid ${C.border}`,
          }}>
            <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 16px", fontWeight: 600 }}>
              Processed Profiles
            </h3>
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {results.map((r, i) => {
                const p = r.result?.merged_profile || r.input;
                const comp = r.result?.completeness || 0;
                
                return (
                  <div key={i} style={{ 
                    display: "flex", 
                    alignItems: "center",
                    gap: 12, 
                    padding: "12px 0",
                    borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : "none",
                  }}>
                    <span style={{ 
                      color: r.success ? C.green : C.red, 
                      fontSize: 16,
                    }}>
                      {r.success ? "✓" : "✗"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.text, fontWeight: 500, fontSize: 13 }}>
                        {p.name || r.input.name}
                      </div>
                      <div style={{ color: C.textDim, fontSize: 11 }}>
                        {r.result?.phone_info?.city || r.input.phone || "—"}
                      </div>
                    </div>
                    <div style={{ 
                      width: 60, 
                      textAlign: "center",
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: comp >= 50 ? C.greenSoft : comp >= 25 ? C.yellowSoft : C.redSoft,
                      color: comp >= 50 ? C.green : comp >= 25 ? C.yellow : C.red,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {comp}%
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 11, width: 100, textAlign: "right" }}>
                      {[
                        r.result?.verifications?.instagram?.exists && "ig",
                        r.result?.verifications?.x?.exists && "x",
                        r.result?.verifications?.linkedin?.exists && "in",
                      ].filter(Boolean).join(", ") || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Errors (if any) */}
          {errors.length > 0 && (
            <div style={{ 
              background: C.card, 
              borderRadius: 12, 
              padding: 20,
              border: `1px solid ${C.red}30`,
              marginTop: 16,
            }}>
              <h3 style={{ color: C.red, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                Failed Profiles
              </h3>
              {errors.map((e, i) => (
                <div key={i} style={{ 
                  padding: "8px 0", 
                  borderBottom: i < errors.length - 1 ? `1px solid ${C.border}` : "none",
                  fontSize: 12,
                }}>
                  <span style={{ color: C.text }}>{e.input.name || e.input.phone}</span>
                  <span style={{ color: C.textDim, marginLeft: 8 }}>— {e.error}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Actions */}
          <div style={{ 
            display: "flex", 
            gap: 12, 
            marginTop: 24,
            justifyContent: "center",
          }}>
            <button onClick={handleReset} style={buttonStyle(true)}>
              Import More Profiles
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // ─── SINGLE RESULT ───
  if (step === "result" && result) {
    const profile = result.merged_profile || {};
    const phoneInfo = result.phone_info;
    const verifications = result.verifications || {};
    const enrichments = result.enrichments || {};
    const completeness = result.completeness || 0;
    const gaps = result.gaps || [];
    
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: 24,
          }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
                {profile.name || inputs.name}
              </h1>
              {phoneInfo?.city && (
                <p style={{ color: C.textMuted, marginTop: 4, fontSize: 14 }}>
                  📍 {phoneInfo.city}, {phoneInfo.state} ({phoneInfo.region})
                </p>
              )}
            </div>
            <CompletionRing percent={completeness} />
          </div>
          
          {/* Cards Grid */}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            
            {/* Phone Info Card */}
            {phoneInfo && (
              <div style={{ 
                background: C.card, 
                borderRadius: 12, 
                padding: 20,
                border: `1px solid ${C.border}`,
              }}>
                <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                  📱 Phone Signals
                </h3>
                <div style={{ fontSize: 13, color: C.textMuted }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>Area Code</span>
                    <span style={{ color: C.text }}>{phoneInfo.area_code || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>City</span>
                    <span style={{ color: C.text }}>{phoneInfo.city || "Unknown"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>Region</span>
                    <span style={{ color: C.text }}>{phoneInfo.region || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Confidence</span>
                    <span style={{ color: phoneInfo.confidence >= 0.6 ? C.green : C.yellow }}>
                      {Math.round((phoneInfo.confidence || 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Social Verification Card */}
            <div style={{ 
              background: C.card, 
              borderRadius: 12, 
              padding: 20,
              border: `1px solid ${C.border}`,
            }}>
              <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                🔗 Social Profiles
              </h3>
              <div style={{ display: "grid", gap: 12 }}>
                {inputs.linkedin && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>LinkedIn</span>
                    <StatusBadge status={verifications.linkedin?.exists} />
                  </div>
                )}
                {inputs.instagram && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>
                      Instagram @{inputs.instagram}
                    </span>
                    <StatusBadge status={verifications.instagram?.exists} />
                  </div>
                )}
                {inputs.x && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>
                      X @{inputs.x}
                    </span>
                    <StatusBadge status={verifications.x?.exists} />
                  </div>
                )}
                {!inputs.linkedin && !inputs.instagram && !inputs.x && (
                  <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                    No social profiles provided
                  </p>
                )}
              </div>
            </div>
            
            {/* Work Card */}
            {profile.work && (
              <div style={{ 
                background: C.card, 
                borderRadius: 12, 
                padding: 20,
                border: `1px solid ${C.border}`,
              }}>
                <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                  💼 Work
                </h3>
                <p style={{ color: C.text, fontSize: 15, margin: 0, fontWeight: 500 }}>
                  {profile.work.title}
                </p>
                {profile.work.company && (
                  <p style={{ color: C.textMuted, fontSize: 13, margin: "4px 0 0" }}>
                    @ {profile.work.company}
                  </p>
                )}
              </div>
            )}
            
            {/* Interests Card */}
            {profile.interests?.length > 0 && (
              <div style={{ 
                background: C.card, 
                borderRadius: 12, 
                padding: 20,
                border: `1px solid ${C.border}`,
              }}>
                <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                  ✨ Interests
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {profile.interests.map((interest, i) => (
                    <span key={i} style={{
                      padding: "4px 10px",
                      background: C.accentSoft,
                      borderRadius: 12,
                      fontSize: 12,
                      color: C.accent,
                    }}>
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Gaps Card */}
            {gaps.length > 0 && (
              <div style={{ 
                background: C.card, 
                borderRadius: 12, 
                padding: 20,
                border: `1px solid ${C.border}`,
              }}>
                <h3 style={{ color: C.text, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                  📋 Missing Data
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {gaps.map((gap, i) => (
                    <span key={i} style={{
                      padding: "4px 10px",
                      background: C.yellowSoft,
                      borderRadius: 12,
                      fontSize: 12,
                      color: C.yellow,
                    }}>
                      {gap}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Errors Card */}
            {result.errors?.length > 0 && (
              <div style={{ 
                background: C.card, 
                borderRadius: 12, 
                padding: 20,
                border: `1px solid ${C.border}`,
                gridColumn: "1 / -1",
              }}>
                <h3 style={{ color: C.red, fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
                  ⚠️ Errors
                </h3>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  {result.errors.map((err, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <strong>{err.step}:</strong> {err.error?.slice(0, 100)}...
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div style={{ 
            display: "flex", 
            gap: 12, 
            marginTop: 24,
            justifyContent: "center",
          }}>
            <button onClick={handleReset} style={buttonStyle(false)}>
              Build Another Profile
            </button>
            {onBack && (
              <button onClick={onBack} style={buttonStyle(true)}>
                Done
              </button>
            )}
          </div>
          
          {/* Raw Data (collapsible) */}
          <details style={{ marginTop: 32 }}>
            <summary style={{ 
              color: C.textMuted, 
              cursor: "pointer", 
              fontSize: 13,
              marginBottom: 12,
            }}>
              View Raw Data
            </summary>
            <pre style={{
              background: C.card,
              padding: 16,
              borderRadius: 8,
              fontSize: 11,
              color: C.textDim,
              overflow: "auto",
              maxHeight: 400,
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
  
  return null;
}
