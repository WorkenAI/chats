import { send } from "@vercel/queue";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const order = await request.json();
  const { messageId } = await send("orders", order);
  return NextResponse.json({ messageId });
}
