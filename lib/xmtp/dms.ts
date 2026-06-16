"use client";

/**
 * Thin wrapper around the XMTP browser SDK so React components don't have
 * to wrestle with the raw types. We expose narrow primitives matching the
 * Dappcon-Chat use case:
 *   - list / stream DM conversations
 *   - load / send / stream messages in a single DM
 *   - resolve a peer Ethereum address ↔ inboxId
 *
 * Behaviour matches the reference repo (zengzengzenghuy/xmtp-circles-miniapp)
 * — peerInboxId is preferred over addedByInboxId because the latter can
 * resolve to the connected user on incoming conversations.
 */

import {
  type Client,
  type DecodedMessage,
  type Dm,
  IdentifierKind,
} from "@xmtp/browser-sdk";
import { contentTypesAreEqual } from "@xmtp/content-type-primitives";
import { ContentTypeText } from "@xmtp/content-type-text";

import { normalizeAddress } from "@/lib/addr";

export type DmSummary = {
  conversationId: string;
  peerInboxId: string;
  peerAddress: `0x${string}` | null;
  lastMessageText: string | null;
  lastMessageSenderInboxId: string | null;
  lastMessageSentAtNs: bigint;
  createdAtNs: bigint;
};

export type ThreadMessage = {
  id: string;
  text: string;
  sentAtNs: bigint;
  senderInboxId: string;
  mine: boolean;
};

function getMessageText(msg: DecodedMessage): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  // Non-text messages (reactions, group updates, attachments) are filtered
  // out at the call site — render as empty if one slips through.
  return "";
}

/**
 * Canonical content-type check per the XMTP browser SDK docs (chunk 00447):
 *   `contentTypesAreEqual(message.contentType, ContentTypeText)`
 *
 * String comparison against `contentType.toString()` is fragile — the
 * serialised form differs across SDK versions and silently filters out
 * every text message if you get the format wrong.
 */
function isText(msg: DecodedMessage): boolean {
  return !!msg.contentType && contentTypesAreEqual(msg.contentType, ContentTypeText);
}

/**
 * Resolve `inboxId` → Ethereum address via the preferences cache, falling
 * back to a network refresh. Returns null only when XMTP genuinely has no
 * Ethereum identifier on file for the inbox (extremely rare — the inbox
 * has to be registered with something to receive messages).
 */
type RawIdentifier = { identifier: string; identifierKind: IdentifierKind };
type RawInboxState = {
  accountIdentifiers?: RawIdentifier[];
  recoveryIdentifier?: RawIdentifier;
};

function pickEthereum(state: RawInboxState | undefined): string | null {
  if (!state) return null;
  const fromAccounts = state.accountIdentifiers?.find(
    (i) => i.identifierKind === IdentifierKind.Ethereum,
  )?.identifier;
  if (fromAccounts) return fromAccounts;
  // Safe-created inboxes sometimes surface the Ethereum address only on
  // `recoveryIdentifier` until the next association is published.
  const fromRecovery =
    state.recoveryIdentifier?.identifierKind === IdentifierKind.Ethereum
      ? state.recoveryIdentifier?.identifier
      : null;
  return fromRecovery ?? null;
}

export async function resolvePeerAddressFromInboxId(
  client: Client,
  inboxId: string,
): Promise<`0x${string}` | null> {
  // Try the local cache first; fall back to a network refresh when the
  // identifier isn't there yet (common for freshly streamed-in DMs).
  const lookups: Array<() => Promise<unknown>> = [
    () => client.preferences.getInboxStates([inboxId]),
    () => client.preferences.fetchInboxStates([inboxId]),
  ];
  for (const lookup of lookups) {
    try {
      const states = (await lookup()) as RawInboxState[];
      const id = pickEthereum(states[0]);
      if (id) return normalizeAddress(id);
    } catch (err) {
      console.warn("[xmtp] inbox-state lookup failed:", err);
    }
  }
  return null;
}

async function peerAddressOf(
  conv: Dm,
  client?: Client,
): Promise<`0x${string}` | null> {
  let peerInboxId: string | null = null;
  try {
    const members = await conv.members();
    peerInboxId = await conv.peerInboxId().catch(() => null);
    const peer = peerInboxId
      ? members.find((m) => m.inboxId === peerInboxId)
      : null;
    const id = peer?.accountIdentifiers?.find(
      (i) => i.identifierKind === IdentifierKind.Ethereum,
    )?.identifier;
    if (id) return normalizeAddress(id);
  } catch (err) {
    console.warn("[xmtp] peerAddressOf (members) failed:", err);
  }
  // Members map didn't carry an Ethereum identifier yet (common on a
  // freshly streamed-in first-contact DM where the peer's identity hasn't
  // synced locally). Ask the network directly — that path also checks the
  // recoveryIdentifier for Safe-created inboxes.
  if (client && peerInboxId) {
    return resolvePeerAddressFromInboxId(client, peerInboxId);
  }
  return null;
}

export async function summarizeDm(
  conv: Dm,
  client?: Client,
): Promise<DmSummary | null> {
  try {
    const [peerInboxId, lastMessage, peerAddress] = await Promise.all([
      conv.peerInboxId().catch(() => null),
      conv.lastMessage().catch(() => undefined),
      peerAddressOf(conv, client),
    ]);
    if (!peerInboxId) return null;
    const text = lastMessage && isText(lastMessage) ? getMessageText(lastMessage) : null;
    return {
      conversationId: conv.id,
      peerInboxId,
      peerAddress,
      lastMessageText: text,
      lastMessageSenderInboxId: lastMessage?.senderInboxId ?? null,
      lastMessageSentAtNs: lastMessage?.sentAtNs ?? 0n,
      createdAtNs: conv.createdAtNs ?? 0n,
    };
  } catch (err) {
    console.warn("[xmtp] summarizeDm failed:", err);
    return null;
  }
}

