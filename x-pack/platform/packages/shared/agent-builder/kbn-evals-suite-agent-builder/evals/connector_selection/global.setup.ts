/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { globalSetupHook, tags } from '@kbn/scout';

// Kibana UI setting that gates connector SML indexing in the lifecycle handler.
const EXPERIMENTAL_FEATURES_SETTING = 'agentBuilder:experimentalFeatures';

interface ConnectorDefinition {
  connector_type_id: string;
  name: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

// 23 connectors matching the enabled kbn-connector-cli manifests.
// Secrets that would normally come from Vault use 'eval-placeholder' — the
// connector lifecycle handler indexes them into SML on post-create regardless
// of whether the credentials are real. These evals only assert at sml_attach,
// so live OAuth is never exercised.
const CONNECTORS: ConnectorDefinition[] = [
  // ── Storage ────────────────────────────────────────────────────────────────
  {
    connector_type_id: '.amazon_s3',
    name: 'Amazon S3 (testing)',
    config: { region: 'us-east-1' },
    secrets: {
      authType: 'aws_credentials',
      accessKeyId: 'eval-placeholder',
      secretAccessKey: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.box',
    name: 'Box (testing)',
    config: { serverUrl: 'https://mcp.box.com' },
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://account.box.com/api/oauth2/authorize',
      tokenUrl: 'https://api.box.com/oauth2/token',
      scope: 'root_readwrite ai.readwrite docgen.readwrite',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.google_cloud_storage',
    name: 'Google Cloud Storage (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/devstorage.read_only https://www.googleapis.com/auth/cloudplatformprojects.readonly',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.google_drive',
    name: 'Google Drive (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.sharepoint-online',
    name: 'SharePoint Online (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'Sites.Selected Files.Read.All offline_access',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── Search ─────────────────────────────────────────────────────────────────
  {
    connector_type_id: '.brave-search',
    name: 'Brave Search (testing)',
    config: {},
    secrets: { authType: 'api_key_header', 'X-Subscription-Token': 'eval-placeholder' },
  },
  {
    connector_type_id: '.firecrawl',
    name: 'Firecrawl (testing)',
    config: {},
    secrets: { authType: 'bearer', token: 'eval-placeholder' },
  },
  {
    connector_type_id: '.jina',
    name: 'Jina Reader (testing)',
    config: {},
    secrets: { authType: 'bearer', token: 'eval-placeholder' },
  },
  {
    connector_type_id: '.tavily_mcp',
    name: 'Tavily (testing)',
    config: { serverUrl: 'https://mcp.tavily.com/mcp/' },
    secrets: { authType: 'bearer', token: 'eval-placeholder' },
  },

  // ── Knowledge ──────────────────────────────────────────────────────────────
  {
    connector_type_id: '.confluence-cloud',
    name: 'Confluence Cloud (testing)',
    config: { subdomain: 'workplace-search' },
    secrets: {
      authType: 'basic',
      username: 'workplace-search@elastic.co',
      password: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.notion',
    name: 'Notion (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── Messaging ──────────────────────────────────────────────────────────────
  {
    connector_type_id: '.microsoft-teams',
    name: 'Microsoft Teams (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope:
        'Team.ReadBasic.All Channel.ReadBasic.All Chat.Read ChannelMessage.Read.All offline_access',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.slack2',
    name: 'Slack (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scope:
        'channels:read chat:write files:read groups:read im:read mpim:read search:read.files search:read.im search:read.mpim search:read.private search:read.public users:read',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── Email ──────────────────────────────────────────────────────────────────
  {
    connector_type_id: '.gmail',
    name: 'Gmail (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.outlook',
    name: 'Outlook (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    connector_type_id: '.google_calendar',
    name: 'Google Calendar (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.zoom',
    name: 'Zoom (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://zoom.us/oauth/authorize',
      tokenUrl: 'https://zoom.us/oauth/token',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── CRM ────────────────────────────────────────────────────────────────────
  {
    connector_type_id: '.hubspot',
    name: 'HubSpot (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.salesforce',
    name: 'Salesforce (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      scope: 'api refresh_token',
      authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize',
      tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },

  // ── Dev ────────────────────────────────────────────────────────────────────
  {
    connector_type_id: '.figma',
    name: 'Figma (testing)',
    config: {},
    secrets: {
      authType: 'oauth_authorization_code',
      authorizationUrl: 'https://www.figma.com/oauth',
      tokenUrl: 'https://api.figma.com/v1/oauth/token',
      scope: 'current_user:read file_content:read projects:read',
      clientId: 'eval-placeholder',
      clientSecret: 'eval-placeholder',
    },
  },
  {
    connector_type_id: '.github',
    name: 'GitHub (testing)',
    config: { serverUrl: 'https://api.githubcopilot.com/mcp/' },
    secrets: { authType: 'bearer', token: 'eval-placeholder' },
  },
  {
    connector_type_id: '.jira-cloud',
    name: 'Jira Cloud (testing)',
    config: { subdomain: 'workplace-search' },
    secrets: { authType: 'basic', username: 'eval-placeholder', password: 'eval-placeholder' },
  },
  {
    connector_type_id: '.trello',
    name: 'Trello (testing)',
    config: {},
    secrets: { authType: 'api_key_query', key: 'eval-placeholder', token: 'eval-placeholder' },
  },
];

globalSetupHook(
  'Connector selection eval setup',
  { tag: tags.stateful.classic },
  async ({ kbnClient, log }) => {
    // Step 1: Enable agentBuilder:experimentalFeatures so the connector lifecycle
    // handler indexes newly created connectors into the SML index.
    log.info(
      `[connector-selection setup] Enabling ${EXPERIMENTAL_FEATURES_SETTING} UI setting`
    );
    await kbnClient.request({
      method: 'POST',
      path: '/api/kibana/settings',
      body: { changes: { [EXPERIMENTAL_FEATURES_SETTING]: true } },
    });
    log.info('[connector-selection setup] Experimental features enabled');

    // Step 2: Fetch existing connectors to skip re-creation on re-runs.
    const existingRes = await kbnClient.request<Array<{ name: string }>>({
      method: 'GET',
      path: '/api/actions/connectors',
    });
    const existingNames = new Set(existingRes.data.map((c) => c.name));
    log.info(`[connector-selection setup] Found ${existingNames.size} existing connector(s)`);

    // Step 3: Create each connector. The connector lifecycle handler fires
    // onPostCreate and indexes each one into SML automatically.
    let created = 0;
    let skipped = 0;

    for (const connector of CONNECTORS) {
      if (existingNames.has(connector.name)) {
        log.info(`[connector-selection setup] SKIP ${connector.name} — already exists`);
        skipped++;
        continue;
      }

      try {
        await kbnClient.request({
          method: 'POST',
          path: '/api/actions/connector',
          body: connector,
        });
        log.info(`[connector-selection setup] OK   ${connector.name}`);
        created++;
      } catch (err) {
        log.warning(
          `[connector-selection setup] FAIL ${connector.name}: ${(err as Error).message}`
        );
      }
    }

    log.info(
      `[connector-selection setup] Done — created: ${created}, skipped: ${skipped}, total: ${CONNECTORS.length}`
    );

    // Step 4: Give the SML indexing pipeline a moment to settle before tests start.
    // The lifecycle handler is async and fires after each POST /api/actions/connector.
    await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    log.info('[connector-selection setup] SML indexing settle wait complete');
  }
);
