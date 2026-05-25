/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withActiveInferenceSpan, ElasticGenAIAttributes } from '@kbn/inference-tracing';
import type { TimeRange } from '@kbn/agent-builder-common';
import type { ScopedModel, ModelProvider } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { EsqlDocumentBase } from '@kbn/inference-plugin/server/tasks/nl_to_esql/doc_base';
import type { ToolEventEmitter } from '@kbn/agent-builder-server';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import { InferenceChatModel } from '@kbn/inference-langchain';
import type { EsqlResponse } from '../utils/esql';
import { createNlToEsqlGraph } from './graph';
import { indexExplorer } from '../index_explorer';
import { loadDocumentation } from './documentation';
import { loadTightPrompts } from './prompts_static_loader';

export interface GenerateEsqlResponse {
  /**
   * The ES|QL query which was generated
   */
  query: string;
  /**
   * The full text answer which was provided by the LLM when generating the query.
   */
  answer: string;
  /**
   * Results from executing the query.
   * Available if `executeQuery` was true and if a successful query was executed.
   */
  results?: EsqlResponse;
  /**
   * Error message if the query could not be executed
   */
  error?: string;
}

export interface GenerateEsqlDeps {
  model: ScopedModel;
  /**
   * If provided, used to select the fast model (effortLevel: low) for ESQL generation.
   * Falls back to `model` when not provided or when selectModel fails.
   */
  modelProvider?: ModelProvider;
  esClient: ElasticsearchClient;
  logger: Logger;
  events?: ToolEventEmitter;
}

export interface GenerateEsqlOptions {
  /**
   * The natural language query to generate ES|QL from
   */
  nlQuery: string;
  /**
   * The resource (index/datastream/alias) to target
   */
  index?: string;
  /**
   * Additional context to provide to the model (user prompt)
   */
  additionalContext?: string;
  /**
   * Additional instructions to provide to the model (system prompt)
   */
  additionalInstructions?: string;
  /**
   * If true, will attempt to execute the query and will return the results.
   * Defaults to `true`
   */
  executeQuery?: boolean;
  /**
   * Maximum number of retries if the query fails (execute or AST validation).
   * When `executeQuery` is true: retries after execution errors; when false: retries after AST validation errors.
   * Defaults to `3`
   * */
  maxRetries?: number;
  /**
   * Maximum row limit to use in generated ES|QL queries.
   */
  rowLimit?: number;
  /**
   * Time range used to supply named parameters (?_tstart, ?_tend)
   * when executing the generated query for validation.
   * Defaults to last 24 hours if not provided.
   */
  timeRange?: TimeRange;
  /**
   * If true, omits the instruction to use named parameters (?_tstart, ?_tend)
   * for time range filtering in generated queries.
   */
  disableNamedParams?: boolean;
}

export type GenerateEsqlParams = GenerateEsqlOptions & GenerateEsqlDeps;

