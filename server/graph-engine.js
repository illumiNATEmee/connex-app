/**
 * GRAPH ENGINE — Find the Triangles
 * 
 * The magic: "Where are YOU the missing link between two people?"
 * 
 * Not "who's hiring" but "Jackson wants to meet Matt, you know Matt, 
 * you just met Jackson — YOU ARE THE BRIDGE"
 */

/**
 * Node types in the graph
 */
const NodeType = {
  PERSON: 'person',
  SCHOOL: 'school', 
  COMPANY: 'company',
  INTEREST: 'interest',
  EVENT: 'event',
  LOCATION: 'location',
  GROUP: 'group'
};

/**
 * Edge types (relationship types)
 */
const EdgeType = {
  KNOWS: 'knows',              // Direct relationship
  ATTENDED: 'attended',        // School/event
  WORKED_AT: 'worked_at',      // Company
  INTERESTED_IN: 'interested_in',
  WANTS_TO_MEET: 'wants_to_meet',  // GOLD — intent to connect
  WANTS_HELP_WITH: 'wants_help_with',
  CAN_HELP_WITH: 'can_help_with',
  CLASSMATE: 'classmate',      // Same year at school
  COLLEAGUE: 'colleague',      // Same company overlap
  MET_AT: 'met_at',           // Event connection
  LIVES_IN: 'lives_in',
  MEMBER_OF: 'member_of'
};

/**
 * The Graph
 */
class ConnexGraph {
  constructor() {
    this.nodes = new Map();  // id -> { type, data }
    this.edges = [];         // { from, to, type, weight, context }
    this.index = {
      byType: new Map(),     // type -> Set of ids
      byName: new Map(),     // lowercase name -> id
    };
  }

  /**
   * Add a node to the graph
   */
  addNode(id, type, data = {}) {
    const nodeId = id.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, { id: nodeId, type, data: { name: id, ...data } });
      
      // Index by type
      if (!this.index.byType.has(type)) {
        this.index.byType.set(type, new Set());
      }
      this.index.byType.get(type).add(nodeId);
      
