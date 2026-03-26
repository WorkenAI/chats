/**
 * Optional `UIMessage.metadata` for user turns so workflows can enrich model input.
 */
export type AgentUserMessageMetadata = {
  /** External/provider message id for this user turn (channel threading) */
  externalMessageId?: string;
  /** External message id the user’s message replies to (threading) */
  replyToExternalMessageId?: string;
  /** Web chat: client message id the user is replying to */
  replyToMessageId?: string;
};
