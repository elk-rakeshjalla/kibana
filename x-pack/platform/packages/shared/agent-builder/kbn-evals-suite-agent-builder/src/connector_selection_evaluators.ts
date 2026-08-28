/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationResult, Evaluator, TaskOutput } from '@kbn/evals';
import { platformCoreTools } from '@kbn/agent-builder-common';
import type { BenchmarkExample } from '../evals/connector_selection/benchmark_dataset';

interface ConversationStep {
  type?: string;
  tool_id?: string;
  params?: Record<string, unknown>;
  results?: unknown[];
}

interface SmlSearchResultItem {
  entry_id?: string;
  title?: string;
}

interface SmlSearchResultData {
  items?: SmlSearchResultItem[];
}

interface SmlSearchResult {
  data?: SmlSearchResultData;
}

const getToolCallSteps = (output: TaskOutput): ConversationStep[] => {
  const steps = (output as { steps?: ConversationStep[] })?.steps ?? [];
  return steps.filter((s) => s?.type === 'tool_call');
};

/**
 * Builds a map of { entry_id → connector instance name } from all sml_search
 * tool call results in the conversation. Used to resolve which connector was
 * selected when the agent calls sml_attach.
 */
const buildEntryIdToNameMap = (steps: ConversationStep[]): Map<string, string> => {
  const map = new Map<string, string>();

  for (const step of steps) {
    if (step.tool_id !== platformCoreTools.smlSearch) continue;

    for (const result of step.results ?? []) {
      const items = (result as SmlSearchResult)?.data?.items ?? [];
      for (const item of items) {
        if (item.entry_id && item.title) {
          map.set(item.entry_id, item.title);
        }
      }
    }
  }

  return map;
};

/**
 * Returns the connector instance names for all connectors the agent attached
 * via sml_attach during the conversation.
 *
 * Resolves entry_ids from sml_attach params back to connector names by
 * cross-referencing the sml_search results captured earlier in the steps.
 */
export const getConnectorsAttachedFromSteps = (output: TaskOutput): string[] => {
  const steps = getToolCallSteps(output);
  const entryIdToName = buildEntryIdToNameMap(steps);
  const attached: string[] = [];

  for (const step of steps) {
    if (step.tool_id !== platformCoreTools.smlAttach) continue;

    const entryIds = step.params?.entry_ids;
    if (!Array.isArray(entryIds)) continue;

    for (const id of entryIds) {
      if (typeof id !== 'string') continue;
      const name = entryIdToName.get(id);
      if (name) attached.push(name);
    }
  }

  return [...new Set(attached)];
};

const connectorIsAttached = (connectorName: string, attachedNames: string[]): boolean => {
  const lower = connectorName.toLowerCase();
  return attachedNames.some((n) => n.toLowerCase() === lower);
};

/**
 * A single generic evaluator that reads connector routing assertions from
 * example ground truth (`expected`, i.e. `example.output`) and evaluates the
 * conversation against them.
 *
 * Ground truth keys (in `example.output`):
 * - `expectedConnectors`      — all connector names that must be attached.
 *     Single entry  → binary score (0 or 1), label PASS/FAIL.
 *     Multiple entries → partial score (attached / expected), label PASS/PARTIAL/FAIL.
 * - `shouldNotAttachConnector` — connector id that must NOT be attached.
 *     Binary score, label PASS/FAIL.
 *
 * When neither key is present the example is skipped (score 1, label SKIP).
 */
export const connectorSelectionEvaluator: Evaluator = {
  name: 'Connector Selection',
  kind: 'CODE',
  evaluate: async ({ output, expected }): Promise<EvaluationResult> => {
    const { expectedConnectors, shouldNotAttachConnector } =
      (expected as BenchmarkExample['output']) ?? {};

    if (!expectedConnectors?.length && !shouldNotAttachConnector) {
      return {
        score: 1,
        label: 'SKIP',
        explanation: 'No connector routing assertion in expected output',
      };
    }

    const attachedNames = getConnectorsAttachedFromSteps(output);

    // ── shouldNotAttachConnector (distractor with no correct alternative) ──
    if (shouldNotAttachConnector) {
      const attached = connectorIsAttached(shouldNotAttachConnector, attachedNames);
      const passed = !attached;
      return {
        score: passed ? 1 : 0,
        label: passed ? 'PASS' : 'FAIL',
        explanation: passed
          ? `Connector '${shouldNotAttachConnector}' correctly did not attach. Attached: ${attachedNames.join(', ') || 'none'}`
          : `Connector '${shouldNotAttachConnector}' incorrectly attached. Attached: ${attachedNames.join(', ')}`,
        metadata: { shouldNotAttachConnector, attachedNames },
      };
    }

    // ── expectedConnectors ────────────────────────────────────────────────
    const expected_ = expectedConnectors!;
    const attachedCount = expected_.filter((name) => connectorIsAttached(name, attachedNames)).length;
    const expectedCount = expected_.length;

    if (expectedCount === 1) {
      // Single connector — binary scoring
      const loaded = attachedCount === 1;
      return {
        score: loaded ? 1 : 0,
        label: loaded ? 'PASS' : 'FAIL',
        explanation: loaded
          ? `Connector '${expected_[0]}' was attached. Attached: ${attachedNames.join(', ')}`
          : `Connector '${expected_[0]}' was NOT attached. Attached: ${attachedNames.join(', ') || 'none'}`,
        metadata: { expectedConnectors: expected_, attachedNames, attachedCount },
      };
    }

    // Multi-connector — partial scoring
    const score = attachedCount / expectedCount;
    const missing = expected_.filter((name) => !connectorIsAttached(name, attachedNames));
    const label = attachedCount === expectedCount ? 'PASS' : attachedCount === 0 ? 'FAIL' : 'PARTIAL';

    return {
      score,
      label,
      explanation:
        attachedCount === expectedCount
          ? `All ${expectedCount} expected connectors attached: ${attachedNames.join(', ')}`
          : `${attachedCount}/${expectedCount} expected connectors attached. Missing: ${missing.join(', ')}. Attached: ${attachedNames.join(', ') || 'none'}`,
      metadata: { expectedConnectors: expected_, attachedNames, attachedCount, missing },
    };
  },
};