      // Index by name
      this.index.byName.set(id.toLowerCase(), nodeId);
    } else {
      // Merge data
      const existing = this.nodes.get(nodeId);
      existing.data = { ...existing.data, ...data };
    }
    
    return nodeId;
  }

  /**
   * Add an edge (relationship) between nodes
   */
  addEdge(fromId, toId, type, context = {}) {
    const from = fromId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const to = toId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Check if edge already exists
    const existing = this.edges.find(e => 
      e.from === from && e.to === to && e.type === type
    );
    
    if (existing) {
      // Strengthen existing edge
      existing.weight = (existing.weight || 1) + 1;
      existing.contexts = existing.contexts || [];
      existing.contexts.push(context);
    } else {
      this.edges.push({
        from,
        to,
        type,
        weight: context.weight || 1,
        context,
        timestamp: context.timestamp || new Date().toISOString()
      });
    }
  }

  /**
   * Get all edges from a node
   */
  getEdgesFrom(nodeId) {
    const id = nodeId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return this.edges.filter(e => e.from === id);
  }

  /**
   * Get all edges to a node
   */
  getEdgesTo(nodeId) {
    const id = nodeId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return this.edges.filter(e => e.to === id);
  }

  /**
   * Get all connections of a node (both directions)
   */
  getConnections(nodeId) {
    const id = nodeId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return this.edges.filter(e => e.from === id || e.to === id);
  }

  /**
   * Find path between two nodes (BFS)
   */
  findPath(fromId, toId, maxDepth = 4) {
    const from = fromId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const to = toId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    if (from === to) return [from];
    
    const queue = [[from]];
    const visited = new Set([from]);
    
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      
      if (path.length > maxDepth) continue;
      
      const connections = this.getConnections(current);
      
      for (const edge of connections) {
        const next = edge.from === current ? edge.to : edge.from;
        
        if (next === to) {
          return [...path, next];
        }
        
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    
    return null; // No path found
  }

  /**
   * THE MAGIC: Find triangles where YOU are the missing link
   * 
   * Pattern: A wants to meet B, YOU know B, YOU just met A
   *          → YOU should intro A to B
   */
  findBridgeOpportunities(youId) {
    const you = youId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const opportunities = [];
    
    // Get everyone you know
    const yourConnections = this.getConnections(you);
    const peopleYouKnow = new Set();
    
    yourConnections.forEach(edge => {
      const other = edge.from === you ? edge.to : edge.from;
      const node = this.nodes.get(other);
      if (node?.type === NodeType.PERSON) {
        peopleYouKnow.add(other);
      }
    });
    
    // For each person you know, check if they want to meet someone else you know
    for (const personA of peopleYouKnow) {
      const theirEdges = this.getEdgesFrom(personA);
      
      for (const edge of theirEdges) {
        // Looking for "wants_to_meet" or "interested_in" person edges
        if (edge.type === EdgeType.WANTS_TO_MEET || 
            (edge.type === EdgeType.INTERESTED_IN && this.nodes.get(edge.to)?.type === NodeType.PERSON)) {
          
          const personB = edge.to;
          
          // Do YOU know person B?
          if (peopleYouKnow.has(personB) && personA !== personB) {
            // TRIANGLE FOUND! You can bridge A to B
            const nodeA = this.nodes.get(personA);
            const nodeB = this.nodes.get(personB);
            
            // Calculate opportunity strength
            const yourRelToA = yourConnections.find(e => 
              (e.from === you && e.to === personA) || (e.to === you && e.from === personA)
            );
            const yourRelToB = yourConnections.find(e => 
              (e.from === you && e.to === personB) || (e.to === you && e.from === personB)
            );
            
            opportunities.push({
              type: 'bridge',
              personA: nodeA?.data?.name || personA,
              personB: nodeB?.data?.name || personB,
              whatAWants: edge.context?.detail || edge.context?.reason || 'to connect',
              yourRelationshipToA: yourRelToA?.type || 'knows',
              yourRelationshipToB: yourRelToB?.type || 'knows',
              contextA: yourRelToA?.context || {},
              contextB: yourRelToB?.context || {},
              strength: (yourRelToA?.weight || 1) + (yourRelToB?.weight || 1) + (edge.weight || 1),
              edgeContext: edge.context
            });
          }
        }
      }
    }
    
    // Sort by strength
    opportunities.sort((a, b) => b.strength - a.strength);
    
    return opportunities;
  }

  /**
   * Find shared context between you and another person
   * (Same school, company, group, interest, etc.)
   */
  findSharedContext(youId, theirId) {
    const you = youId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const them = theirId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const shared = [];
    
    const yourEdges = this.getConnections(you);
    const theirEdges = this.getConnections(them);
    
    // Find common nodes
    const yourTargets = new Map();
    yourEdges.forEach(e => {
      const target = e.from === you ? e.to : e.from;
      yourTargets.set(target, e);
    });
    
    theirEdges.forEach(e => {
      const target = e.from === them ? e.to : e.from;
      if (yourTargets.has(target) && target !== you && target !== them) {
        const node = this.nodes.get(target);
        const yourEdge = yourTargets.get(target);
        
        shared.push({
          node: node?.data?.name || target,
          nodeType: node?.type,
          yourRelation: yourEdge.type,
          theirRelation: e.type,
          // Special flag for same-year/classmate situations
          sameYear: yourEdge.context?.year && yourEdge.context?.year === e.context?.year,
          yourContext: yourEdge.context,
          theirContext: e.context
        });
      }
    });
    
    return shared;
  }

  /**
   * Find "wants help with" matches
   * A wants help with X, B can help with X → opportunity
   */
  findHelpMatches(youId) {
    const you = youId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const matches = [];
    
    const yourConnections = this.getConnections(you);
    const peopleYouKnow = [];
    
    yourConnections.forEach(edge => {
      const other = edge.from === you ? edge.to : edge.from;
      const node = this.nodes.get(other);
      if (node?.type === NodeType.PERSON) {
        peopleYouKnow.push({ id: other, node, edgeToYou: edge });
      }
    });
    
    // Build maps of who wants help with what and who can help with what
    const wantsHelp = new Map(); // topic -> [{ person, context }]
    const canHelp = new Map();   // topic -> [{ person, context }]
    
    for (const { id, node } of peopleYouKnow) {
      const theirEdges = this.getEdgesFrom(id);
      
      for (const edge of theirEdges) {
        if (edge.type === EdgeType.WANTS_HELP_WITH) {
          const topic = edge.to;
          if (!wantsHelp.has(topic)) wantsHelp.set(topic, []);
          wantsHelp.get(topic).push({ person: id, personName: node?.data?.name, context: edge.context });
        }
        if (edge.type === EdgeType.CAN_HELP_WITH) {
          const topic = edge.to;
          if (!canHelp.has(topic)) canHelp.set(topic, []);
          canHelp.get(topic).push({ person: id, personName: node?.data?.name, context: edge.context });
        }
      }
    }
    
    // Find matches
    for (const [topic, needers] of wantsHelp) {
      const helpers = canHelp.get(topic);
      if (helpers) {
        for (const needer of needers) {
          for (const helper of helpers) {
            if (needer.person !== helper.person) {
              matches.push({
                type: 'help_match',
                topic: this.nodes.get(topic)?.data?.name || topic,
                needer: needer.personName,
                helper: helper.personName,
                neederContext: needer.context,
                helperContext: helper.context
              });
            }
          }
        }
      }
    }
    
    return matches;
  }

  /**
   * Export graph stats
   */
  getStats() {
    const nodesByType = {};
    for (const [type, ids] of this.index.byType) {
      nodesByType[type] = ids.size;
    }
    
    const edgesByType = {};
    for (const edge of this.edges) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }
    
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      nodesByType,
      edgesByType
    };
  }

  /**
   * Serialize graph to JSON
   */
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges
    };
  }

  /**
   * Load graph from JSON
   */
  static fromJSON(json) {
    const graph = new ConnexGraph();
    
    for (const node of json.nodes || []) {
      graph.addNode(node.data?.name || node.id, node.type, node.data);
    }
    
    for (const edge of json.edges || []) {
      graph.edges.push(edge);
    }
    
    return graph;
  }
}

