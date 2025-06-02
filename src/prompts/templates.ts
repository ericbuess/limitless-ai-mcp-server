import { PromptTemplate } from '../types/mcp';

export const promptTemplates: Record<string, PromptTemplate> = {
  'daily-summary': {
    name: 'daily-summary',
    description: 'Summarize all lifelogs from a specific day',
    arguments: [
      {
        name: 'date',
        description: 'The date to summarize (YYYY-MM-DD)',
        required: true,
      },
      {
        name: 'timezone',
        description: 'Timezone for the date (e.g., America/New_York)',
        required: false,
      },
    ],
  },
  'action-items': {
    name: 'action-items',
    description: 'Extract action items from lifelogs',
    arguments: [
      {
        name: 'date',
        description: 'The date to analyze (YYYY-MM-DD) or "recent" for recent logs',
        required: true,
      },
      {
        name: 'format',
        description: 'Output format: "list" or "detailed"',
        required: false,
      },
    ],
  },
  'key-topics': {
    name: 'key-topics',
    description: 'Identify main topics discussed in lifelogs',
    arguments: [
      {
        name: 'date',
        description: 'The date to analyze (YYYY-MM-DD) or "recent"',
        required: true,
      },
      {
        name: 'maxTopics',
        description: 'Maximum number of topics to extract',
        required: false,
      },
    ],
  },
  'meeting-notes': {
    name: 'meeting-notes',
    description: 'Format lifelogs as structured meeting notes',
    arguments: [
      {
        name: 'lifelogId',
        description: 'ID of the specific lifelog to format',
        required: false,
      },
      {
        name: 'date',
        description: 'Date to get meeting notes for (if no ID provided)',
        required: false,
      },
    ],
  },
  'search-insights': {
    name: 'search-insights',
    description: 'Analyze and summarize search results',
    arguments: [
      {
        name: 'searchTerm',
        description: 'The search term to analyze results for',
        required: true,
      },
      {
        name: 'limit',
        description: 'Number of results to analyze',
        required: false,
      },
    ],
  },
};

export function getPromptContent(
  templateName: string,
  args: Record<string, string>
): { role: 'user' | 'assistant'; content: { type: 'text'; text: string } }[] {
  switch (templateName) {
    case 'daily-summary':
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze and summarize all lifelogs from ${args.date}${
              args.timezone ? ` (timezone: ${args.timezone})` : ''
            }. 

Use the limitless_list_lifelogs_by_date tool to fetch the data, then provide:
1. A brief overview of the day
2. Key meetings or conversations
3. Important topics discussed
4. Any decisions made
5. Time spent on different activities

Format the summary in a clear, concise manner that would be useful for daily review.`,
          },
        },
      ];

    case 'action-items':
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Extract all action items from lifelogs ${
              args.date === 'recent' ? 'from recent recordings' : `from ${args.date}`
            }.

Use the appropriate limitless tool to fetch the data, then:
1. Identify all action items, tasks, or commitments mentioned
2. Note who is responsible (if mentioned)
3. Include any deadlines or timeframes
4. Group by context or project if applicable

Format: ${args.format === 'detailed' ? 'Include full context and quotes' : 'Simple bulleted list'}`,
          },
        },
      ];

    case 'key-topics':
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Identify the main topics discussed in lifelogs ${
              args.date === 'recent' ? 'from recent recordings' : `from ${args.date}`
            }.

Use the appropriate limitless tool to fetch the data, then:
1. Extract the ${args.maxTopics || '5-10'} most significant topics
2. For each topic, provide a brief summary
3. Note the frequency or time spent on each topic
4. Highlight any recurring themes

Present the topics in order of importance or frequency.`,
          },
        },
      ];

    case 'meeting-notes':
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: args.lifelogId
              ? `Format the lifelog with ID ${args.lifelogId} as structured meeting notes.`
              : `Format lifelogs from ${args.date} as structured meeting notes.`,
          },
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use the appropriate limitless tool to fetch the data, then format as:

**Meeting Notes**
- Date & Time:
- Participants:
- Duration:

**Agenda/Topics Discussed:**
(List main topics)

**Key Points:**
(Summarize important discussions)

**Decisions Made:**
(List any decisions)

**Action Items:**
(List tasks with owners and deadlines)

**Next Steps:**
(Outline follow-up items)`,
          },
        },
      ];

    case 'search-insights':
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Search for "${args.searchTerm}" in recent lifelogs and provide insights.

Use the limitless_search_lifelogs tool with:
- search_term: "${args.searchTerm}"
- limit: ${args.limit || '10'}

Then analyze the results to provide:
1. Summary of how often and in what contexts the term appears
2. Key insights or patterns related to this topic
3. Related topics or themes that appear alongside
4. Timeline of when this was discussed
5. Any action items or decisions related to this term

Present the insights in a way that helps understand the importance and context of this search term.`,
          },
        },
      ];

    default:
      throw new Error(`Unknown prompt template: ${templateName}`);
  }
}
