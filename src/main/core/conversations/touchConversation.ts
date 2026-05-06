import { eq, sql } from 'drizzle-orm';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';

export async function touchConversation(conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ lastInteractedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(conversations.id, conversationId));
}
