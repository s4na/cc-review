import { z } from 'zod';

// Config schema
export const ConfigSchema = z.object({
  githubUsername: z.string(),
  githubTokenEnv: z.string().default('GITHUB_TOKEN'),
  reviewCommand: z.string().default('claude api chat'),
  claudeModel: z.string().default('claude-3-opus-20240229'),
  maxTokens: z.number().default(4000),
  maxConcurrent: z.number().default(4),
  commentHeader: z.string().default('[AI Review Bot]'),
  ownerAllowlist: z.array(z.string()).default([]),
  repoBlocklist: z.array(z.string()).default([]),
  reviewTargetFilter: z.enum(['own', 'others', 'all']).default('all'),
  patrolIntervalMinutes: z.number().min(5).max(60).default(10),
  webUIPort: z.number().default(4567)
});

export type Config = z.infer<typeof ConfigSchema>;

// Selections schema
export const SelectionsSchema = z.object({
  mode: z.enum(['org', 'user', 'list']),
  orgs: z.array(z.string()).default([]),
  users: z.array(z.string()).default([]),
  repos: z.array(z.string()).default([])
});

export type Selections = z.infer<typeof SelectionsSchema>;

// PR info
export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
  headRefName: string;
  updatedAt: string;
  author: string;
}

// Commit info
export interface CommitInfo {
  sha: string;
  committedDate: string;
}

// Status schema
export const StatusSchema = z.object({
  mode: z.enum(['running', 'waiting', 'error', 'idle']),
  lastRunStartedAt: z.string().optional(),
  currentTask: z.object({
    repo: z.string(),
    pr: z.number(),
    step: z.enum(['reviewing', 'diff', 'commenting', 'waitingRateLimit']),
    index: z.number(),
    total: z.number()
  }).optional(),
  error: z.string().optional()
});

export type Status = z.infer<typeof StatusSchema>;

// Review result
export interface ReviewResult {
  content: string;
  skipped: boolean;
  reason?: string;
}
