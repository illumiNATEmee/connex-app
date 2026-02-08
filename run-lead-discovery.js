// Run discovery on LEAD Bay Area chat for Nathan
import fs from 'fs';
import { extractIntents, extractTimingSignals, discoverConnections } from './server/discovery-engine.js';

// Nathan's profile - more detailed
const yourProfile = {
  name: "Nathan",
  city: "Bay Area", // For this chat context
  interests: ["crypto", "AI", "tech startups", "wellness", "ufc", "investing"],
  looking_for: ["technical cofounders", "AI engineers", "investors", "interesting projects", "startup opportunities"],
  offering: ["product strategy", "crypto/web3 knowledge", "startup advice", "angel investing", "bangkok connections"]
};

// Parse WhatsApp chat
function parseWhatsAppChat(text) {
  const lines = text.split('\n');
  const messages = [];
  const memberSet = new Set();
  
  const msgRegex = /^\[(\d+\/\d+\/\d+),\s+(\d+:\d+:\d+\s+[AP]M)\]\s+([^:]+):\s*(.*)$/;
  
  for (const line of lines) {
    const match = line.match(msgRegex);
    if (match) {
      const [_, date, time, sender, text] = match;
      if (!sender.includes('Messages and calls are end-to-end') && 
          !text.includes('joined from the community') &&
          !text.includes('created this group') &&
          !text.includes('changed the group') &&
          text.trim().length > 5 &&
          !text.includes('omitted')) {
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

console.log(`\n${'═'.repeat(60)}`);
console.log(`📊 LEAD BAY AREA - DISCOVERY SCAN`);
console.log(`${'═'.repeat(60)}`);
console.log(`\n📈 Chat Stats:`);
console.log(`   Messages: ${parsedChat.stats.totalMessages}`);
console.log(`   Active Members: ${parsedChat.stats.totalMembers}`);

// Extract signals
const intents = extractIntents(parsedChat.messages);
const timing = extractTimingSignals(parsedChat.messages);

console.log(`\n🔍 Signals Detected:`);
console.log(`   Intent signals: ${intents.length}`);
console.log(`   Timing signals: ${timing.length}`);

// Show all intents found
if (intents.length > 0) {
  console.log(`\n📌 INTENTS FOUND:`);
  intents.forEach(i => {
    const emoji = {
      'hiring': '💼',
      'seeking': '🔍',
      'asking': '❓',
      'fundraising': '💰',
      'job_seeking': '🎯',
      'offering': '🎁',
      'seeking_intro': '🤝',
      'offering_intro': '🤝'
    }[i.type] || '•';
    console.log(`   ${emoji} ${i.sender}: [${i.type}] "${i.detail || i.fullText?.slice(0, 80)}..."`);
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
const brain = { messages: parsedChat.messages, intents, timingSignals: timing, relationshipGraph: [] };
const recommendations = discoverConnections(yourProfile, candidates, brain, { yourCity: "Bay Area", maxResults: 15, minScore: 3 });

console.log(`\n${'═'.repeat(60)}`);
console.log(`🎯 TOP RECOMMENDATIONS FOR NATHAN`);
console.log(`${'═'.repeat(60)}`);

recommendations.slice(0, 8).forEach((rec, i) => {
  console.log(`\n${i+1}. ${rec.person} (score: ${rec.score})`);
  console.log(`   ${'─'.repeat(40)}`);
  
  if (rec.signals?.length > 0) {
    console.log(`   Why connect:`);
    rec.signals.slice(0, 3).forEach(s => {
      if (typeof s.signal === 'string') {
        console.log(`   → ${s.signal}`);
      }
    });
  }
  
  // Find their actual messages for context
  const theirIntents = intents.filter(i => i.sender === rec.person);
  if (theirIntents.length > 0) {
    console.log(`   Active intents:`);
    theirIntents.forEach(i => {
      console.log(`   • [${i.type}] ${i.detail || i.fullText?.slice(0, 60)}...`);
    });
  }
  
  // Generate activation
  console.log(`   💡 Suggested action: Reach out about ${theirIntents[0]?.type || 'connecting'}`);
});

// Summary for Nathan
console.log(`\n${'═'.repeat(60)}`);
console.log(`📋 QUICK SUMMARY`);
console.log(`${'═'.repeat(60)}`);

const hiringPeople = intents.filter(i => i.type === 'hiring');
const seekingPeople = intents.filter(i => i.type === 'seeking' || i.type === 'job_seeking');
const fundraisingPeople = intents.filter(i => i.type === 'fundraising');

if (hiringPeople.length > 0) {
  console.log(`\n🔥 HIRING NOW:`);
  hiringPeople.forEach(h => console.log(`   • ${h.sender}: ${h.detail?.slice(0, 50) || h.fullText?.slice(0, 50)}...`));
}

if (seekingPeople.length > 0) {
  console.log(`\n🔍 LOOKING FOR OPPORTUNITIES:`);
  seekingPeople.forEach(s => console.log(`   • ${s.sender}: ${s.detail?.slice(0, 50) || s.fullText?.slice(0, 50)}...`));
}

if (fundraisingPeople.length > 0) {
  console.log(`\n💰 FUNDRAISING/EVENTS:`);
  fundraisingPeople.forEach(f => console.log(`   • ${f.sender}: ${f.detail?.slice(0, 50) || f.fullText?.slice(0, 50)}...`));
}

console.log(`\n`);
