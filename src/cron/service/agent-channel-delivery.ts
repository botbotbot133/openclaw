/**
 * Agent Channel Delivery for Cron Jobs
 *
 * This module enables cron jobs to deliver their output directly to other agents.
 * It bridges the cron service layer with the agent messaging system.
 */

import type { OpenClawConfig } from "../../config/types.js";
import { getChildLogger } from "../../logging.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { CronJob } from "../types.js";

const logger = getChildLogger({ subsystem: "cron-agent-channel" });

export type AgentChannelDeliveryResult =
  | { ok: true; sessionKey: string; message: string }
  | { ok: false; error: string };

/**
 * Deliver a cron job result to another agent via agent channel.
 *
 * This function uses enqueueSystemEvent with cross-agent support
 * by setting the appropriate agentId in the options.
 */
export async function deliverToAgentChannel(
  cfg: OpenClawConfig,
  deps: {
    enqueueSystemEvent: (
      text: string,
      opts?: { agentId?: string; sessionKey?: string; contextKey?: string },
    ) => void;
    requestHeartbeatNow: (opts?: {
      reason?: string;
      agentId?: string;
      sessionKey?: string;
    }) => void;
  },
  job: CronJob,
  targetAgentId: string,
  message: string,
): Promise<AgentChannelDeliveryResult> {
  const normalizedTargetId = normalizeAgentId(targetAgentId);
  const sourceAgentId = normalizeAgentId(job.agentId);

  logger.debug(
    { jobId: job.id, sourceAgentId, targetAgentId: normalizedTargetId },
    "Delivering cron result to agent channel",
  );

  // Check if agent-to-agent is allowed
  const a2aEnabled = cfg.tools?.agentToAgent?.enabled ?? false;
  if (sourceAgentId !== normalizedTargetId && !a2aEnabled) {
    return {
      ok: false,
      error: `Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow delivery from ${sourceAgentId} to ${normalizedTargetId}`,
    };
  }

  // Check if this specific agent-to-agent pair is allowed
  if (sourceAgentId !== normalizedTargetId) {
    const allowedTargets = cfg.tools?.agentToAgent?.allow;
    if (allowedTargets && Array.isArray(allowedTargets)) {
      const isAllowed = allowedTargets.some((rule) => {
        if (typeof rule === "string") {
          return normalizeAgentId(rule) === normalizedTargetId;
        }
        return false;
      });
      if (!isAllowed) {
        return {
          ok: false,
          error: `Delivery from ${sourceAgentId} to ${normalizedTargetId} is not allowed by agentToAgent policy`,
        };
      }
    }
  }

  // Create a session key for the target agent
  // Use the target agent's main session
  const sessionKey = `agent:${normalizedTargetId}:main`;

  try {
    // Use enqueueSystemEvent to deliver to the target agent
    // The key is passing the target agentId in the options
    deps.enqueueSystemEvent(message, {
      agentId: normalizedTargetId, // Target agent
      sessionKey,
      contextKey: `cron:${job.id}`,
    });

    // Request heartbeat to wake the target agent
    deps.requestHeartbeatNow({
      reason: `cron:${job.id}:agent-delivery`,
      agentId: normalizedTargetId,
      sessionKey,
    });

    logger.info(
      { jobId: job.id, targetAgentId: normalizedTargetId, sessionKey },
      "Successfully delivered cron result to agent channel",
    );

    return {
      ok: true,
      sessionKey,
      message: `Delivered to agent ${normalizedTargetId}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobId: job.id, targetAgentId: normalizedTargetId, error: errorMsg },
      "Failed to deliver cron result to agent channel",
    );
    return {
      ok: false,
      error: `Agent channel delivery failed: ${errorMsg}`,
    };
  }
}

/**
 * Check if agent channel delivery is configured and available.
 */
export function isAgentChannelAvailable(cfg: OpenClawConfig, targetAgentId: string): boolean {
  const normalizedTargetId = normalizeAgentId(targetAgentId);

  // Check if target agent exists in config
  const targetAgent = cfg.agents?.list?.find((a) => normalizeAgentId(a.id) === normalizedTargetId);

  if (!targetAgent) {
    return false;
  }

  return true;
}
