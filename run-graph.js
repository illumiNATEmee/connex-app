// Test the Graph Engine with Nathan's network
import { 
  ConnexGraph, 
  NodeType, 
  EdgeType,
  buildNathanGraph,
  extractRelationshipsFromChat,
  formatBridgeOpportunities 
} from './server/graph-engine.js';

console.log(`\n${'🌉'.repeat(20)}`);
console.log(`\n   CONNEX GRAPH ENGINE — Finding Your Bridges\n`);
console.log(`${'🌉'.repeat(20)}\n`);

// Build Nathan's graph (hardcoded relationships)
const graph = buildNathanGraph();

console.log(`📊 GRAPH STATS:`);
const stats = graph.getStats();
console.log(`   Nodes: ${stats.totalNodes}`);
console.log(`   Edges: ${stats.totalEdges}`);
console.log(`   People: ${stats.nodesByType.person || 0}`);
console.log(`   Schools: ${stats.nodesByType.school || 0}`);
console.log(`   Groups: ${stats.nodesByType.group || 0}`);
console.log(`   Interests: ${stats.nodesByType.interest || 0}`);

console.log(`\n${'─'.repeat(55)}\n`);

// Find bridge opportunities
console.log(`🔍 SEARCHING FOR BRIDGE OPPORTUNITIES...\n`);

const bridges = graph.findBridgeOpportunities('Nathan');

if (bridges.length === 0) {
  console.log(`   No bridge opportunities found.`);
} else {
  console.log(`   Found ${bridges.length} bridge opportunity(s)!\n`);
  
  const formatted = formatBridgeOpportunities(bridges, graph);
  console.log(formatted);
}

// Show shared context between Nathan and Jackson
console.log(`\n${'═'.repeat(55)}`);
console.log(`🔍 SHARED CONTEXT: Nathan & Jackson Gates`);
console.log(`${'═'.repeat(55)}\n`);

const sharedWithJackson = graph.findSharedContext('Nathan', 'Jackson Gates');
if (sharedWithJackson.length > 0) {
  for (const ctx of sharedWithJackson) {
    console.log(`   📍 ${ctx.node} (${ctx.nodeType})`);
    console.log(`      Nathan: ${ctx.yourRelation}`);
    console.log(`      Jackson: ${ctx.theirRelation}`);
    if (ctx.sameYear) {
      console.log(`      ⭐ SAME YEAR — classmates!`);
    }
    console.log('');
  }
} else {
  console.log(`   No direct shared context found.`);
}

// Show path from Nathan to Matt Mahan (should be direct)
console.log(`\n${'═'.repeat(55)}`);
console.log(`🛤️  PATH: Nathan → Matt Mahan`);
console.log(`${'═'.repeat(55)}\n`);

const pathToMatt = graph.findPath('Nathan', 'Matt Mahan');
if (pathToMatt) {
  console.log(`   ${pathToMatt.join(' → ')}`);
  console.log(`   Distance: ${pathToMatt.length - 1} hop(s)`);
} else {
  console.log(`   No path found.`);
}

// Show path from Jackson to Matt (should go through Nathan)
console.log(`\n${'═'.repeat(55)}`);
console.log(`🛤️  PATH: Jackson Gates → Matt Mahan`);
console.log(`${'═'.repeat(55)}\n`);

const pathJacksonMatt = graph.findPath('Jackson Gates', 'Matt Mahan');
if (pathJacksonMatt) {
  console.log(`   ${pathJacksonMatt.join(' → ')}`);
  console.log(`   Distance: ${pathJacksonMatt.length - 1} hop(s)`);
  
  if (pathJacksonMatt.includes('nathan')) {
    console.log(`\n   ⭐ YOU ARE ON THE PATH — You're the bridge!`);
  }
} else {
  console.log(`   No path found (without Nathan, there's no connection).`);
}

console.log(`\n${'═'.repeat(55)}`);
console.log(`✅ Graph analysis complete`);
console.log(`${'═'.repeat(55)}\n`);
