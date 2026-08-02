import { randomUUID } from "node:crypto";
import type { ConvQuestion, ConvQuestionOption } from "./transcript.js";

export interface ActiveQuestionRequest {
  requestId: string;
  session: string;
  questions: ConvQuestion[];
  createdAt: number;
}

export type QuestionAnswers = Record<string, string>;

export interface PendingQuestion {
  request: ActiveQuestionRequest;
  rawQuestions: unknown[];
  result: Promise<Record<string, unknown>>;
  resolve: (response: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class QuestionBroker {
  private pending = new Map<string, PendingQuestion>();

  open(session: string, payload: Record<string, unknown>): PendingQuestion {
    const toolInput = object(payload.tool_input);
    const rawQuestions = Array.isArray(toolInput.questions) ? toolInput.questions : [];
    const questions = liveQuestions(rawQuestions);
    if (questions.length === 0) throw new Error("AskUserQuestion contained no valid questions");

    const requestId = text(payload.tool_use_id) ?? randomUUID();
    const existing = this.pending.get(session);
    if (existing?.request.requestId === requestId) return existing;
    if (existing) {
      existing.reject(new Error("AskUserQuestion was superseded by a newer request"));
      this.pending.delete(session);
    }

    let resolve!: PendingQuestion["resolve"];
    let reject!: PendingQuestion["reject"];
    const result = new Promise<Record<string, unknown>>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    const pending: PendingQuestion = {
      request: { requestId, session, questions, createdAt: Date.now() },
      rawQuestions,
      result,
      resolve,
      reject,
    };
    this.pending.set(session, pending);
    return pending;
  }

  view(session: string): ActiveQuestionRequest | undefined {
    return this.pending.get(session)?.request;
  }

  respond(session: string, requestId: string, answers: unknown): void {
    const pending = this.pending.get(session);
    if (!pending || pending.request.requestId !== requestId) {
      throw new Error("question is no longer waiting for an answer");
    }
    const normalized = validateAnswers(pending.request.questions, answers);
    this.pending.delete(session);
    pending.resolve({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          questions: pending.rawQuestions,
          answers: normalized,
        },
      },
    });
  }

  cancel(session: string, requestId?: string): void {
    const pending = this.pending.get(session);
    if (!pending || (requestId && pending.request.requestId !== requestId)) return;
    this.pending.delete(session);
    pending.reject(new Error("AskUserQuestion hook disconnected"));
  }
}

// Unlike transcript cards, a live request must not clip labels or question
// strings: Claude keys `answers` by the exact question text and expects the
// original option label back. The provider already limits this tool's payload.
function liveQuestions(rawQuestions: unknown[]): ConvQuestion[] {
  const questions: ConvQuestion[] = [];
  for (const raw of rawQuestions) {
    const input = object(raw);
    const question = exactText(input.question);
    if (!question) continue;
    const options: ConvQuestionOption[] = [];
    if (Array.isArray(input.options)) {
      for (const rawOption of input.options) {
        const option = object(rawOption);
        const label = exactText(option.label);
        if (!label) continue;
        options.push({
          label,
          description: exactText(option.description),
          preview: exactText(option.preview),
        });
      }
    }
    questions.push({
      question,
      header: exactText(input.header),
      multiSelect: input.multiSelect === true,
      options,
    });
  }
  return questions;
}

function validateAnswers(questions: ConvQuestion[], value: unknown): QuestionAnswers {
  const input = object(value);
  const answers: QuestionAnswers = {};
  for (const question of questions) {
    const answer = exactText(input[question.question]);
    if (!answer) throw new Error(`missing answer for: ${question.question}`);
    answers[question.question] = answer;
  }
  return answers;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function exactText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export const questionBroker = new QuestionBroker();
