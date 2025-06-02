export interface SamplingTemplate {
  name: string;
  description: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  temperature?: number;
  maxTokens?: number;
}

export const samplingTemplates: Record<string, SamplingTemplate> = {
  summarize: {
    name: 'summarize',
    description: 'Summarize lifelog content',
    userPromptTemplate:
      'Please provide a concise summary of the following lifelog content:\n\n{content}',
    modelPreferences: {
      speedPriority: 0.8,
      costPriority: 0.7,
    },
    temperature: 0.3,
    maxTokens: 500,
  },
  extractInfo: {
    name: 'extractInfo',
    description: 'Extract specific information from lifelog',
    userPromptTemplate:
      'Extract {infoType} from the following lifelog:\n\n{content}\n\nProvide the information in a structured format.',
    modelPreferences: {
      intelligencePriority: 0.8,
    },
    temperature: 0.2,
    maxTokens: 800,
  },
  analyzePatterns: {
    name: 'analyzePatterns',
    description: 'Analyze patterns and trends in lifelogs',
    userPromptTemplate:
      'Analyze the following lifelog data for patterns and trends:\n\n{content}\n\nFocus on:\n1. Recurring topics\n2. Time patterns\n3. Key relationships\n4. Notable changes',
    modelPreferences: {
      intelligencePriority: 0.9,
    },
    temperature: 0.4,
    maxTokens: 1000,
  },
  generateInsights: {
    name: 'generateInsights',
    description: 'Generate actionable insights from lifelogs',
    userPromptTemplate:
      'Based on the following lifelog content, generate actionable insights:\n\n{content}\n\nProvide:\n1. Key observations\n2. Recommendations\n3. Areas for improvement\n4. Opportunities identified',
    modelPreferences: {
      intelligencePriority: 0.9,
      speedPriority: 0.5,
    },
    temperature: 0.5,
    maxTokens: 1200,
  },
  compareLifelogs: {
    name: 'compareLifelogs',
    description: 'Compare multiple lifelogs',
    userPromptTemplate:
      'Compare and contrast the following lifelogs:\n\n{content}\n\nHighlight:\n1. Similarities\n2. Differences\n3. Progress or changes\n4. Patterns across time',
    temperature: 0.3,
    maxTokens: 1000,
  },
};

export function buildSamplingPrompt(
  template: SamplingTemplate,
  variables: Record<string, string>
): string {
  let prompt = template.userPromptTemplate;

  // Replace variables in the template
  Object.entries(variables).forEach(([key, value]) => {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });

  return prompt;
}
