import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AnthropicProvider } from './anthropic.provider';
import { DeterministicProvider } from './deterministic.provider';
import { OpenAIProvider } from './openai.provider';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../ai-gateway.errors';
import type { ResearchParams } from './provider.interface';

/**
 * F1 — pesquisa web no provider Anthropic: forma do pedido (ferramentas de
 * servidor, domínios, teto de buscas), retomada de `pause_turn`, citações com
 * a URL de cada página e os erros tipados de sempre.
 */

type Citation = Record<string, unknown>;
type Block = { type: 'text'; text: string; citations?: Citation[] } | Record<string, unknown>;

interface FakeResponse {
  model?: string;
  content: Block[];
  stopReason?: string;
  stopDetails?: { type: 'refusal'; category: string | null; explanation: string | null };
  webSearchRequests?: number;
  usage?: { input_tokens: number; output_tokens: number };
}

function streamEvents(response: FakeResponse): Array<Record<string, unknown>> {
  const usage = response.usage ?? { input_tokens: 1000, output_tokens: 200 };
  const blockEvents = response.content.flatMap((block, index) => {
    if (block.type !== 'text') {
      return [
        { type: 'content_block_start', index, content_block: block },
        { type: 'content_block_stop', index },
      ];
    }
    const text = block as { text: string; citations?: Citation[] };
    return [
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '', citations: null },
      },
      ...(text.citations ?? []).map((citation) => ({
        type: 'content_block_delta',
        index,
        delta: { type: 'citations_delta', citation },
      })),
      { type: 'content_block_delta', index, delta: { type: 'text_delta', text: text.text } },
      { type: 'content_block_stop', index },
    ];
  });

  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_research',
        type: 'message',
        role: 'assistant',
        model: response.model ?? 'claude-sonnet-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { ...usage, output_tokens: 1 },
      },
    },
    ...blockEvents,
    {
      type: 'message_delta',
      delta: {
        stop_reason: response.stopReason ?? 'end_turn',
        stop_sequence: null,
        stop_details: response.stopDetails ?? null,
      },
      usage: {
        output_tokens: usage.output_tokens,
        server_tool_use: {
          web_search_requests: response.webSearchRequests ?? 0,
          web_fetch_requests: 0,
        },
      },
    },
    { type: 'message_stop' },
  ];
}

function sseResponse(response: FakeResponse): Response {
  const body = streamEvents(response)
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function mockAnthropicApi(...responses: FakeResponse[]) {
  let call = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const response = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return Promise.resolve(sseResponse(response));
  });
}

function sentBody(fetchMock: ReturnType<typeof mockAnthropicApi>, call = 0) {
  const [, init] = fetchMock.mock.calls[call] ?? [];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function createProvider() {
  return new AnthropicProvider(new ConfigService({ AI_API_KEY: 'test-key' }), {
    apiKey: 'test-key',
    baseUrl: 'https://anthropic.test',
  });
}

const ALLOWED_DOMAINS = ['gov.br', 'ahajournals.org'];

function params(overrides: Partial<ResearchParams> = {}): ResearchParams {
  return {
    model: 'claude-sonnet-5-5',
    system: 'Você é a etapa de pesquisa.',
    prompt: 'Síndrome: déficit neurológico focal.',
    effort: 'low',
    allowedDomains: ALLOWED_DOMAINS,
    maxSearches: 5,
    maxFetches: 5,
    maxFetchContentTokens: 6000,
    ...overrides,
  };
}

const AHA_URL = 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211';
const MS_URL = 'https://www.gov.br/saude/pt-br/assuntos/protocolos/avc.pdf';

const searchUse = {
  type: 'server_tool_use',
  id: 'srvtoolu_1',
  name: 'web_search',
  input: { query: 'trombólise AVC isquêmico diretriz' },
};
const searchResult = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_1',
  content: [
    {
      type: 'web_search_result',
      url: AHA_URL,
      title: 'Guidelines for the Early Management of Acute Ischemic Stroke',
      encrypted_content: 'enc',
      page_age: null,
    },
  ],
};
const fetchUse = {
  type: 'server_tool_use',
  id: 'srvtoolu_2',
  name: 'web_fetch',
  input: { url: MS_URL },
};
const fetchResult = {
  type: 'web_fetch_tool_result',
  tool_use_id: 'srvtoolu_2',
  content: {
    type: 'web_fetch_result',
    url: MS_URL,
    retrieved_at: '2026-10-11T10:00:00Z',
    content: {
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: 'Linha de cuidado do AVC…' },
      title: 'Linha de Cuidado do AVC',
      citations: { enabled: true },
    },
  },
};

