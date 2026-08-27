// Reading real mail out of the local stack.
//
// `supabase start` runs a mail catcher on the port config.toml still calls
// [inbucket] (54324) — the key kept its name, but the service behind it is
// Mailpit, with a different API. GoTrue delivers there, so an emailed
// 6-digit code is genuinely retrievable in a test: no mocked auth
// endpoints, no asserting on the request instead of the result.

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

type Message = { ID: string; Created: string };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Mailpit ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Messages addressed to this recipient, newest first (Mailpit's order). */
async function messagesFor(address: string): Promise<Message[]> {
  const query = encodeURIComponent(`to:${address}`);
  const res = await json<{ messages: Message[] }>(`${MAILPIT}/api/v1/search?query=${query}&limit=50`);
  return res.messages ?? [];
}

/** Drop this recipient's mail, so a later wait can't match an older code. */
export async function clearMailbox(address: string): Promise<void> {
  const ids = (await messagesFor(address).catch(() => [])).map((m) => m.ID);
  if (ids.length === 0) return;
  await fetch(`${MAILPIT}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
}

/**
 * The 6-digit code from the newest message sent to this address.
 *
 * Polls, because the send is asynchronous relative to the click that
 * triggered it. Clear the mailbox first and this cannot pick up a stale
 * code from an earlier step.
 */
export async function waitForCode(address: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let seen = 0;

  while (Date.now() < deadline) {
    const messages = await messagesFor(address).catch(() => [] as Message[]);
    seen = messages.length;
    if (messages.length > 0) {
      const body = await json<{ Text?: string; HTML?: string }>(
        `${MAILPIT}/api/v1/message/${messages[0]!.ID}`,
      );
      const source = `${body.Text ?? ""}\n${body.HTML ?? ""}`;
      // The template renders the code on its own line; take the first
      // standalone run of six digits so a year or an id cannot be mistaken
      // for it.
      const match = source.match(/(?<!\d)(\d{6})(?!\d)/);
      if (match) return match[1]!;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error(
    `No 6-digit code arrived for ${address} within ${timeoutMs}ms (${seen} message(s) found). ` +
      "An empty mailbox means GoTrue did not send. Mail without a code means the change-email " +
      "template is not wired into supabase/config.toml — the stock one has no {{ .Token }}.",
  );
}
