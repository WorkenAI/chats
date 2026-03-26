import { handleCallback } from "@vercel/queue";

export const POST = handleCallback(async (order, metadata) => {
  console.log("Fulfilling order", metadata.messageId, order);
});
