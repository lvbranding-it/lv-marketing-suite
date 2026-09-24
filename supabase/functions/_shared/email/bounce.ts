/**
 * What a delivery failure actually means, and whether it should be permanent.
 *
 * Every failure used to be treated the same: mark the recipient bounced and
 * suppress the address forever. That is right for a dead mailbox and wrong for
 * everything else — a greylisted message, a momentary reputation block, or a
 * message SendGrid never sent because of a header problem would quietly cost a
 * contact who was never unreachable in the first place.
 *
 * The rule here is that only a permanent refusal is permanent. Anything that
 * could plausibly succeed next week is recorded as a failure for that send and
 * left in the list.
 */

export type BounceDecision = {
  /** Status written to the recipient row for this send. */
  recipientStatus: "bounced" | "failed";
  /** Suppression reason, or null to keep mailing the address. */
  suppress: "bounced" | "invalid" | null;
  /** The receiving server's own words, for the record. */
  detail: string;
};

/** How many failures across campaigns before a soft one is treated as final. */
export const REPEAT_FAILURE_LIMIT = 3;

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Classifies one SendGrid delivery-failure event.
 *
 * `priorFailures` is how many previous sends to this address already failed. A
 * domain that blocks every time is unreachable in practice, so a soft failure
 * becomes permanent once it has happened often enough to stop being a blip.
 */
export function classifyBounce(
  event: Record<string, unknown>,
  priorFailures = 0,
): BounceDecision {
  const eventType = asText(event["event"]);
  const bounceType = asText(event["type"]);
  const status = asText(event["status"]);
  const reason = asText(event["reason"]);

  const detail = [eventType === "dropped" ? "dropped" : (bounceType || eventType), status, reason]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);

  // SendGrid never attempted this one. Usually the address is already
  // suppressed, or something was wrong with the request — neither is evidence
  // that the mailbox is dead. The exception is an address it judged invalid.
  if (eventType === "dropped") {
    const invalid = /invalid/i.test(reason);
    return { recipientStatus: "failed", suppress: invalid ? "invalid" : null, detail };
  }

  // A 4xx is explicitly temporary, whatever event carried it.
  const temporary = status.startsWith("4");
  // A hard bounce is the receiving server saying the address does not exist.
  const permanent = !temporary && (bounceType === "bounce" || status.startsWith("5"));

  if (permanent) return { recipientStatus: "bounced", suppress: "bounced", detail };

  // Blocked or deferred: real for this send, not proof of a dead mailbox —
  // unless it keeps happening.
  const exhausted = priorFailures + 1 >= REPEAT_FAILURE_LIMIT;
  return {
    recipientStatus: "failed",
    suppress: exhausted ? "bounced" : null,
    detail: exhausted ? `${detail} · failed ${priorFailures + 1} times`.slice(0, 500) : detail,
  };
}

/** How a recipient is recorded when the send skips them for being suppressed. */
export type SkipRecord = { status: "unsubscribed" | "failed"; note: string };

/**
 * What to write against someone the send skipped.
 *
 * Every skip used to be recorded as "unsubscribed", whatever the reason. That
 * made a dead mailbox look like a person who had asked to be left alone, which
 * both inflates the unsubscribe figure and hides the bounce one — the two
 * numbers a sender most needs to read honestly.
 */
export function suppressionSkip(reason: string | null | undefined): SkipRecord {
  switch (reason) {
    case "unsubscribed":
      return { status: "unsubscribed", note: "Skipped — unsubscribed" };
    case "spam":
      return { status: "failed", note: "Skipped — reported as spam" };
    case "invalid":
      return { status: "failed", note: "Skipped — address is invalid" };
    case "bounced":
      return { status: "failed", note: "Skipped — previously bounced" };
    default:
      // Suppressed for a reason nobody recorded. It is still not an unsubscribe.
      return { status: "failed", note: "Skipped — on the suppression list" };
  }
}