/**
 * Build Nathan's personal graph (hardcoded for now, would be built from data)
 */
export function buildNathanGraph() {
  const graph = new ConnexGraph();
  
  // === NATHAN (the center) ===
  graph.addNode('Nathan', NodeType.PERSON, {
    name: 'Nathan',
    location: 'Bangkok',
    interests: ['crypto', 'AI', 'startups', 'wellness', 'UFC'],
    background: 'Founder/Builder'
  });
  
  // === SCHOOLS ===
  graph.addNode('Bellarmine', NodeType.SCHOOL, { 
    name: 'Bellarmine College Prep',
    location: 'San Jose, CA',
    type: 'high_school'
  });
  
  graph.addNode('Stanford LEAD', NodeType.SCHOOL, {
    name: 'Stanford LEAD',
    type: 'executive_program'
  });
  
  // Nathan's school connections
  graph.addEdge('Nathan', 'Bellarmine', EdgeType.ATTENDED, { 
    year: 2001, // graduation year
    relationship: 'alumnus'
  });
  
  graph.addEdge('Nathan', 'Stanford LEAD', EdgeType.ATTENDED, {
    year: 2024,
    cohort: 'Spring 2024'
  });
  
  // === KEY PEOPLE NATHAN KNOWS ===
  
  // Matt Mahan - Bellarmine classmate
  graph.addNode('Matt Mahan', NodeType.PERSON, {
    name: 'Matt Mahan',
    role: 'Mayor of San Jose',
    location: 'San Jose, CA',
    interests: ['politics', 'California', 'governance']
  });
  
  graph.addEdge('Nathan', 'Matt Mahan', EdgeType.CLASSMATE, {
    school: 'Bellarmine',
    year: 2001,
    strength: 'direct'
  });
  
  graph.addEdge('Matt Mahan', 'Bellarmine', EdgeType.ATTENDED, {
    year: 2001
  });
  
  // Arul - close friend, connector
  graph.addNode('Arul', NodeType.PERSON, {
    name: 'Arul',
    location: 'Bangkok',
    background: 'Stanford MBA',
    role: 'connector'
  });
  
  graph.addEdge('Nathan', 'Arul', EdgeType.KNOWS, {
    strength: 'close',
    context: 'Bangkok crew, Stanford MBA network'
  });
  
  // Jackson Gates - met through Arul
  graph.addNode('Jackson Gates', NodeType.PERSON, {
    name: 'Jackson Gates',
    background: 'Finance',
    interests: ['politics', 'fundraising', 'California politics']
  });
  
  graph.addEdge('Jackson Gates', 'Bellarmine', EdgeType.ATTENDED, {
    // Different year than Nathan
  });
  
  graph.addEdge('Nathan', 'Jackson Gates', EdgeType.MET_AT, {
    event: 'Stanford MBA Holiday Party',
    introduced_by: 'Arul',
    date: '2025'
  });
  
  // THE KEY INSIGHT: Jackson wants to meet Matt
  graph.addEdge('Jackson Gates', 'Matt Mahan', EdgeType.WANTS_TO_MEET, {
    reason: 'Help raise money for governor campaign',
    detail: 'Interested in supporting CA politics, wants to help fundraise'
  });
  
  // === GROUPS ===
  graph.addNode('LEAD Bay Area', NodeType.GROUP, {
    name: 'Stanford LEAD Bay Area',
    platform: 'WhatsApp'
  });
  
  graph.addEdge('Nathan', 'LEAD Bay Area', EdgeType.MEMBER_OF, {});
  
  // === INTERESTS/TOPICS ===
  graph.addNode('CA Governor Race', NodeType.INTEREST, {
    name: 'California Governor Race 2026'
  });
  
  graph.addEdge('Jackson Gates', 'CA Governor Race', EdgeType.INTERESTED_IN, {
    role: 'wants to fundraise'
  });
  
  graph.addEdge('Matt Mahan', 'CA Governor Race', EdgeType.INTERESTED_IN, {
    role: 'potential candidate'
  });
  
  return graph;
}

