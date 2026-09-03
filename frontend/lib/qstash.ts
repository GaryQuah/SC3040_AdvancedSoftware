import { Client, Receiver } from "@upstash/qstash";

export interface ActivityJobPayload {
  activityId: number;
  athleteId: number;
  aspectType: "create" | "update" | "delete";
  eventTime: number;
}

const qstashToken = process.env.QSTASH_TOKEN;
const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

export const qstashClient = qstashToken
  ? new Client({ token: qstashToken })
  : null;

export const qstashReceiver = currentSigningKey && nextSigningKey
  ? new Receiver({
      currentSigningKey,
      nextSigningKey,
    })
  : null;

/**
 * Publishes an activity processing task to Upstash QStash.
 */
export async function enqueueActivityProcessing(payload: ActivityJobPayload): Promise<{ messageId: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const destinationUrl = `${appUrl}/api/jobs/process-activity`;

  if (!qstashClient) {
    // If QStash is not configured in local dev, simulate immediate or logged dispatch
    if (process.env.NODE_ENV === "development") {
      fetch(destinationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
    return { messageId: `mock_msg_${Date.now()}` };
  }

  const response = await qstashClient.publishJSON({
    url: destinationUrl,
    body: payload,
    retries: 3,
  });

  return { messageId: response.messageId };
}

/**
 * Verifies QStash signature for incoming webhook/job worker requests.
 */
export async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  if (!qstashReceiver) {
    return true;
  }

  if (!signature) {
    return false;
  }

  try {
    return await qstashReceiver.verify({
      signature,
      body,
    });
  } catch {
    return false;
  }
}
