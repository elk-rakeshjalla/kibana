/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Connector-selection benchmark dataset — parsed at runtime from benchmark_dataset.csv.
 *
 * Adding or modifying examples requires only editing the CSV — this file stays untouched.
 *
 * CSV columns: connector_id, category, query, query_type, expected_connectors, notes
 *
 * Query types:
 *   direct     — query that explicitly names the connector/service
 *   indirect   — describes the task without naming the service
 *   distractor — sounds like this connector but should route to a different one
 *
 * Ground truth wiring (in `output`, read by evaluators via the `expected` parameter):
 *   direct/indirect  → expectedConnectors = [connector name(s)] (all must attach)
 *   distractor       → expectedConnectors = [correct alternative connector name]
 *   distractor (no expected_connectors) → shouldNotAttachConnector = connector_id
 *
 * Multi-connector cases use `|` to separate names in expected_connectors:
 *   "Slack (testing)|Gmail (testing)|Jira Cloud (testing)"
 *
 * Scoring:
 *   Single expectedConnectors  → binary  (score 0 or 1)
 *   Multiple expectedConnectors → partial (score = attached_count / expected_count)
 *   shouldNotAttachConnector   → binary  (score 1 if absent, 0 if present)
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

type QueryType = 'direct' | 'indirect' | 'distractor';

interface CsvRow {
  connector_id: string;
  category: string;
  query: string;
  query_type: QueryType;
  expected_connectors: string;
  notes: string;
}

export interface BenchmarkExample {
  input: { question: string };
  /** Ground truth annotations — read by evaluators via the `expected` param. */
  output: {
    /** All connector instance names that must be attached. */
    expectedConnectors?: string[];
    /** Connector id that must NOT be attached (distractor with no correct alternative). */
    shouldNotAttachConnector?: string;
  };
  /** Descriptive metadata — enriches human understanding only. */
  metadata: {
    connectorId: string;
    category: string;
    queryType: QueryType;
    notes?: string;
  };
}

function parseCsv(): BenchmarkExample[] {
  const csvPath = path.join(__dirname, 'benchmark_dataset.csv');
  const csvString = fs.readFileSync(csvPath, 'utf-8');

  const { data } = Papa.parse<CsvRow>(csvString, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });

  return data.map(({ connector_id, category, query, query_type, expected_connectors, notes }) => {
    const trimmed = expected_connectors.trim();

    if (query_type !== 'distractor' && !trimmed) {
      throw new Error(`expected_connectors is required for direct/indirect row: "${query}"`);
    }

    const output: BenchmarkExample['output'] = trimmed
      ? { expectedConnectors: trimmed.split('|').map((s) => s.trim()) }
      : { shouldNotAttachConnector: connector_id };

    return {
      input: { question: query.trim() },
      output,
      metadata: {
        connectorId: connector_id,
        category,
        queryType: query_type,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    };
  });
}

const ALL_EXAMPLES: BenchmarkExample[] = parseCsv();

const byConnector = (connectorId: string): BenchmarkExample[] =>
  ALL_EXAMPLES.filter((e) => e.metadata.connectorId === connectorId);

// ─── STORAGE ────────────────────────────────────────────────────────────────

export const AMAZON_S3_EXAMPLES = byConnector('amazon_s3');
export const BOX_EXAMPLES = byConnector('box');
export const GOOGLE_CLOUD_STORAGE_EXAMPLES = byConnector('google_cloud_storage');
export const GOOGLE_DRIVE_EXAMPLES = byConnector('google_drive');
export const SHAREPOINT_ONLINE_EXAMPLES = byConnector('sharepoint_online');

// ─── SEARCH ─────────────────────────────────────────────────────────────────

export const BRAVE_SEARCH_EXAMPLES = byConnector('brave_search');
export const FIRECRAWL_EXAMPLES = byConnector('firecrawl');
export const JINA_READER_EXAMPLES = byConnector('jina_reader');
export const TAVILY_EXAMPLES = byConnector('tavily');

// ─── KNOWLEDGE ──────────────────────────────────────────────────────────────

export const CONFLUENCE_CLOUD_EXAMPLES = byConnector('confluence_cloud');
export const NOTION_EXAMPLES = byConnector('notion');

// ─── MESSAGING ──────────────────────────────────────────────────────────────

export const MICROSOFT_TEAMS_EXAMPLES = byConnector('microsoft_teams');
export const SLACK_EXAMPLES = byConnector('slack');

// ─── EMAIL ──────────────────────────────────────────────────────────────────

export const GMAIL_EXAMPLES = byConnector('gmail');
export const OUTLOOK_EXAMPLES = byConnector('outlook');

// ─── CALENDAR ───────────────────────────────────────────────────────────────

export const GOOGLE_CALENDAR_EXAMPLES = byConnector('google_calendar');
export const ZOOM_EXAMPLES = byConnector('zoom');

// ─── CRM ────────────────────────────────────────────────────────────────────

export const HUBSPOT_EXAMPLES = byConnector('hubspot');
export const SALESFORCE_EXAMPLES = byConnector('salesforce');

// ─── DEV ────────────────────────────────────────────────────────────────────

export const FIGMA_EXAMPLES = byConnector('figma');
export const GITHUB_EXAMPLES = byConnector('github');
export const JIRA_CLOUD_EXAMPLES = byConnector('jira_cloud');
export const TRELLO_EXAMPLES = byConnector('trello');

// ─── CROSS-SERVICE ──────────────────────────────────────────────────────────

export const MULTI_CONNECTOR_EXAMPLES = byConnector('multi');