export const generateEsql = async ({
  nlQuery,
  index,
  executeQuery = true,
  additionalInstructions,
  additionalContext,
  maxRetries = 3,
  rowLimit,
  timeRange: inputTimeRange,
  disableNamedParams,
  model,
  modelProvider,
  esClient,
  logger,
}: GenerateEsqlParams): Promise<GenerateEsqlResponse> => {
  const timeRange = inputTimeRange ?? { from: 'now-24h', to: 'now' };
  const docBase = await EsqlDocumentBase.load();
  const documentation = await loadDocumentation();
  const esqlCallbacks = buildServerESQLCallbacks({ client: esClient });

  const tightPrompts = await loadTightPrompts();
  logger?.info(
    `[generateEsql] tight prompts active — syntax: ${tightPrompts.syntax.length} chars, examples: ${tightPrompts.examples.length} chars (vs baseline ~16856 / ~9186)`
  );

  // Cap output tokens and disable reasoning tokens on every ESQL model call to reduce latency.
  // extraBody is forwarded as-is to the provider (e.g. OpenRouter passes reasoning.effort to
  // the underlying model). Explicit typed fields take precedence over anything in extraBody.
  const esqlModelOptions = {
    maxTokens: 4096,
    extraBody: { reasoning: { effort: 'none' } },
  };

  const withEsqlOptions = (base: ScopedModel): ScopedModel => ({
    ...base,
    chatModel: new InferenceChatModel({
      connector: base.connector,
      chatComplete: base.inferenceClient.chatComplete,
      ...esqlModelOptions,
    }),
  });

  // Internal inference endpoint for Haiku 4.5 — preferred fast model for ESQL generation.
  const ESQL_FAST_CONNECTOR_ID = '.anthropic-claude-4.5-haiku-chat_completion';

  let resolvedModel = withEsqlOptions(model);
  const esqlConnectorId = process.env.ESQL_MODEL_CONNECTOR_ID;
  logger?.info(
    `[generateEsql] modelProvider available: ${modelProvider != null}, esqlConnectorId: ${
      esqlConnectorId ?? 'none'
    }`
  );

  if (esqlConnectorId && modelProvider) {
    // Env var takes precedence for eval pinning. Use modelProvider.getModelById so internal
    // inference endpoint IDs (prefixed with '.') work in addition to regular connector IDs.
    try {
      resolvedModel = withEsqlOptions(
        await modelProvider.getModelById({ connectorId: esqlConnectorId })
      );
      logger?.info(`[generateEsql] env override — using connector: ${esqlConnectorId}`);
    } catch (err) {
      logger?.warn(
        `[generateEsql] env override failed for "${esqlConnectorId}": ${
          (err as Error)?.message
        } — falling back`
      );
    }
  } else if (modelProvider) {
    // Try Haiku 4.5 internal inference endpoint first (hardwired fast model for ESQL).
    // Falls back to selectModel(low) which picks whatever fast model is configured,
    // then ultimately falls back to the default model.
    try {
      resolvedModel = withEsqlOptions(
        await modelProvider.getModelById({ connectorId: ESQL_FAST_CONNECTOR_ID })
      );
      logger?.info(`[generateEsql] using fast model: ${ESQL_FAST_CONNECTOR_ID}`);
    } catch (fastErr) {
      logger?.warn(
        `[generateEsql] getModelById(${ESQL_FAST_CONNECTOR_ID}) failed: ${
          (fastErr as Error)?.message
        } — trying selectModel(low)`
      );
      try {
        const selected = await modelProvider.selectModel({ effortLevel: 'low' });
        resolvedModel = withEsqlOptions(selected);
        logger?.info(
          `[generateEsql] selectModel(low) resolved connector: ${selected.connector.connectorId}`
        );
      } catch (err) {
        logger?.warn(
          `[generateEsql] fast model unavailable: ${
            (err as Error)?.message
          } — using default connector: ${model.connector.connectorId}`
        );
      }
    }
  } else {
    // modelProvider not available at this call site — resolve fast model directly via inferenceClient.
    try {
      const connector = await model.inferenceClient.getConnectorById(ESQL_FAST_CONNECTOR_ID);
      const boundClient = model.inferenceClient.bindTo({ connectorId: ESQL_FAST_CONNECTOR_ID });
      resolvedModel = {
        connector,
        chatModel: new InferenceChatModel({
          connector,
          chatComplete: boundClient.chatComplete,
          ...esqlModelOptions,
        }),
        inferenceClient: boundClient,
      };
      logger?.info(`[generateEsql] using fast model: ${ESQL_FAST_CONNECTOR_ID}`);
    } catch (err) {
      logger?.warn(
        `[generateEsql] fast model unavailable (${
          (err as Error)?.message
        }) — using default connector: ${model.connector.connectorId}`
      );
    }
  }

  const graph = createNlToEsqlGraph({
    model: resolvedModel,
    esClient,
    docBase,
    documentation,
    esqlCallbacks,
    tightPrompts,
  });

  return withActiveInferenceSpan(
    'GenerateEsqlGraph',
    {
      attributes: {
        [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN',
      },
    },
    async () => {
      try {
        // Discover index if not provided (`indexExplorer` takes one string; append `additionalContext`
        // when set so resource selection can use editor notes or any other hints, not only `nlQuery`.)
        const nlQueryWithContext = additionalContext?.trim()
          ? `${nlQuery.trim()}\n\n${additionalContext.trim()}`
          : nlQuery.trim();

        let selectedTarget = index;
        if (!selectedTarget) {
          logger?.debug('No index provided, discovering target index using indexExplorer');
          const {
            resources: [selectedResource],
          } = await indexExplorer({
            nlQuery: nlQueryWithContext,
            esClient,
            limit: 1,
            model,
            logger,
          });
          if (!selectedResource) {
            throw new Error(
              'Could not discover a suitable index for the query. Please specify an index explicitly.'
            );
          }
          selectedTarget = selectedResource.name;
          logger?.debug(`Discovered target index: ${selectedTarget}`);
        }

        const outState = await graph.invoke(
          {
            nlQuery,
            target: selectedTarget,
            executeQuery,
            maxRetries,
            additionalInstructions,
            additionalContext,
            rowLimit,
            disableNamedParams,
            timeRange,
          },
          {
            recursionLimit: 25,
            tags: ['generate_esql'],
            metadata: { graphName: 'generate_esql' },
          }
        );

        return {
          error: outState.error,
          answer: outState.answer,
          query: outState.query,
          results: outState.results,
        };
      } catch (e) {
        throw new Error(`Could not generate ESQL query: ${e.message}`);
      }
    }
  );
};
