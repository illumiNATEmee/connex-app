/**
 * BrainDashboard — The Unified Brain UI
 * 
 * Shows:
 * - Your context (what the brain knows about you)
 * - Scan results (recommendations from profiles)
 * - Research queue (profiles needing enrichment)
 */

import { useState, useEffect } from 'react';
import { API_BASE } from './config.js';

// Colors (matching main app)
const C = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#30363d",
  text: "#e6edf3",
  textMuted: "#8b949e",
  textDim: "#484f58",
  accent: "#58a6ff",
  accentSoft: "rgba(88,166,255,0.1)",
  green: "#3fb950",
  greenSoft: "rgba(63,185,80,0.1)",
  yellow: "#d29922",
  yellowSoft: "rgba(210,153,34,0.1)",
  red: "#f85149",
  cyan: "#79c0ff",
  purple: "#bc8cff",
};

const card = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

export default function BrainDashboard({ onBack }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [researchQueue, setResearchQueue] = useState(null);
  const [activeTab, setActiveTab] = useState('context');
  const [error, setError] = useState(null);

  // Load context on mount
  useEffect(() => {
    loadContext();
    loadResearchQueue();
  }, []);

  async function loadContext() {
    try {
      const res = await fetch(`${API_BASE}/api/brain/context`);
      if (res.ok) {
        const data = await res.json();
        setContext(data);
      } else {
        setError('No user context found. Set up nathan-context.json first.');
      }
    } catch (err) {
      setError(`Failed to load context: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadResearchQueue() {
    try {
      const res = await fetch(`${API_BASE}/api/brain/research-queue`);
      if (res.ok) {
        const data = await res.json();
        setResearchQueue(data);
      }
    } catch (err) {
      console.error('Failed to load research queue:', err);
    }
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/brain/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useStoredProfiles: true,
          options: {
            minConfidence: 30,
            maxResults: 20,
            includeOpportunities: true,
            includeSerendipity: true,
          }
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setScanResults(data);
        setActiveTab('recommendations');
      } else {
        const err = await res.json();
        setError(err.error || 'Scan failed');
      }
    } catch (err) {
      setError(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono',monospace", background: C.bg, color: C.text, minHeight: "100vh", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ color: C.textMuted }}>Loading brain...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 12, marginBottom: 8 }}>
              ← Back to Connex
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🧠 Unified Brain</h1>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>
              Your persistent context + intelligent matching
            </p>
          </div>
          <button 
            onClick={runScan}
            disabled={scanning}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: scanning ? C.border : C.accent,
              color: '#fff',
              fontWeight: 600,
              cursor: scanning ? 'default' : 'pointer',
              fontSize: 13,
            }}
          >
            {scanning ? '⏳ Scanning...' : '🔍 Scan Network'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ ...card, background: C.yellowSoft, borderColor: C.yellow }}>
            <div style={{ color: C.yellow, fontSize: 13 }}>⚠️ {error}</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['context', 'recommendations', 'research'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${activeTab === tab ? C.accent : C.border}`,
                background: activeTab === tab ? C.accentSoft : 'transparent',
                color: activeTab === tab ? C.accent : C.textMuted,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {tab === 'context' && '👤 '}
              {tab === 'recommendations' && '✨ '}
              {tab === 'research' && '🔬 '}
              {tab}
              {tab === 'recommendations' && scanResults && ` (${scanResults.recommendations?.length || 0})`}
              {tab === 'research' && researchQueue && ` (${researchQueue.total || 0})`}
            </button>
          ))}
        </div>

        {/* Context Tab */}
        {activeTab === 'context' && context && (
          <div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{context.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>📍 {context.location?.current}</div>
              </div>
              
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
                {context.role} • {context.industry}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 8 }}>🎯 Looking For</div>
                  {context.lookingFor?.map((item, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>• {item}</div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 8 }}>🤝 Offering</div>
                  {context.offering?.map((item, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>• {item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>💡 Interests & Affinities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {context.interests?.map((interest, i) => (
                  <span key={i} style={{ 
                    padding: '4px 10px', 
                    borderRadius: 12, 
                    background: C.accentSoft, 
                    color: C.accent, 
                    fontSize: 11,
                    fontWeight: 500,
                  }}>
                    {interest}
                  </span>
                ))}
                {context.affinities?.sports?.map((s, i) => (
                  <span key={`sport-${i}`} style={{ 
                    padding: '4px 10px', 
                    borderRadius: 12, 
                    background: C.greenSoft, 
                    color: C.green, 
                    fontSize: 11,
                  }}>
                    🏆 {s}
                  </span>
                ))}
                {context.affinities?.wellness?.map((w, i) => (
                  <span key={`well-${i}`} style={{ 
                    padding: '4px 10px', 
                    borderRadius: 12, 
                    background: C.yellowSoft, 
                    color: C.yellow, 
                    fontSize: 11,
                  }}>
                    🧘 {w}
                  </span>
                ))}
              </div>
            </div>

            {context.activeScenes?.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🎪 Active Scenes</div>
                {context.activeScenes.map((scene, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < context.activeScenes.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{scene.name}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{scene.whyValuable}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div>
            {!scanResults ? (
              <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 16 }}>
                  Click "Scan Network" to find connections
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
                  Scanned {scanResults.profileCount} profiles • {scanResults.recommendations?.length || 0} matches
                </div>
                
                {scanResults.recommendations?.map((rec, i) => (
                  <div key={i} style={{ 
                    ...card, 
                    borderColor: i === 0 ? C.accent : i === 1 ? C.green : i === 2 ? C.yellow : C.border,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>
                            {rec.profile?.name || `${rec.profileA?.name} ↔ ${rec.profileB?.name}`}
                          </span>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: rec.type === 'opportunity' ? C.accentSoft : rec.type === 'serendipity' ? C.greenSoft : C.yellowSoft,
                            color: rec.type === 'opportunity' ? C.accent : rec.type === 'serendipity' ? C.green : C.yellow,
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}>
                            {rec.type}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, marginLeft: 24 }}>
                          {rec.profile?.role && `${rec.profile.role}`}
                          {rec.profile?.company && ` @ ${rec.profile.company}`}
                          {rec.profile?.location?.current && ` • 📍 ${rec.profile.location.current}`}
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: 18, 
                        fontWeight: 700, 
                        color: rec.score >= 80 ? C.green : rec.score >= 60 ? C.yellow : C.textMuted,
                      }}>
                        {rec.score}%
                      </div>
                    </div>

                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                      {rec.type === 'opportunity' && rec.primary && (
                        <div style={{ fontSize: 12, color: C.text }}>
                          <span style={{ color: C.accent }}>Why:</span> {rec.primary.reason}
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                            💡 {rec.primary.hook}
                          </div>
                        </div>
                      )}
                      {rec.type === 'serendipity' && (
                        <div style={{ fontSize: 12, color: C.text }}>
                          <span style={{ color: C.green }}>Hook:</span> {rec.bestHook || rec.hookSummary}
                        </div>
                      )}
                    </div>

                    {rec.intro && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>📝 Intro Message:</div>
                        <div style={{ 
                          fontSize: 11, 
                          color: C.text, 
                          background: C.bg, 
                          padding: 10, 
                          borderRadius: 6,
                          lineHeight: 1.5,
                        }}>
                          {rec.intro}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Research Tab */}
        {activeTab === 'research' && (
          <div>
            {!researchQueue ? (
              <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                <div style={{ color: C.textMuted }}>Loading research queue...</div>
              </div>
            ) : researchQueue.total === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ color: C.textMuted }}>All profiles are verified!</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
                  {researchQueue.total} profiles need more research
                </div>
                
                {researchQueue.queue?.map((item, i) => (
                  <div key={i} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                          {item.level?.label || 'Unverified'}
                        </div>
                      </div>
                      <div style={{ 
                        width: 48, 
                        height: 48, 
                        borderRadius: '50%', 
                        background: item.confidence < 30 ? C.yellowSoft : C.greenSoft,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: item.confidence < 30 ? C.yellow : C.green,
                      }}>
                        {item.confidence}%
                      </div>
                    </div>
                    {item.gaps?.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8 }}>🔬 Needed:</div>
                        {item.gaps.slice(0, 3).map((gap, j) => (
                          <div key={j} style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>
                            • {gap}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
