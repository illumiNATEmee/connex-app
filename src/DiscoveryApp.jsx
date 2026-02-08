import { useState, useCallback } from "react";
import { parseWhatsAppText } from "./connex-engine.js";
import { API_BASE } from "./config.js";

// ═══════════════════════════════════════════════════════════
// CONNEX DISCOVERY APP
// Simple 3-step flow: Profile → Upload Chat → See Recommendations
// ═══════════════════════════════════════════════════════════

const STEPS = {
  PROFILE: 1,
  UPLOAD: 2,
  RESULTS: 3,
};

// Styles
const styles = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: "40px",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: "8px",
  },
  subtitle: {
    color: "#666",
    fontSize: "1.1rem",
  },
  stepIndicator: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
    marginBottom: "40px",
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "0.9rem",
    fontWeight: "500",
  },
  stepActive: {
    background: "#4f46e5",
    color: "white",
  },
  stepCompleted: {
    background: "#10b981",
    color: "white",
  },
  stepInactive: {
    background: "#e5e7eb",
    color: "#6b7280",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
    marginBottom: "24px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontWeight: "500",
    color: "#374151",
    fontSize: "0.9rem",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
    marginBottom: "16px",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  textarea: {
    width: "100%",
    padding: "12px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
    marginBottom: "16px",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: "80px",
  },
  button: {
    background: "#4f46e5",
    color: "white",
    border: "none",
    padding: "14px 28px",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  buttonDisabled: {
    background: "#9ca3af",
    cursor: "not-allowed",
  },
  buttonSecondary: {
    background: "white",
    color: "#4f46e5",
    border: "2px solid #4f46e5",
  },
  dropzone: {
    border: "2px dashed #d1d5db",
    borderRadius: "12px",
    padding: "48px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropzoneActive: {
    borderColor: "#4f46e5",
    background: "#eef2ff",
  },
  error: {
    background: "#fef2f2",
    color: "#dc2626",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  recommendationCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "16px",
    background: "#fafafa",
  },
  tag: {
    display: "inline-block",
    padding: "4px 10px",
    background: "#e0e7ff",
    color: "#4338ca",
    borderRadius: "9999px",
    fontSize: "0.8rem",
    marginRight: "8px",
    marginBottom: "8px",
  },
  score: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "8px",
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    padding: "48px",
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid #e5e7eb",
    borderTop: "4px solid #4f46e5",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// Add keyframes for spinner
const spinnerKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export default function DiscoveryApp() {
  const [step, setStep] = useState(STEPS.PROFILE);
  const [profile, setProfile] = useState({
    name: "",
    city: "",
    interests: "",
    looking_for: "",
    offering: "",
  });
  const [chatData, setChatData] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Handle profile input changes
  const handleProfileChange = (field) => (e) => {
    setProfile((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Validate profile
  const isProfileValid = () => {
    return profile.name.trim() && profile.city.trim();
  };

  // Handle file upload
  const handleFile = useCallback(async (file) => {
    setError(null);
    if (!file.name.endsWith(".txt")) {
      setError("Please upload a .txt file (WhatsApp chat export)");
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseWhatsAppText(text);

      if (parsed.messages.length === 0) {
        setError("No messages found. Make sure this is a WhatsApp chat export.");
        return;
      }

      setChatData(parsed);
      console.log(`✅ Parsed ${parsed.messages.length} messages from ${parsed.members.length} members`);
    } catch (err) {
      setError(`Error parsing file: ${err.message}`);
    }
  }, []);

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Submit to API
  const handleDiscover = async () => {
    setLoading(true);
    setError(null);

    try {
      // Format profile for API
      const apiProfile = {
        name: profile.name.trim(),
        city: profile.city.trim(),
        interests: profile.interests.split(",").map((s) => s.trim()).filter(Boolean),
        looking_for: profile.looking_for.split(",").map((s) => s.trim()).filter(Boolean),
        offering: profile.offering.split(",").map((s) => s.trim()).filter(Boolean),
      };

      const response = await fetch(`${API_BASE}/api/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: apiProfile,
          chatData: chatData,
          options: { maxResults: 5, includeEvidence: true, minScore: 5 },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "API request failed");
      }

      const result = await response.json();
      setRecommendations(result);
      setStep(STEPS.RESULTS);
    } catch (err) {
      setError(`Discovery failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset flow
  const handleReset = () => {
    setStep(STEPS.PROFILE);
    setProfile({ name: "", city: "", interests: "", looking_for: "", offering: "" });
    setChatData(null);
    setRecommendations(null);
    setError(null);
  };

  // Step indicator component
  const StepIndicator = () => (
    <div style={styles.stepIndicator}>
      {[
        { num: 1, label: "Your Profile" },
        { num: 2, label: "Upload Chat" },
        { num: 3, label: "Recommendations" },
      ].map(({ num, label }) => {
        let stepStyle = { ...styles.step };
        if (num < step) stepStyle = { ...stepStyle, ...styles.stepCompleted };
        else if (num === step) stepStyle = { ...stepStyle, ...styles.stepActive };
        else stepStyle = { ...stepStyle, ...styles.stepInactive };

        return (
          <div key={num} style={stepStyle}>
            <span>{num < step ? "✓" : num}</span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", paddingTop: "40px", paddingBottom: "40px" }}>
      <style>{spinnerKeyframes}</style>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>🧠 Connex Brain</h1>
          <p style={styles.subtitle}>Discover who you should talk to in your WhatsApp groups</p>
        </div>

        <StepIndicator />

        {error && <div style={styles.error}>⚠️ {error}</div>}

        {/* Step 1: Profile Input */}
        {step === STEPS.PROFILE && (
          <div style={styles.card}>
            <h2 style={{ marginTop: 0, marginBottom: "24px", color: "#1f2937" }}>
              👤 Quick Profile
            </h2>
            <p style={{ color: "#6b7280", marginBottom: "24px" }}>
              Tell us a bit about yourself so we can find the right connections for you.
            </p>

            <label style={styles.label}>
              Your Name <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              style={styles.input}
              type="text"
              value={profile.name}
              onChange={handleProfileChange("name")}
              placeholder="John Doe"
            />

            <label style={styles.label}>
              Your City <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              style={styles.input}
              type="text"
              value={profile.city}
              onChange={handleProfileChange("city")}
              placeholder="San Francisco"
            />

            <label style={styles.label}>Interests (comma-separated)</label>
            <input
              style={styles.input}
              type="text"
              value={profile.interests}
              onChange={handleProfileChange("interests")}
              placeholder="AI, running, crypto, coffee"
            />

            <label style={styles.label}>What are you looking for? (comma-separated)</label>
            <textarea
              style={styles.textarea}
              value={profile.looking_for}
              onChange={handleProfileChange("looking_for")}
              placeholder="Cofounder for AI startup, investors, running buddies"
            />

            <label style={styles.label}>What can you offer? (comma-separated)</label>
            <textarea
              style={styles.textarea}
              value={profile.offering}
              onChange={handleProfileChange("offering")}
              placeholder="Technical expertise, intro to VCs, mentorship"
            />

            <button
              style={{
                ...styles.button,
                ...(isProfileValid() ? {} : styles.buttonDisabled),
                marginTop: "16px",
              }}
              disabled={!isProfileValid()}
              onClick={() => setStep(STEPS.UPLOAD)}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Upload Chat */}
        {step === STEPS.UPLOAD && (
          <div style={styles.card}>
            <h2 style={{ marginTop: 0, marginBottom: "24px", color: "#1f2937" }}>
              📤 Upload WhatsApp Chat
            </h2>
            <p style={{ color: "#6b7280", marginBottom: "24px" }}>
              Export a WhatsApp group chat as .txt and upload it here.{" "}
              <a
                href="https://faq.whatsapp.com/1180414079177245"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#4f46e5" }}
              >
                How to export →
              </a>
            </p>

            <div
              style={{
                ...styles.dropzone,
                ...(dragActive ? styles.dropzoneActive : {}),
                ...(chatData ? { borderColor: "#10b981", background: "#f0fdf4" } : {}),
              }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fileInput").click()}
            >
              <input
                id="fileInput"
                type="file"
                accept=".txt"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
              {chatData ? (
                <div>
                  <div style={{ fontSize: "3rem", marginBottom: "16px" }}>✅</div>
                  <p style={{ fontWeight: "600", color: "#166534" }}>Chat loaded!</p>
                  <p style={{ color: "#6b7280", marginTop: "8px" }}>
                    {chatData.messages.length.toLocaleString()} messages from{" "}
                    {chatData.members.length} members
                  </p>
                  <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginTop: "8px" }}>
                    Click to upload a different file
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📁</div>
                  <p style={{ fontWeight: "600", color: "#374151" }}>
                    Drop your WhatsApp chat export here
                  </p>
                  <p style={{ color: "#6b7280", marginTop: "8px" }}>
                    or click to browse for a .txt file
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button
                style={{ ...styles.button, ...styles.buttonSecondary }}
                onClick={() => setStep(STEPS.PROFILE)}
              >
                ← Back
              </button>
              <button
                style={{
                  ...styles.button,
                  ...(chatData ? {} : styles.buttonDisabled),
                  flex: 1,
                }}
                disabled={!chatData || loading}
                onClick={handleDiscover}
              >
                {loading ? "Analyzing..." : "🔍 Find My Connections"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === STEPS.RESULTS && recommendations && (
          <div>
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: "8px", color: "#1f2937" }}>
                    🎯 Who You Should Talk To
                  </h2>
                  <p style={{ color: "#6b7280", marginBottom: 0 }}>
                    Based on {recommendations.chat_stats?.total_messages?.toLocaleString() || "your"} messages
                    across {recommendations.chat_stats?.member_count || "the"} members
                  </p>
                </div>
                <button
                  style={{ ...styles.button, ...styles.buttonSecondary, padding: "8px 16px" }}
                  onClick={handleReset}
                >
                  Start Over
                </button>
              </div>
            </div>

            {/* Summary */}
            {recommendations.summary && (
              <div style={{ ...styles.card, background: "#eef2ff" }}>
                <h3 style={{ marginTop: 0, color: "#4338ca" }}>💡 Quick Summary</h3>
                <p style={{ marginBottom: 0, lineHeight: 1.6 }}>{recommendations.summary}</p>
              </div>
            )}

            {/* Recommendations */}
            {recommendations.recommendations?.length > 0 ? (
              recommendations.recommendations.map((rec, idx) => (
                <div key={idx} style={styles.recommendationCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#1f2937" }}>
                        {idx + 1}. {rec.person}
                      </h3>
                      {rec.location && (
                        <p style={{ color: "#6b7280", margin: "4px 0 0" }}>📍 {rec.location}</p>
                      )}
                      {rec.timing && (
                        <p style={{ color: "#059669", margin: "4px 0 0", fontSize: "0.9rem" }}>
                          ⏰ {rec.timing.type === 'travel_future' ? 'Will be in' : 'Currently in'} {rec.timing.detail || rec.timing.location}
                          {rec.timing.days_ago != null && rec.timing.days_ago <= 7 && ' (recent!)'}
                        </p>
                      )}
                    </div>
                    <div style={styles.score}>⭐ {rec.score || rec.total_score || "—"}</div>
                  </div>

                  {/* Why connect */}
                  {rec.why && (
                    <div style={{ marginBottom: "16px" }}>
                      <strong style={{ color: "#374151" }}>Why connect:</strong>
                      {Array.isArray(rec.why) ? (
                        <ul style={{ margin: "8px 0 0", paddingLeft: "20px", color: "#4b5563" }}>
                          {rec.why.slice(0, 3).map((reason, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: "8px 0 0", color: "#4b5563", lineHeight: 1.6 }}>{rec.why}</p>
                      )}
                    </div>
                  )}

                  {/* Match reasons */}
                  {rec.reasons?.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <strong style={{ color: "#374151" }}>Match reasons:</strong>
                      <ul style={{ margin: "8px 0 0", paddingLeft: "20px", color: "#4b5563" }}>
                        {rec.reasons.map((reason, i) => (
                          <li key={i} style={{ marginBottom: "4px" }}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Opener or Activation */}
                  {(rec.opener || rec.activation) && (
                    <div style={{ background: "#f3f4f6", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px" }}>
                      <strong style={{ color: "#374151" }}>💬 {rec.activation?.action || "Suggested action"}:</strong>
                      {rec.opener ? (
                        <p style={{ margin: "8px 0 0", color: "#1f2937", fontStyle: "italic" }}>
                          "{rec.opener}"
                        </p>
                      ) : rec.activation?.message ? (
                        <p style={{ margin: "8px 0 0", color: "#1f2937", fontStyle: "italic" }}>
                          "{rec.activation.message}"
                        </p>
                      ) : (
                        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                          {rec.activation?.method === 'direct_message' ? 'Send them a direct message' : 'Reach out in the group'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Interests */}
                  {rec.interests?.length > 0 && (
                    <div>
                      {rec.interests.map((interest, i) => (
                        <span key={i} style={styles.tag}>{interest}</span>
                      ))}
                    </div>
                  )}

                  {/* Evidence */}
                  {rec.evidence?.key_messages?.length > 0 && (
                    <details style={{ marginTop: "16px" }}>
                      <summary style={{ cursor: "pointer", color: "#4f46e5", fontWeight: "500" }}>
                        View evidence ({rec.evidence.key_messages.length} messages)
                      </summary>
                      <div style={{ marginTop: "12px", maxHeight: "200px", overflow: "auto", fontSize: "0.9rem" }}>
                        {rec.evidence.key_messages.slice(0, 5).map((msg, i) => (
                          <div
                            key={i}
                            style={{
                              background: "#f9fafb",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              marginBottom: "8px",
                              borderLeft: "3px solid #4f46e5",
                            }}
                          >
                            <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>{msg.date}</span>
                            <p style={{ margin: "4px 0 0", color: "#374151" }}>{msg.text}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))
            ) : (
              <div style={styles.card}>
                <p style={{ textAlign: "center", color: "#6b7280" }}>
                  No strong matches found. Try uploading a more active group chat.
                </p>
              </div>
            )}

            {/* Debug info (collapsible) */}
            <details style={{ marginTop: "24px" }}>
              <summary style={{ cursor: "pointer", color: "#9ca3af" }}>Debug info</summary>
              <pre
                style={{
                  background: "#1f2937",
                  color: "#e5e7eb",
                  padding: "16px",
                  borderRadius: "8px",
                  overflow: "auto",
                  fontSize: "0.8rem",
                  marginTop: "8px",
                }}
              >
                {JSON.stringify(recommendations, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ ...styles.card, ...styles.loading }}>
            <div style={styles.spinner} />
            <p style={{ color: "#4b5563", fontWeight: "500" }}>Analyzing your network...</p>
            <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
              This may take 10-30 seconds
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
