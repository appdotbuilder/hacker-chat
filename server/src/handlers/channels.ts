import { db } from '../db';
import { chatChannelsTable, channelMembersTable, usersTable } from '../db/schema';
import { type CreateChannelInput, type ChatChannel, type ChannelWithMembers, type JoinChannelInput, type PublicUser } from '../schema';
import { eq, and, count, desc, ne, asc, sql, SQL } from 'drizzle-orm';

export async function createChannel(input: CreateChannelInput, creatorUserId: number): Promise<ChatChannel> {
  try {
    // Verify creator user exists
    const creator = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, creatorUserId))
      .execute();

    if (creator.length === 0) {
      throw new Error('Creator user not found');
    }

    // Create channel
    const channelResult = await db.insert(chatChannelsTable)
      .values({
        name: input.name,
        description: input.description || null,
        is_private: input.is_private,
        created_by: creatorUserId
      })
      .returning()
      .execute();

    const newChannel = channelResult[0];

    // Add creator as owner in channel members
    await db.insert(channelMembersTable)
      .values({
        channel_id: newChannel.id,
        user_id: creatorUserId,
        role: 'owner'
      })
      .execute();

    // If private channel and member_user_ids provided, add those members
    if (input.is_private && input.member_user_ids && input.member_user_ids.length > 0) {
      // Verify all member users exist
      const validMemberIds: number[] = [];
      
      for (const userId of input.member_user_ids) {
        if (userId !== creatorUserId) {
          const userExists = await db.select()
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .execute();
          
          if (userExists.length > 0) {
            validMemberIds.push(userId);
          }
        }
      }

      if (validMemberIds.length > 0) {
        const memberInserts = validMemberIds.map(userId => ({
          channel_id: newChannel.id,
          user_id: userId,
          role: 'member' as const
        }));

        await db.insert(channelMembersTable)
          .values(memberInserts)
          .execute();
      }
    }

    return newChannel;
  } catch (error) {
    console.error('Channel creation failed:', error);
    throw error;
  }
}

export async function getPublicChannels(): Promise<ChannelWithMembers[]> {
  try {
    // Get all public channels with member count
    const channelsWithCounts = await db.select({
      id: chatChannelsTable.id,
      name: chatChannelsTable.name,
      description: chatChannelsTable.description,
      is_private: chatChannelsTable.is_private,
      created_by: chatChannelsTable.created_by,
      created_at: chatChannelsTable.created_at,
      updated_at: chatChannelsTable.updated_at,
      member_count: count(channelMembersTable.id)
    })
      .from(chatChannelsTable)
      .leftJoin(channelMembersTable, eq(chatChannelsTable.id, channelMembersTable.channel_id))
      .where(eq(chatChannelsTable.is_private, false))
      .groupBy(
        chatChannelsTable.id,
        chatChannelsTable.name,
        chatChannelsTable.description,
        chatChannelsTable.is_private,
        chatChannelsTable.created_by,
        chatChannelsTable.created_at,
        chatChannelsTable.updated_at
      )
      .orderBy(desc(chatChannelsTable.created_at))
      .execute();

    // Get sample members for each channel (up to 5 members)
    const channelsWithMembers: ChannelWithMembers[] = [];
    
    for (const channel of channelsWithCounts) {
      const members = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        avatar_url: usersTable.avatar_url,
        is_online: usersTable.is_online,
        last_seen: usersTable.last_seen
      })
        .from(channelMembersTable)
        .innerJoin(usersTable, eq(channelMembersTable.user_id, usersTable.id))
        .where(eq(channelMembersTable.channel_id, channel.id))
        .limit(5)
        .execute();

      channelsWithMembers.push({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        is_private: channel.is_private,
        created_by: channel.created_by,
        created_at: channel.created_at,
        updated_at: channel.updated_at,
        members: members as PublicUser[],
        member_count: Number(channel.member_count)
      });
    }

    return channelsWithMembers;
  } catch (error) {
    console.error('Failed to get public channels:', error);
    throw error;
  }
}

