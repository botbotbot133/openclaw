import { normalizeAgentId } from "../../routing/session-key.js";
import { truncateUtf16Safe } from "../../utils.js";
import type { CronPayload } from "../types.js";

export function normalizeRequiredName(raw: unknown) {
  console.log("[DEBUG] normalizeRequiredName called");
  if (typeof raw !== "string") {
    throw new Error("cron job name is required");
  }
  const name = raw.trim();
  if (!name) {
    throw new Error("cron job name is required");
  }
  return name;
}

export function normalizeOptionalText(raw: unknown) {
  console.log("[DEBUG] normalizeOptionalText called");
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function truncateText(input: string, maxLen: number) {
  if (input.length <= maxLen) {
    return input;
  }
  return `${truncateUtf16Safe(input, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export function normalizeOptionalAgentId(raw: unknown) {
  console.log("[DEBUG] normalizeOptionalAgentId called");
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return normalizeAgentId(trimmed);
}

export function normalizeOptionalSessionKey(raw: unknown) {
  console.log("[DEBUG] normalizeOptionalSessionKey called");
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function inferLegacyName(job: {
  schedule?: { kind?: unknown; everyMs?: unknown; expr?: unknown };
  payload?: { kind?: unknown; text?: unknown; message?: unknown };
}) {
  console.log("[DEBUG] inferLegacyName called");
  const text =
    job?.payload?.kind === "systemEvent" && typeof job.payload.text === "string"
      ? job.payload.text
      : job?.payload?.kind === "agentTurn" && typeof job.payload.message === "string"
        ? job.payload.message
        : "";
  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  if (firstLine) {
    return truncateText(firstLine, 60);
  }

  const kind = typeof job?.schedule?.kind === "string" ? job.schedule.kind : "";
  if (kind === "cron" && typeof job?.schedule?.expr === "string") {
    return `Cron: ${truncateText(job.schedule.expr, 52)}`;
  }
  if (kind === "every" && typeof job?.schedule?.everyMs === "number") {
    return `Every: ${job.schedule.everyMs}ms`;
  }
  if (kind === "at") {
    return "One-shot";
  }
  return "Cron job";
}

export function normalizePayloadToSystemText(payload: CronPayload) {
  console.log("[DEBUG] normalizePayloadToSystemText START");
  console.log("[DEBUG] payload.kind =", payload?.kind);
  console.log("[DEBUG] payload =", JSON.stringify(payload, null, 2));

  if (payload.kind === "systemEvent") {
    console.log("[DEBUG] payload.text =", payload.text);
    console.log("[DEBUG] typeof payload.text =", typeof payload.text);

    if (typeof payload.text !== "string") {
      console.error("[DEBUG] ERROR: payload.text is not a string!");
      console.error("[DEBUG] payload.text =", payload.text);
      throw new Error(
        `cron: systemEvent payload.text must be a string, got ${typeof payload.text}`,
      );
    }

    return payload.text.trim();
  }

  console.log("[DEBUG] payload.message =", (payload as { message?: string }).message);
  return (payload as { message?: string }).message?.trim();
}
