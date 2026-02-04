/**
 * Browser-Compatible Connex Engine
 * Complete analysis functions that work in web browsers
 */

// WhatsApp Export Parser (browser version)
export function parseWhatsAppText(textContent) {
    const MESSAGE_PATTERNS = [
        // Bracket format: [1/30/26, 12:34:56 PM] Name: Message
        /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\]\s*([^:]+):\s*(.+)$/i,
        // US format: 1/30/26, 12:34 PM - Name: Message
        /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s*-\s*([^:]+):\s*(.+)$/i,
        // EU format: 30/01/2026, 12:34 - Name: Message  
        /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.+)$/i,
        // ISO format: 2026-01-30, 12:34 - Name: Message
        /^(\d{4}-\d{2}-\d{2}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.+)$/i,
    ];

    const SYSTEM_PATTERNS = [
        /created group/i, /added/i, /left/i, /removed/i, /changed the subject/i,
        /changed this group's icon/i, /messages and calls are end-to-end encrypted/i,
    ];

    const content = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content.split('\n');
    
    const messages = [];
    const members = new Map();
    let currentMessage = null;

    for (const line of lines) {
        let matched = false;
        
        for (const pattern of MESSAGE_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                if (currentMessage) messages.push(currentMessage);
                
                const [_, date, time, sender, text] = match;
                const isSystem = SYSTEM_PATTERNS.some(p => p.test(text));
                
                if (!isSystem) {
                    if (!members.has(sender)) {
                        members.set(sender, {
                            name: sender,
                            messageCount: 0,
                            firstSeen: date,
                            lastSeen: date,
                            messages: []
                        });
                    }
                    const member = members.get(sender);
                    member.messageCount++;
                    member.lastSeen = date;
                    
                    currentMessage = { date, time, sender, text, isMedia: text.includes('<Media omitted>') || text.includes('omitted') };
                    member.messages.push(currentMessage);
                } else {
                    currentMessage = null;
                }
                matched = true;
                break;
            }
        }
        
        if (!matched && currentMessage && line.trim()) {
            currentMessage.text += '\n' + line;
        }
    }
    
    if (currentMessage) messages.push(currentMessage);

    return {
        messages,
        members: Array.from(members.values()),
        stats: {
            totalMessages: messages.length,
            totalMembers: members.size,
            dateRange: {
                start: messages[0]?.date,
                end: messages[messages.length - 1]?.date
            }
        }
    };
}

// Profile Enrichment
export function enrichProfiles(parsedChat) {
    return parsedChat.members.map(member => ({
        id: member.name.toLowerCase().replace(/\s+/g, '_'),
        source_name: member.name,
        display_name: member.name,
        message_count: member.messageCount,
        first_seen: member.firstSeen,
        last_seen: member.lastSeen,
        location: extractLocation(member.messages),
        interests: extractInterests(member.messages),
        affinities: extractAffinities(member.messages),
        activity_level: calculateActivityLevel(member, parsedChat),
        mentions: findMentions(member.name, parsedChat.messages),
        mentioned_by: findMentionedBy(member.name, parsedChat.messages)
    }));
}

// Location extraction from messages
function extractLocation(messages) {
    const locationKeywords = {
        cities: ['bangkok', 'singapore', 'hong kong', 'hk', 'sg', 'bkk', 'los angeles', 'la', 'san francisco', 'sf'],
        travel: ['flying to', 'in town', 'visiting', 'just landed', 'based in', 'living in']
    };

    const location = { cities: [], mentions: [], confidence: 0.0 };
    const allText = messages.map(m => m.text.toLowerCase()).join(' ');

    locationKeywords.cities.forEach(city => {
        if (allText.includes(city)) {
            location.cities.push(city);
            location.confidence += 0.3;
        }
    });

    if (location.cities.length > 0) {
        const cityCount = {};
        location.cities.forEach(city => cityCount[city] = (cityCount[city] || 0) + 1);
        location.primary = Object.keys(cityCount).reduce((a, b) => cityCount[a] > cityCount[b] ? a : b);
    }

    return location;
}

// Interest extraction
function extractInterests(messages) {
    const interestKeywords = {
        sports: ['ufc', 'mma', 'warriors', 'basketball', 'golf', 'football'],
        crypto: ['bitcoin', 'btc', 'ethereum', 'crypto', 'trading', 'blockchain'],
        food: ['dim sum', 'restaurant', 'brunch', 'dinner', 'thai food'],
        wellness: ['sauna', 'ice bath', 'massage', 'spa', 'wellness'],
        tech: ['ai', 'startup', 'coding', 'engineering', 'product'],
        business: ['fundraising', 'investor', 'funding', 'strategy']
    };

    const interests = [];
    const allText = messages.map(m => m.text.toLowerCase()).join(' ');

    Object.keys(interestKeywords).forEach(category => {
        const keywords = interestKeywords[category];
        const matches = keywords.filter(keyword => allText.includes(keyword));
        if (matches.length > 0) {
            interests.push({
                category,
                keywords: matches,
                confidence: matches.length / keywords.length
            });
        }
    });

    return interests;
}

function extractAffinities(messages) {
    const affinityPatterns = {
        sports_teams: ['warriors', 'niners', '49ers'],
        food_types: ['dim sum', 'sushi', 'thai'],
        activities: ['golf', 'sauna', 'cycling']
    };

    const affinities = {};
    const allText = messages.map(m => m.text.toLowerCase()).join(' ');

    Object.keys(affinityPatterns).forEach(type => {
        const matches = affinityPatterns[type].filter(item => allText.includes(item));
        if (matches.length > 0) affinities[type] = matches;
    });

    return affinities;
}

