import { z } from 'zod';

export const protocolNodeTypeSchema = z.enum(['question', 'action', 'outcome']);

const baseNodeSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
});

const questionNodeSchema = baseNodeSchema.extend({
  nodeType: z.literal('question'),
  content: z.object({
    question: z.string().min(1),
    answerType: z.enum(['boolean', 'choice', 'number', 'text']),
    choices: z.array(z.string().min(1)).optional(),
  }),
});

const actionNodeSchema = baseNodeSchema.extend({
  nodeType: z.literal('action'),
  content: z.object({
    action: z.string().min(1),
    citationChunkId: z.string().min(1).optional(),
  }),
});

const outcomeNodeSchema = baseNodeSchema.extend({
  nodeType: z.literal('outcome'),
  content: z.object({
    outcome: z.string().min(1),
  }),
});

export const protocolNodeInputSchema = z.discriminatedUnion('nodeType', [
  questionNodeSchema,
  actionNodeSchema,
  outcomeNodeSchema,
]);

export const protocolEdgeInputSchema = z.object({
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  condition: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createProtocolSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().min(1),
  institutionId: z.string().uuid().optional(),
  sourceRef: z.string().optional(),
  nodes: z.array(protocolNodeInputSchema).min(1),
  edges: z.array(protocolEdgeInputSchema).default([]),
});

export type CreateProtocolInput = z.infer<typeof createProtocolSchema>;
export type ProtocolNodeInput = z.infer<typeof protocolNodeInputSchema>;
export type ProtocolEdgeInput = z.infer<typeof protocolEdgeInputSchema>;