/**
 * Extract relationships from chat messages
 */
export function extractRelationshipsFromChat(messages, graph) {
  // Patterns to detect
  const patterns = {
    wants_to_meet: [
      /want(?:s|ed)? to (?:meet|connect with|intro to|introduction to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      /looking (?:for|to meet)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      /can (?:you|someone) intro(?:duce)? (?:me to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    ],
    interested_in: [
      /interested in\s+([^.!?]+)/gi,
      /passionate about\s+([^.!?]+)/gi,
      /focused on\s+([^.!?]+)/gi,
    ],
    can_help_with: [
      /(?:i |I )can help (?:with\s+)?([^.!?]+)/gi,
      /happy to (?:help|assist) (?:with\s+)?([^.!?]+)/gi,
      /(?:i |I )know (?:a lot )?about\s+([^.!?]+)/gi,
    ],
    wants_help_with: [
      /(?:i |I )need help (?:with\s+)?([^.!?]+)/gi,
      /looking for (?:help|advice) (?:on|with)\s+([^.!?]+)/gi,
      /anyone know (?:about\s+)?([^.!?]+)/gi,
    ],
    attended: [
      /(?:i |I )(?:went to|graduated from|attended)\s+([A-Z][^.!?,]+)/gi,
      /(?:i'm |I'm |i am |I am )(?:a |an )?([A-Z][a-z]+) (?:alum|grad|graduate)/gi,
    ],
    worked_at: [
      /(?:i |I )(?:work|worked) (?:at|for)\s+([A-Z][^.!?,]+)/gi,
      /(?:i'm |I'm )(?:at|with)\s+([A-Z][^.!?,]+)/gi,
    ]
  };
  
  for (const msg of messages) {
    const sender = msg.sender;
    
    // Add sender as person node
    graph.addNode(sender, NodeType.PERSON, { name: sender });
    
    // Check each pattern type
    for (const [edgeType, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        const matches = msg.text.matchAll(new RegExp(regex));
        for (const match of matches) {
          const target = match[1]?.trim();
          if (target && target.length > 2 && target.length < 50) {
            // Determine node type based on edge type
            let nodeType = NodeType.INTEREST;
            if (edgeType === 'wants_to_meet') nodeType = NodeType.PERSON;
            if (edgeType === 'attended') nodeType = NodeType.SCHOOL;
            if (edgeType === 'worked_at') nodeType = NodeType.COMPANY;
            
            graph.addNode(target, nodeType, { name: target });
            graph.addEdge(sender, target, edgeType, {
              source: 'chat',
              date: msg.date,
              fullText: msg.text.slice(0, 200)
            });
          }
        }
      }
    }
  }
  
  return graph;
}

/**
 * Format bridge opportunities for display
 */
export function formatBridgeOpportunities(opportunities, graph) {
  let output = '';
  
  for (const opp of opportunities) {
    output += `\n${'═'.repeat(55)}\n`;
    output += `🌉 BRIDGE OPPORTUNITY\n`;
    output += `${'═'.repeat(55)}\n\n`;
    
    output += `${opp.personA} ──wants to meet──► ${opp.personB}\n`;
    output += `       ▲                              ▲\n`;
    output += `       │                              │\n`;
    output += `       └────── YOU KNOW BOTH ────────┘\n\n`;
    
    output += `📍 WHAT ${opp.personA.toUpperCase()} WANTS:\n`;
    output += `   ${opp.whatAWants}\n\n`;
    
    output += `🔗 YOUR CONNECTION TO ${opp.personA.toUpperCase()}:\n`;
    output += `   ${opp.yourRelationshipToA}`;
    if (opp.contextA?.event) output += ` (met at ${opp.contextA.event})`;
    if (opp.contextA?.introduced_by) output += ` (intro'd by ${opp.contextA.introduced_by})`;
    output += `\n\n`;
    
    output += `🔗 YOUR CONNECTION TO ${opp.personB.toUpperCase()}:\n`;
    output += `   ${opp.yourRelationshipToB}`;
    if (opp.contextB?.school) output += ` (${opp.contextB.school})`;
    if (opp.contextB?.year) output += ` class of ${opp.contextB.year}`;
    output += `\n\n`;
    
    // Find shared context between A and B
    const sharedContext = graph.findSharedContext(opp.personA, opp.personB);
    if (sharedContext.length > 0) {
      output += `✨ NON-OBVIOUS CONNECTION:\n`;
      for (const ctx of sharedContext) {
        output += `   Both connected to: ${ctx.node} (${ctx.nodeType})\n`;
      }
      output += `\n`;
    }
    
    output += `💬 THE MOVE:\n`;
    output += `   "Hey ${opp.personA.split(' ')[0]} — you mentioned wanting to ${opp.whatAWants.toLowerCase().includes('meet') ? opp.whatAWants : 'connect with ' + opp.personB}. `;
    output += `${opp.personB.split(' ')[0]} is actually my ${opp.yourRelationshipToB}`;
    if (opp.contextB?.school) output += ` from ${opp.contextB.school}`;
    output += `. Happy to make the intro."\n\n`;
    
    output += `⚠️ RISK OF WAITING:\n`;
    output += `   Someone else makes this intro. You lose the connector credit.\n`;
    output += `   Strength: ${opp.strength}/10\n`;
  }
  
  return output;
}

export { ConnexGraph, NodeType, EdgeType };