function calculateActivityLevel(member, parsedChat) {
    const memberRatio = member.messageCount / parsedChat.stats.totalMessages;
    return memberRatio > 0.15 ? 'high' : memberRatio > 0.05 ? 'medium' : 'low';
}

function findMentions(memberName, allMessages) {
    const memberMessages = allMessages.filter(m => m.sender === memberName);
    const mentions = [];
    
    memberMessages.forEach(message => {
        const text = message.text.toLowerCase();
        allMessages.forEach(otherMessage => {
            if (otherMessage.sender !== memberName) {
                const otherName = otherMessage.sender.toLowerCase();
                if (text.includes(otherName) || text.includes(otherName.split(' ')[0])) {
                    mentions.push(otherMessage.sender);
                }
            }
        });
    });

    return [...new Set(mentions)];
}

function findMentionedBy(memberName, allMessages) {
    const mentionedBy = [];
    const nameVariations = [
        memberName.toLowerCase(),
        memberName.toLowerCase().split(' ')[0],
        memberName.toLowerCase().split(' ').pop()
    ];

    allMessages.forEach(message => {
        if (message.sender !== memberName) {
            const text = message.text.toLowerCase();
            if (nameVariations.some(name => text.includes(name))) {
                mentionedBy.push(message.sender);
            }
        }
    });

    return [...new Set(mentionedBy)];
}

// Network analysis
export function analyzeNetworkStructure(profiles) {
    const nodeMetrics = profiles.map(profile => ({
        id: profile.id,
        name: profile.display_name,
        messageCount: profile.message_count,
        inDegree: profile.mentioned_by.length,
        outDegree: profile.mentions.length,
        totalConnections: profile.mentioned_by.length + profile.mentions.length,
        location: profile.location.primary
    }));

    const hubs = nodeMetrics.filter(n => n.inDegree > 0).sort((a, b) => b.inDegree - a.inDegree);
    const connectors = nodeMetrics.filter(n => n.outDegree > 0).sort((a, b) => b.outDegree - a.outDegree);
    const lurkers = nodeMetrics.filter(n => n.messageCount < 5 && n.inDegree > 0);

    return { hubs, connectors, lurkers, nodeMetrics };
}

// Smart suggestion generation
export function generateSmartSuggestions(profiles) {
    const suggestions = [];
    const locationGroups = {};
    
    profiles.forEach(profile => {
        const location = normalizeLocation(profile.location.primary);
        if (location) {
            if (!locationGroups[location]) locationGroups[location] = [];
            locationGroups[location].push(profile);
        }
    });

    Object.keys(locationGroups).forEach(location => {
        const members = locationGroups[location];
        if (members.length >= 3) {
            const interestGroups = findSharedInterests(members);
            
            interestGroups.forEach(group => {
                if (group.members.length >= 3) {
                    const confidence = calculateConfidence(group);
                    suggestions.push({
                        type: generateActivityTitle(location, group.interest),
                        participants: group.members.map(m => m.display_name),
                        location: location,
                        activity: mapInterestToActivity(group.interest),
                        reason: `${group.members.length} people in ${location} interested in ${group.interest}`,
                        confidence: Math.round(confidence * 100),
                        interests: [group.interest]
                    });
                }
            });
        }
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function normalizeLocation(location) {
    if (!location) return null;
    const locationMap = {
        'bkk': 'Bangkok', 'bangkok': 'Bangkok',
        'sg': 'Singapore', 'singapore': 'Singapore', 
        'hk': 'Hong Kong', 'hong kong': 'Hong Kong',
        'la': 'Los Angeles', 'los angeles': 'Los Angeles'
    };
    return locationMap[location.toLowerCase()] || location;
}

function findSharedInterests(members) {
    const interestGroups = [];
    const allInterests = new Set();

    members.forEach(member => {
        member.interests.forEach(interest => allInterests.add(interest.category));
    });

    allInterests.forEach(interest => {
        const interestedMembers = members.filter(member => 
            member.interests.some(i => i.category === interest)
        );
        
        if (interestedMembers.length >= 2) {
            interestGroups.push({ interest, members: interestedMembers });
        }
    });

    return interestGroups;
}

function calculateConfidence(group) {
    let confidence = 0.5 + (group.members.length - 2) * 0.1;
    return Math.min(confidence, 0.95);
}

function generateActivityTitle(location, interest) {
    const templates = {
        sports: `${location} Sports Watch Party`,
        crypto: `${location} Crypto Discussion`, 
        food: `${location} Food Meetup`,
        wellness: `${location} Wellness Session`,
        tech: `${location} Tech Networking`
    };
    return templates[interest] || `${location} ${interest} Meetup`;
}

function mapInterestToActivity(interest) {
    const activityMap = {
        sports: 'ufc', crypto: 'crypto', food: 'dimsum', 
        wellness: 'wellness', tech: 'coworking'
    };
    return activityMap[interest] || 'coworking';
}

// Main pipeline function
export async function runConnexPipeline(chatText) {
    console.log('🔄 Parsing WhatsApp chat...');
    const parsedChat = parseWhatsAppText(chatText);
    
    console.log('🔄 Enriching profiles...');  
    const profiles = enrichProfiles(parsedChat);
    
    console.log('🔄 Analyzing network...');
    const analysis = analyzeNetworkStructure(profiles);
    
    console.log('🔄 Generating suggestions...');
    const suggestions = generateSmartSuggestions(profiles);

    console.log('✅ Analysis complete!');
    
    return { parsedChat, profiles, analysis, suggestions };
}
