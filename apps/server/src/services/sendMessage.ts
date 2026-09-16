import type { MessageSendPayload } from '@nestwork/shared';

export interface SendMessageDependencies<TAccess, TMessage extends { id: string }> {
  authorize: (channelId: string, userId: string) => Promise<TAccess | null>;
  storeImage: (image: string | undefined) => Promise<string | null>;
  createMessage: (data: {
    channelId: string;
    userId: string;
    body: string;
    imageUrl: string | null;
  }) => Promise<TMessage>;
  publish: (access: TAccess, message: TMessage) => void;
}

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendAuthorizedMessage<TAccess, TMessage extends { id: string }>(
  userId: string,
  payload: MessageSendPayload,
  dependencies: SendMessageDependencies<TAccess, TMessage>,
): Promise<SendMessageResult> {
  const channelId = (payload?.channelId ?? '').toString();
  const body = (payload?.body ?? '').toString().trim().slice(0, 4000);
  if (!channelId) return { ok: false, error: 'Canal invalide.' };

  // Deliberately authorize before decoding, hashing or persisting client bytes.
  const access = await dependencies.authorize(channelId, userId);
  if (!access) return { ok: false, error: 'Canal introuvable.' };

  const imageUrl = await dependencies.storeImage(payload?.image);
  if (!body && !imageUrl) return { ok: false, error: 'Message vide ou image invalide.' };

  const message = await dependencies.createMessage({ channelId, userId, body, imageUrl });
  dependencies.publish(access, message);
  return { ok: true, messageId: message.id };
}
