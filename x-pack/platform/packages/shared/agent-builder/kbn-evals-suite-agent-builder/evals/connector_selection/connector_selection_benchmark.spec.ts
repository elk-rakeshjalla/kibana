/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate as evalsBase } from '@kbn/evals';
import { tags } from '@kbn/scout';
import { AgentBuilderEvaluationChatClient } from '../../src/chat_client';
import { connectorSelectionEvaluator } from '../../src/connector_selection_evaluators';
import type { BenchmarkExample } from './benchmark_dataset';
import {
  AMAZON_S3_EXAMPLES,
  BOX_EXAMPLES,
  BRAVE_SEARCH_EXAMPLES,
  CONFLUENCE_CLOUD_EXAMPLES,
  FIGMA_EXAMPLES,
  FIRECRAWL_EXAMPLES,
  GITHUB_EXAMPLES,
  GMAIL_EXAMPLES,
  GOOGLE_CALENDAR_EXAMPLES,
  GOOGLE_CLOUD_STORAGE_EXAMPLES,
  GOOGLE_DRIVE_EXAMPLES,
  HUBSPOT_EXAMPLES,
  JINA_READER_EXAMPLES,
  JIRA_CLOUD_EXAMPLES,
  MICROSOFT_TEAMS_EXAMPLES,
  MULTI_CONNECTOR_EXAMPLES,
  NOTION_EXAMPLES,
  OUTLOOK_EXAMPLES,
  SALESFORCE_EXAMPLES,
  SHAREPOINT_ONLINE_EXAMPLES,
  SLACK_EXAMPLES,
  TAVILY_EXAMPLES,
  TRELLO_EXAMPLES,
  ZOOM_EXAMPLES,
} from './benchmark_dataset';

const base = evalsBase.extend<{}, { chatClient: AgentBuilderEvaluationChatClient }>({
  chatClient: [
    async ({ fetch, log, connector }, use) => {
      await use(new AgentBuilderEvaluationChatClient(fetch, log, connector.id));
    },
    { scope: 'worker' },
  ],
});

interface ConnectorRoutingTaskOutput {
  errors: unknown[];
  messages: Array<{ message: string }>;
  steps?: Array<Record<string, unknown>>;
  traceId?: string;
}

type EvaluateBenchmark = (params: {
  connectorId: string;
  examples: BenchmarkExample[];
}) => Promise<void>;

const evaluate = base.extend<{}, { evaluateBenchmark: EvaluateBenchmark }>({
  evaluateBenchmark: [
    async ({ chatClient, executorClient }, use) => {
      await use(async ({ connectorId, examples }) => {
        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: `connector-selection-benchmark: ${connectorId}`,
                description:
                  `Connector routing benchmark for '${connectorId}': direct queries (connector must attach), ` +
                  `indirect queries (problem-only phrasing), and distractor queries (cross-connector confusion, ` +
                  `correct alternative must attach instead).`,
                examples,
              },
            ],
            task: async ({ input }) => {
              const response = await chatClient.converse({
                messages: [{ message: input.question }],
              });
              return {
                errors: response.errors,
                messages: response.messages,
                steps: response.steps,
                traceId: response.traceId,
              } satisfies ConnectorRoutingTaskOutput;
            },
          },
          [connectorSelectionEvaluator]
        );
      });
    },
    { scope: 'worker' },
  ],
});

// ─── STORAGE ────────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Storage',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('amazon-s3 routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'amazon_s3', examples: AMAZON_S3_EXAMPLES });
    });

    evaluate('box routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'box', examples: BOX_EXAMPLES });
    });

    evaluate('google-cloud-storage routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'google_cloud_storage',
        examples: GOOGLE_CLOUD_STORAGE_EXAMPLES,
      });
    });

    evaluate('google-drive routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'google_drive', examples: GOOGLE_DRIVE_EXAMPLES });
    });

    evaluate('sharepoint-online routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'sharepoint_online',
        examples: SHAREPOINT_ONLINE_EXAMPLES,
      });
    });
  }
);

// ─── SEARCH ─────────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Search',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('brave-search routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'brave_search', examples: BRAVE_SEARCH_EXAMPLES });
    });

    evaluate('firecrawl routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'firecrawl', examples: FIRECRAWL_EXAMPLES });
    });

    evaluate('jina-reader routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'jina_reader', examples: JINA_READER_EXAMPLES });
    });

    evaluate('tavily routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'tavily', examples: TAVILY_EXAMPLES });
    });
  }
);

// ─── KNOWLEDGE ──────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Knowledge',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('confluence-cloud routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'confluence_cloud',
        examples: CONFLUENCE_CLOUD_EXAMPLES,
      });
    });

    evaluate('notion routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'notion', examples: NOTION_EXAMPLES });
    });
  }
);

// ─── MESSAGING ──────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Messaging',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('microsoft-teams routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'microsoft_teams',
        examples: MICROSOFT_TEAMS_EXAMPLES,
      });
    });

    evaluate('slack routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'slack', examples: SLACK_EXAMPLES });
    });
  }
);

// ─── EMAIL ──────────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Email',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('gmail routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'gmail', examples: GMAIL_EXAMPLES });
    });

    evaluate('outlook routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'outlook', examples: OUTLOOK_EXAMPLES });
    });
  }
);

// ─── CALENDAR ───────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Calendar',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('google-calendar routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'google_calendar',
        examples: GOOGLE_CALENDAR_EXAMPLES,
      });
    });

    evaluate('zoom routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'zoom', examples: ZOOM_EXAMPLES });
    });
  }
);

// ─── CRM ────────────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — CRM',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('hubspot routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'hubspot', examples: HUBSPOT_EXAMPLES });
    });

    evaluate('salesforce routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'salesforce', examples: SALESFORCE_EXAMPLES });
    });
  }
);

// ─── DEV ────────────────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Dev',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('figma routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'figma', examples: FIGMA_EXAMPLES });
    });

    evaluate('github routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'github', examples: GITHUB_EXAMPLES });
    });

    evaluate('jira-cloud routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'jira_cloud', examples: JIRA_CLOUD_EXAMPLES });
    });

    evaluate('trello routing', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({ connectorId: 'trello', examples: TRELLO_EXAMPLES });
    });
  }
);

// ─── CROSS-SERVICE ──────────────────────────────────────────────────────────

evaluate.describe(
  'Connector Selection Benchmark — Cross-service',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate('multi-connector comprehensiveness', async ({ evaluateBenchmark }) => {
      await evaluateBenchmark({
        connectorId: 'multi',
        examples: MULTI_CONNECTOR_EXAMPLES,
      });
    });
  }
);