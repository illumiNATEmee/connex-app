// Quick test: Run discovery on FF Sports chat with Nathan's profile
import fs from 'fs';
import { extractIntents, extractTimingSignals, discoverConnections } from './server/discovery-engine.js';

// Nathan's profile
const yourProfile = {
  name: "Nathan",
  city: "Bangkok",
  interests: ["crypto", "tech", "ufc", "warriors", "niners", "wellness", "sauna"],
  looking_for: ["technical cofounders", "engineers", "investors", "interesting projects"],
  offering: ["product strategy", "crypto knowledge", "bangkok connections", "startup advice"]
};

// Parse WhatsApp chat
function parseWhatsAppChat(text) {
  const lines = text.split('\n');
  const messages = [];
  const memberSet = new Set();
  
  // WhatsApp format: [M/D/YY, H:MM:SS AM/PM] Name: Message
  const msgRegex = /^\[(\d+\/\d+\/\d+),\s+(\d+:\d+:\d+\s+[AP]M)\]\s+([^:]+):\s*(.*)$/;
  
  for (const line of lines) {
    const match = line.match(msgRegex);
    if (match) {
      const [_, date, time, sender, text] = match;
      if (!sender.includes('Messages and calls are end-to-end') && 
          !text.includes('joined from the community') &&
          !text.includes('created this group')) {
        messages.push({ date: `${date} ${time}`, sender: sender.trim(), text: text.trim() });
        memberSet.add(sender.trim());
      }
    }
  }
  
  const members = Array.from(memberSet).map(name => ({
    name,
    messageCount: messages.filter(m => m.sender === name).length,
    firstSeen: messages.find(m => m.sender === name)?.date,
    lastSeen: messages.filter(m => m.sender === name).pop()?.date
  }));
  
  return { messages, members, stats: { totalMessages: messages.length, totalMembers: members.length } };
}

// Load and parse chat
const chatText = fs.readFileSync('/home/moltbot/clawd/stanford-lead-chat/_chat.txt', 'utf-8');
const parsedChat = parseWhatsAppChat(chatText);

console.log(`\n📊 Chat Stats:`);
console.log(`   Messages: ${parsedChat.stats.totalMessages}`);
console.log(`   Members: ${parsedChat.stats.totalMembers}`);
console.log(`   Members: ${parsedChat.members.map(m => m.name).join(', ')}`);

// Extract signals
console.log(`\n🔍 Extracting signals...`);
const intents = extractIntents(parsedChat.messages);
const timing = extractTimingSignals(parsedChat.messages);

console.log(`   Intents found: ${intents.length}`);
console.log(`   Timing signals: ${timing.length}`);

if (intents.length > 0) {
  console.log(`\n📌 Sample intents:`);
  intents.slice(0, 5).forEach(i => {
    console.log(`   - ${i.sender}: ${i.type} "${i.detail || i.fullText?.slice(0, 50)}..."`);
  });
}

if (timing.length > 0) {
  console.log(`\n⏰ Timing signals:`);
  timing.slice(0, 5).forEach(t => {
    console.log(`   - ${t.sender}: ${t.type} → ${t.location || t.detail || 'N/A'}`);
  });
}

// Build candidates
const candidates = parsedChat.members.map(member => ({
  display_name: member.name,
  message_count: member.messageCount,
  interests: [],
  location: null,
  brain: {
    intents: intents.filter(i => i.sender === member.name),
    timing: timing.filter(t => t.sender === member.name),
  },
  offering: [],
  looking_for: [],
}));

// Run discovery
console.log(`\n🎯 Running discovery engine...`);
const brain = { messages: parsedChat.messages, intents, timingSignals: timing, relationshipGraph: [] };
const recommendations = discoverConnections(yourProfile, candidates, brain, { yourCity: "Bangkok", maxResults: 10, minScore: 5 });

console.log(`\n✅ Top Recommendations for Nathan:\n`);
recommendations.slice(0, 7).forEach((rec, i) => {
  console.log(`${i+1}. ${rec.person} (score: ${rec.score})`);
  if (rec.signals?.length > 0) {
    rec.signals.slice(0, 3).forEach(s => console.log(`   → ${s.signal}`));
  }
  if (rec.activation) {
    console.log(`   💡 ${rec.activation}`);
  }
  console.log('');
});
