// Run SPARK engine on LEAD Bay Area chat
import fs from 'fs';
import { extractIntents, extractTimingSignals } from './server/discovery-engine.js';
import { generateSparks, formatSparks } from './server/spark-engine.js';

// Nathan's REAL profile - needs to be specific to generate good matches
const yourProfile = {
  name: "Nathan",
  city: "Bangkok", // But has Bay Area ties
  interests: ["crypto", "AI", "web3", "startups", "wellness", "UFC", "investing"],
  looking_for: [
    "technical cofounders",
    "AI/ML engineers", 
    "interesting startup opportunities",
    "investors for future projects",
    "smart people building cool stuff"
  ],
  offering: [
    "product strategy",
    "crypto/web3 deep knowledge",
    "startup building experience", 
    "angel investing",
    "Bangkok/Asia connections",
    "network in tech/crypto space"
  ],
  context: "Building AI tools, interested in crypto/AI intersection. Based in Bangkok but connected to Bay Area through Stanford LEAD network."
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
          text.trim().length > 5) {
        messages.push({ date: `${date} ${time}`, sender: sender.trim(), text: text.trim() });
        memberSet.add(sender.trim());
      }
    }
  }
  
  const members = Array.from(memberSet).map(name => ({
    name,
    messageCount: messages.filter(m => m.sender === name).length
  }));
  
  return { messages, members };
}

async function main() {
  console.log(`\n${'🔥'.repeat(25)}`);
  console.log(`\n   SPARK ENGINE — LEAD BAY AREA\n`);
  console.log(`${'🔥'.repeat(25)}\n`);
  
  // Load and parse chat
  const chatText = fs.readFileSync('/home/moltbot/clawd/stanford-lead-chat/_chat.txt', 'utf-8');
  const { messages, members } = parseWhatsAppChat(chatText);
  
  console.log(`📊 Loaded ${messages.length} messages from ${members.length} members\n`);
  
  // Extract signals
  const intents = extractIntents(messages);
  const timing = extractTimingSignals(messages);
  
  console.log(`🔍 Found ${intents.length} intent signals, ${timing.length} timing signals\n`);
  
  if (intents.length === 0) {
    console.log('❌ No actionable intents found in this chat.');
    return;
  }
  
  console.log(`⚡ Generating sparks with AI reasoning...\n`);
  
  // Generate sparks
  const sparks = await generateSparks(yourProfile, intents, messages, members, {
    maxResults: 5,
    useAI: true
  });
  
  // Display results
  const output = formatSparks(sparks);
  console.log(output);
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Generated ${sparks.length} spark recommendations`);
  console.log(`${'═'.repeat(50)}\n`);
}

main().catch(console.error);