export async function listAllDms(client: Client): Promise<DmSummary[]> {
  await client.conversations.sync();
  const convos = await client.conversations.listDms();
  const summaries = await Promise.all(convos.map((c) => summarizeDm(c, client)));
  return summaries.filter((s): s is DmSummary => s !== null);
}

export async function fetchInboxIdForAddress(
  client: Client,
  address: `0x${string}`,
): Promise<string | null> {
  const inboxId = await client.fetchInboxIdByIdentifier({
    identifier: address.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum,
  });
  return inboxId ?? null;
}

/**
 * Returns the existing DM with `peerAddress` or creates one. Returns null if
 * the peer has no XMTP inbox (never used XMTP).
 *
 * Calls `conversations.sync()` before checking for an existing DM so we
 * don't accidentally create a duplicate conversation when the peer
 * already created one and sent a message that's waiting on the network.
 */
export async function openOrCreateDm(
  client: Client,
  peerAddress: `0x${string}`,
): Promise<Dm | null> {
  const inboxId = await fetchInboxIdForAddress(client, peerAddress);
  if (!inboxId) return null;
  await client.conversations.sync();
  const existing = await client.conversations.getDmByInboxId(inboxId);
  if (existing) return existing;
  return client.conversations.createDm(inboxId);
}

export async function loadThreadMessages(
  conv: Dm,
  myInboxId: string,
): Promise<ThreadMessage[]> {
  await conv.sync();
  const raw = await conv.messages({});
  const out: ThreadMessage[] = [];
  for (const m of raw) {
    if (!isText(m)) continue;
    out.push({
      id: m.id,
      text: getMessageText(m),
      sentAtNs: m.sentAtNs ?? 0n,
      senderInboxId: m.senderInboxId,
      mine: m.senderInboxId === myInboxId,
    });
  }
  // Conversation.messages returns newest-first in some SDK versions; sort
  // explicitly so we don't depend on that.
  out.sort((a, b) => (a.sentAtNs < b.sentAtNs ? -1 : 1));
  return out;
}

/**
 * Send a text message and pull it (and anything else newly published) back
 * into the conversation's local state.
 *
 * Matches the reference's handleSend → sync pattern: `sendText` writes
 * locally + publishes to network, but the per-conversation stream observes
 * the network, so the sender's own message can lag a few hundred ms before
 * it appears via the stream. A post-send `sync` populates it immediately.
 */
export async function sendText(conv: Dm, text: string): Promise<void> {
  await conv.sync();
  await conv.sendText(text);
  await conv.sync();
}

/**
 * Subscribe to new DM conversations + every incoming message. Cleanup
 * returns a function that ends both streams. No consent filter — the
 * reference repo accepts all consent states and lets the UI decide,
 * which matches our hop-based gate semantics.
 */
export async function streamAllDmUpdates(
  client: Client,
  onConvChange: (summary: DmSummary) => void,
  onMessage: (message: DecodedMessage) => void,
): Promise<() => void> {
  const convStream = await client.conversations.streamDms({
    onValue: async (dm) => {
      console.debug("[xmtp] streamDms fired:", dm?.id);
      const s = await summarizeDm(dm, client);
      if (s) onConvChange(s);
    },
    onError: (e) => console.warn("[xmtp] streamDms error:", e),
  });

  const msgStream = await client.conversations.streamAllMessages({
    onValue: (msg) => {
      console.debug(
        "[xmtp] streamAllMessages fired:",
        msg?.id,
        "conv:",
        msg?.conversationId,
        "ct:",
        msg?.contentType,
      );
      onMessage(msg);
    },
    onError: (e) => console.warn("[xmtp] streamAllMessages error:", e),
  });

  return () => {
    void convStream.end();
    void msgStream.end();
  };
}

/** Stream just the messages of one open conversation. */
export async function streamThread(
  conv: Dm,
  onMessage: (message: DecodedMessage) => void,
): Promise<() => void> {
  console.debug("[xmtp] streamThread mount, conv:", conv.id);
  const stream = await conv.stream({
    onValue: (m) => {
      console.debug(
        "[xmtp] streamThread fired:",
        m?.id,
        "ct:",
        m?.contentType,
      );
      onMessage(m);
    },
    onError: (e) => console.warn("[xmtp] streamThread error:", e),
  });
  return () => {
    void stream.end();
  };
}

/** Pull the latest messages for a conversation from the network. */
export async function syncConv(conv: Dm): Promise<void> {
  await conv.sync();
}

export { isText as isTextMessage };

/* ---------- Inbox-filter rescue set ----------------------------------- */

/**
 * Conversations the user has actively engaged with — once you reply to a
 * first-contact DM, it leaves the "Filtered" fold permanently for that
 * device, even if the peer is technically outside your current hop range.
 * Stored per-inbox so resetting XMTP state wipes it.
 */
function rescuedKey(myInboxId: string): string {
  return `xmtp-rescued-${myInboxId}`;
}

export function loadRescuedConversations(myInboxId: string): Set<string> {
  try {
    const raw = localStorage.getItem(rescuedKey(myInboxId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function markConversationRescued(
  myInboxId: string,
  conversationId: string,
): void {
  try {
    const key = rescuedKey(myInboxId);
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    if (!arr.includes(conversationId)) {
      arr.push(conversationId);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch {
    /* ignore — localStorage may be unavailable in some hosts */
  }
}