export async function getUserChannels(userId: number): Promise<ChannelWithMembers[]> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Get channels where user is a member
    const userChannels = await db.select({
      id: chatChannelsTable.id,
      name: chatChannelsTable.name,
      description: chatChannelsTable.description,
      is_private: chatChannelsTable.is_private,
      created_by: chatChannelsTable.created_by,
      created_at: chatChannelsTable.created_at,
      updated_at: chatChannelsTable.updated_at
    })
      .from(chatChannelsTable)
      .innerJoin(channelMembersTable, eq(chatChannelsTable.id, channelMembersTable.channel_id))
      .where(eq(channelMembersTable.user_id, userId))
      .orderBy(desc(chatChannelsTable.updated_at))
      .execute();

    // Get member counts for each channel
    const channelsWithCounts = [];
    for (const channel of userChannels) {
      const memberCountResult = await db.select({
        count: count(channelMembersTable.id)
      })
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, channel.id))
        .execute();

      channelsWithCounts.push({
        ...channel,
        member_count: Number(memberCountResult[0].count)
      });
    }

    // Get sample members for each channel
    const channelsWithMembers: ChannelWithMembers[] = [];
    
    for (const channel of channelsWithCounts) {
      const members = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        avatar_url: usersTable.avatar_url,
        is_online: usersTable.is_online,
        last_seen: usersTable.last_seen
      })
        .from(channelMembersTable)
        .innerJoin(usersTable, eq(channelMembersTable.user_id, usersTable.id))
        .where(eq(channelMembersTable.channel_id, channel.id))
        .limit(5)
        .execute();

      channelsWithMembers.push({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        is_private: channel.is_private,
        created_by: channel.created_by,
        created_at: channel.created_at,
        updated_at: channel.updated_at,
        members: members as PublicUser[],
        member_count: Number(channel.member_count)
      });
    }

    return channelsWithMembers;
  } catch (error) {
    console.error('Failed to get user channels:', error);
    throw error;
  }
}

export async function joinChannel(input: JoinChannelInput, userId: number): Promise<{ success: boolean; message: string }> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Check if channel exists and is public
    const channel = await db.select()
      .from(chatChannelsTable)
      .where(eq(chatChannelsTable.id, input.channel_id))
      .execute();

    if (channel.length === 0) {
      return {
        success: false,
        message: 'Channel not found'
      };
    }

    if (channel[0].is_private) {
      return {
        success: false,
        message: 'Cannot join private channel without invitation'
      };
    }

    // Check if user is already a member
    const existingMembership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, input.channel_id),
        eq(channelMembersTable.user_id, userId)
      ))
      .execute();

    if (existingMembership.length > 0) {
      return {
        success: false,
        message: 'Already a member of this channel'
      };
    }

    // Add user to channel
    await db.insert(channelMembersTable)
      .values({
        channel_id: input.channel_id,
        user_id: userId,
        role: 'member'
      })
      .execute();

    return {
      success: true,
      message: 'Successfully joined channel'
    };
  } catch (error) {
    console.error('Failed to join channel:', error);
    throw error;
  }
}

export async function leaveChannel(channelId: number, userId: number): Promise<{ success: boolean; message: string }> {
  try {
    // Check if user is a member of the channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channelId),
        eq(channelMembersTable.user_id, userId)
      ))
      .execute();

    if (membership.length === 0) {
      return {
        success: false,
        message: 'Not a member of this channel'
      };
    }

    const userRole = membership[0].role;

    // If user is the owner, check if there are other members
    if (userRole === 'owner') {
      const allMembers = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, channelId))
        .execute();

      if (allMembers.length > 1) {
        // Transfer ownership to the oldest admin, or oldest member if no admins
        const nextOwner = await db.select()
          .from(channelMembersTable)
          .where(and(
            eq(channelMembersTable.channel_id, channelId),
            ne(channelMembersTable.user_id, userId)
          ))
          .orderBy(channelMembersTable.role, channelMembersTable.joined_at)
          .limit(1)
          .execute();

        if (nextOwner.length > 0) {
          await db.update(channelMembersTable)
            .set({ role: 'owner' })
            .where(eq(channelMembersTable.id, nextOwner[0].id))
            .execute();
        }
      }
      // If owner is the only member, the channel will effectively become inaccessible
    }

    // Remove user from channel
    await db.delete(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channelId),
        eq(channelMembersTable.user_id, userId)
      ))
      .execute();

    return {
      success: true,
      message: 'Successfully left channel'
    };
  } catch (error) {
    console.error('Failed to leave channel:', error);
    throw error;
  }
}

export async function getChannelMembers(channelId: number, userId: number): Promise<{ id: number; username: string; avatar_url: string | null; is_online: boolean; role: string }[]> {
  try {
    // Verify user has access to the channel (must be a member)
    const userMembership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channelId),
        eq(channelMembersTable.user_id, userId)
      ))
      .execute();

    if (userMembership.length === 0) {
      throw new Error('Access denied: Not a member of this channel');
    }

    // Get all members of the channel with their roles
    const members = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      avatar_url: usersTable.avatar_url,
      is_online: usersTable.is_online,
      role: channelMembersTable.role
    })
      .from(channelMembersTable)
      .innerJoin(usersTable, eq(channelMembersTable.user_id, usersTable.id))
      .where(eq(channelMembersTable.channel_id, channelId))
      .orderBy(
        // Custom ordering: owner first, then admin, then member
        sql`CASE ${channelMembersTable.role} WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 END`,
        asc(usersTable.username)
      )
      .execute();

    return members;
  } catch (error) {
    console.error('Failed to get channel members:', error);
    throw error;
  }
}