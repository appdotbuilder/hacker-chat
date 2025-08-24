import { db } from '../db';
import { chatChannelsTable, channelMembersTable, chatMessagesTable, usersTable } from '../db/schema';
import { type ChatChannel, type PublicUser } from '../schema';
import { eq, and, or, desc, ne, SQL } from 'drizzle-orm';

export async function createPrivateChat(userId: number, otherUserId: number): Promise<ChatChannel> {
  try {
    // Check if private chat already exists between these two users
    const existingChat = await db.select({
      channel: chatChannelsTable
    })
    .from(chatChannelsTable)
    .innerJoin(
      channelMembersTable, 
      eq(chatChannelsTable.id, channelMembersTable.channel_id)
    )
    .where(
      and(
        eq(chatChannelsTable.is_private, true),
        or(
          eq(channelMembersTable.user_id, userId),
          eq(channelMembersTable.user_id, otherUserId)
        )
      )
    )
    .execute();

    // Group by channel and check if both users are members
    const channelCounts = new Map<number, Set<number>>();
    existingChat.forEach(result => {
      const channelId = result.channel.id;
      if (!channelCounts.has(channelId)) {
        channelCounts.set(channelId, new Set());
      }
      // Get the user_id from the members table by querying again
    });

    // Find existing private chat with both users
    for (const result of existingChat) {
      const channelId = result.channel.id;
      const members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, channelId))
        .execute();

      const memberIds = new Set(members.map(m => m.user_id));
      if (memberIds.has(userId) && memberIds.has(otherUserId) && memberIds.size === 2) {
        return result.channel;
      }
    }

    // Create new private channel if none exists
    const newChannelResult = await db.insert(chatChannelsTable)
      .values({
        name: '', // Private chats typically don't have names
        description: null,
        is_private: true,
        created_by: userId
      })
      .returning()
      .execute();

    const newChannel = newChannelResult[0];

    // Add both users as members
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: newChannel.id,
          user_id: userId,
          role: 'owner'
        },
        {
          channel_id: newChannel.id,
          user_id: otherUserId,
          role: 'member'
        }
      ])
      .execute();

    return newChannel;
  } catch (error) {
    console.error('Private chat creation failed:', error);
    throw error;
  }
}

export async function getPrivateChats(userId: number): Promise<Array<ChatChannel & { otherUser: PublicUser; lastMessage?: { content: string; created_at: Date } }>> {
  try {
    // Get all private channels where user is a member
    const privateChannels = await db.select({
      channel: chatChannelsTable,
      member: channelMembersTable
    })
    .from(chatChannelsTable)
    .innerJoin(
      channelMembersTable,
      eq(chatChannelsTable.id, channelMembersTable.channel_id)
    )
    .where(
      and(
        eq(chatChannelsTable.is_private, true),
        eq(channelMembersTable.user_id, userId)
      )
    )
    .execute();

    const result = [];

    for (const { channel } of privateChannels) {
      // Get the other user in this private chat
      const otherMembers = await db.select({
        user: usersTable,
        member: channelMembersTable
      })
      .from(channelMembersTable)
      .innerJoin(usersTable, eq(channelMembersTable.user_id, usersTable.id))
      .where(
        and(
          eq(channelMembersTable.channel_id, channel.id),
          ne(channelMembersTable.user_id, userId)
        )
      )
      .execute();

      // Skip if no other user found (shouldn't happen in valid private chats)
      if (otherMembers.length === 0) continue;

      const otherUser: PublicUser = {
        id: otherMembers[0].user.id,
        username: otherMembers[0].user.username,
        avatar_url: otherMembers[0].user.avatar_url,
        is_online: otherMembers[0].user.is_online,
        last_seen: otherMembers[0].user.last_seen
      };

      // Get the last message from this chat
      const lastMessages = await db.select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.channel_id, channel.id))
        .orderBy(desc(chatMessagesTable.created_at))
        .limit(1)
        .execute();

      const lastMessage = lastMessages.length > 0 
        ? {
            content: lastMessages[0].content,
            created_at: lastMessages[0].created_at
          }
        : undefined;

      result.push({
        ...channel,
        otherUser,
        lastMessage
      });
    }

    // Sort by most recent activity (last message or channel creation)
    return result.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.created_at;
      const bTime = b.lastMessage?.created_at || b.created_at;
      return bTime.getTime() - aTime.getTime();
    });
  } catch (error) {
    console.error('Failed to get private chats:', error);
    throw error;
  }
}

export async function getPrivateChatUsers(channelId: number, currentUserId: number): Promise<PublicUser[]> {
  try {
    // Verify the channel is private and user has access
    const channelAccess = await db.select()
      .from(chatChannelsTable)
      .innerJoin(
        channelMembersTable,
        eq(chatChannelsTable.id, channelMembersTable.channel_id)
      )
      .where(
        and(
          eq(chatChannelsTable.id, channelId),
          eq(chatChannelsTable.is_private, true),
          eq(channelMembersTable.user_id, currentUserId)
        )
      )
      .limit(1)
      .execute();

    if (channelAccess.length === 0) {
      throw new Error('Channel not found or access denied');
    }

    // Fetch all users in the private chat excluding current user
    const chatUsers = await db.select({
      user: usersTable
    })
    .from(channelMembersTable)
    .innerJoin(usersTable, eq(channelMembersTable.user_id, usersTable.id))
    .where(
      and(
        eq(channelMembersTable.channel_id, channelId),
        ne(channelMembersTable.user_id, currentUserId)
      )
    )
    .execute();

    return chatUsers.map(({ user }) => ({
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      is_online: user.is_online,
      last_seen: user.last_seen
    }));
  } catch (error) {
    console.error('Failed to get private chat users:', error);
    throw error;
  }
}

export async function addUserToPrivateChat(channelId: number, userId: number, targetUserId: number): Promise<{ success: boolean; message: string }> {
  try {
    // Verify user has permission to add others (is owner/admin)
    const userPermission = await db.select()
      .from(channelMembersTable)
      .innerJoin(chatChannelsTable, eq(channelMembersTable.channel_id, chatChannelsTable.id))
      .where(
        and(
          eq(channelMembersTable.channel_id, channelId),
          eq(channelMembersTable.user_id, userId),
          eq(chatChannelsTable.is_private, true),
          or(
            eq(channelMembersTable.role, 'owner'),
            eq(channelMembersTable.role, 'admin')
          )
        )
      )
      .limit(1)
      .execute();

    if (userPermission.length === 0) {
      return {
        success: false,
        message: 'You do not have permission to add users to this chat'
      };
    }

    // Verify target user is not already in the chat
    const existingMembership = await db.select()
      .from(channelMembersTable)
      .where(
        and(
          eq(channelMembersTable.channel_id, channelId),
          eq(channelMembersTable.user_id, targetUserId)
        )
      )
      .limit(1)
      .execute();

    if (existingMembership.length > 0) {
      return {
        success: false,
        message: 'User is already a member of this chat'
      };
    }

    // Verify target user exists
    const targetUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1)
      .execute();

    if (targetUser.length === 0) {
      return {
        success: false,
        message: 'Target user not found'
      };
    }

    // Add target user to channel_members table
    await db.insert(channelMembersTable)
      .values({
        channel_id: channelId,
        user_id: targetUserId,
        role: 'member'
      })
      .execute();

    return {
      success: true,
      message: 'User added to private chat successfully'
    };
  } catch (error) {
    console.error('Failed to add user to private chat:', error);
    return {
      success: false,
      message: 'Failed to add user to chat'
    };
  }
}