describe('AnthropicProvider.research', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request shape', () => {
    it('sends web search and web fetch restricted to the allowlist, with their caps', async () => {
      const fetchMock = mockAnthropicApi({ content: [{ type: 'text', text: 'Resumo.' }] });

      await createProvider().research(params());

      const body = sentBody(fetchMock);
      expect(body.tools).toEqual([
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
          allowed_domains: ALLOWED_DOMAINS,
        },
        {
          type: 'web_fetch_20250910',
          name: 'web_fetch',
          max_uses: 5,
          allowed_domains: ALLOWED_DOMAINS,
          citations: { enabled: true },
          max_content_tokens: 6000,
        },
      ]);
      expect(body.model).toBe('claude-sonnet-5-5');
      expect(body.system).toBe('Você é a etapa de pesquisa.');
      expect(body.messages).toEqual([
        { role: 'user', content: 'Síndrome: déficit neurológico focal.' },
      ]);
      expect(body.thinking).toEqual({ type: 'adaptive' });
      expect(body.output_config).toEqual({ effort: 'low' });
      expect(body).not.toHaveProperty('fallbacks');
      expect(body).not.toHaveProperty('temperature');
    });

    it('uses the basic tool versions on every model (they return citations)', async () => {
      const fetchMock = mockAnthropicApi({
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: 'Resumo.' }],
      });

      await createProvider().research(params({ model: 'claude-haiku-5-5' }));

      const tools = sentBody(fetchMock).tools as Array<Record<string, unknown>>;
      expect(tools.map((tool) => tool.type)).toEqual(['web_search_20250305', 'web_fetch_20250910']);
      expect(tools.every((tool) => !('allowed_callers' in tool))).toBe(true);
    });
  });

  describe('response', () => {
    it('returns the text and every citation with the URL of its page', async () => {
      mockAnthropicApi({
        webSearchRequests: 2,
        content: [
          { type: 'text', text: 'Vou buscar. ' },
          searchUse,
          searchResult,
          fetchUse,
          fetchResult,
          {
            type: 'text',
            text: 'Alteplase até 4,5 h.',
            citations: [
              {
                type: 'web_search_result_location',
                url: AHA_URL,
                title: 'Guidelines for the Early Management of Acute Ischemic Stroke',
                encrypted_index: 'idx',
                cited_text: 'Alteplase 0.9 mg/kg within 4.5 hours.',
              },
            ],
          },
          {
            type: 'text',
            text: ' A linha de cuidado do MS orienta a TC imediata.',
            citations: [
              {
                type: 'char_location',
                document_index: 0,
                document_title: 'Linha de Cuidado do AVC',
                start_char_index: 0,
                end_char_index: 20,
                file_id: null,
                cited_text: 'TC de crânio imediata.',
              },
            ],
          },
        ],
      });

      const result = await createProvider().research(params());

      expect(result.text).toBe(
        'Vou buscar. Alteplase até 4,5 h. A linha de cuidado do MS orienta a TC imediata.',
      );
      expect(result.citations).toEqual([
        {
          url: AHA_URL,
          title: 'Guidelines for the Early Management of Acute Ischemic Stroke',
          citedText: 'Alteplase 0.9 mg/kg within 4.5 hours.',
        },
        { url: MS_URL, title: 'Linha de Cuidado do AVC', citedText: 'TC de crânio imediata.' },
      ]);
      expect(result.model).toBe('claude-sonnet-5-5');
      expect(result.usage).toMatchObject({
        promptTokens: 1000,
        completionTokens: 200,
        webSearchRequests: 2,
      });
      expect(result.continuations).toBe(0);
      expect(result.stopReason).toBe('end_turn');
    });

    it('finds the page of a PDF citation by its position when it has no title', async () => {
      const untitledPdf = {
        ...fetchResult,
        content: {
          ...fetchResult.content,
          content: { ...fetchResult.content.content, title: null },
        },
      };
      mockAnthropicApi({
        content: [
          fetchUse,
          untitledPdf,
          {
            type: 'text',
            text: 'TC imediata.',
            citations: [
              {
                type: 'page_location',
                document_index: 0,
                document_title: null,
                start_page_number: 3,
                end_page_number: 4,
                file_id: null,
                cited_text: 'TC de crânio sem contraste imediata.',
              },
            ],
          },
        ],
      });

      const result = await createProvider().research(params());

      expect(result.citations).toEqual([
        { url: MS_URL, title: null, citedText: 'TC de crânio sem contraste imediata.' },
      ]);
    });

    it('drops a document citation whose page it cannot find', async () => {
      mockAnthropicApi({
        content: [
          {
            type: 'text',
            text: 'Sem página.',
            citations: [
              {
                type: 'char_location',
                document_index: 4,
                document_title: 'Página que não foi lida',
                start_char_index: 0,
                end_char_index: 5,
                file_id: null,
                cited_text: 'trecho',
              },
            ],
          },
        ],
      });

      const result = await createProvider().research(params());

      expect(result.citations).toEqual([]);
    });
  });

  describe('pause_turn', () => {
    it('resumes the paused turn with the same tools and sums tokens and searches', async () => {
      const fetchMock = mockAnthropicApi(
        { stopReason: 'pause_turn', webSearchRequests: 3, content: [searchUse, searchResult] },
        {
          webSearchRequests: 1,
          content: [
            {
              type: 'text',
              text: 'Alteplase até 4,5 h.',
              citations: [
                {
                  type: 'web_search_result_location',
                  url: AHA_URL,
                  title: 'AHA/ASA',
                  encrypted_index: 'idx',
                  cited_text: 'Alteplase within 4.5 hours.',
                },
              ],
            },
          ],
        },
      );

      const result = await createProvider().research(params());

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const resumed = sentBody(fetchMock, 1);
      expect(resumed.tools).toEqual(sentBody(fetchMock, 0).tools);
      expect(resumed.messages).toEqual([
        { role: 'user', content: 'Síndrome: déficit neurológico focal.' },
        { role: 'assistant', content: [searchUse, { ...searchResult }] },
      ]);
      expect(result.continuations).toBe(1);
      expect(result.usage).toMatchObject({
        promptTokens: 2000,
        completionTokens: 400,
        webSearchRequests: 4,
      });
      expect(result.citations).toHaveLength(1);
      expect(result.stopReason).toBe('end_turn');
    });

    it('stops after three resumptions and returns what it has', async () => {
      const fetchMock = mockAnthropicApi({
        stopReason: 'pause_turn',
        webSearchRequests: 1,
        content: [searchUse, searchResult],
      });

      const result = await createProvider().research(params());

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.continuations).toBe(3);
      expect(result.stopReason).toBe('pause_turn');
      expect(result.usage.webSearchRequests).toBe(4);
    });
  });

  describe('typed errors', () => {
    it('raises a refusal with its category and the tokens spent', async () => {
      mockAnthropicApi({
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: 'bio', explanation: null },
        content: [],
      });

      const error = await createProvider()
        .research(params())
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiRefusalError);
      expect((error as AiRefusalError).details).toMatchObject({
        model: 'claude-sonnet-5-5',
        category: 'bio',
      });
    });

    it('raises a truncation', async () => {
      mockAnthropicApi({ stopReason: 'max_tokens', content: [{ type: 'text', text: 'Resu' }] });

      await expect(createProvider().research(params())).rejects.toBeInstanceOf(AiTruncatedError);
    });
  });

  it.each([
    [
      'openai',
      () =>
        new OpenAIProvider(new ConfigService({ AI_API_KEY: 'test-key' }), {
          apiKey: 'test-key',
          baseUrl: 'https://openai.test/v1',
        }),
    ],
    ['test', () => new DeterministicProvider()],
  ])('the %s provider has no web research', async (_name, create) => {
    await expect(create().research()).rejects.toBeInstanceOf(AiCapabilityUnsupportedError);
  });
});
