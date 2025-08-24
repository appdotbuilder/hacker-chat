import { db } from '../db';
import { chatMessagesTable, channelMembersTable, usersTable, chatChannelsTable } from '../db/schema';
import { type SendMessageInput, type GetMessagesInput, type UpdateMessageInput, type MessageWithUser } from '../schema';
import { eq, and, desc, SQL } from 'drizzle-orm';

export async function sendMessage(input: SendMessageInput, userId: number): Promise<MessageWithUser> {
  try {
    // 1. Verify user is a member of the channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, input.channel_id),
        eq(channelMembersTable.user_id, userId)
      ))
      .limit(1)
      .execute();

    if (membership.length === 0) {
      throw new Error('User is not a member of this channel');
    }

    // 2. Process link preview if message is of type 'link'
    let linkPreviewData = null;
    if (input.message_type === 'link') {
      // Extract URLs from content for link preview
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = input.content.match(urlRegex);
      if (urls && urls.length > 0) {
        try {
          const preview = await unfurlLink(urls[0]);
          linkPreviewData = JSON.stringify(preview);
        } catch (error) {
          console.error('Link unfurling failed:', error);
          // Continue without link preview if unfurling fails
        }
      }
    }

    // 3. If replying to a message, verify the parent message exists in the same channel
    if (input.reply_to_message_id) {
      const parentMessage = await db.select()
        .from(chatMessagesTable)
        .where(and(
          eq(chatMessagesTable.id, input.reply_to_message_id),
          eq(chatMessagesTable.channel_id, input.channel_id)
        ))
        .limit(1)
        .execute();

      if (parentMessage.length === 0) {
        throw new Error('Reply target message not found in this channel');
      }
    }

    // 4. Save message to database
    const messageResult = await db.insert(chatMessagesTable)
      .values({
        channel_id: input.channel_id,
        user_id: userId,
        content: input.content,
        message_type: input.message_type || 'text',
        image_url: input.image_url || null,
        link_preview: linkPreviewData,
        reply_to_message_id: input.reply_to_message_id || null,
        is_edited: false
      })
      .returning()
      .execute();

    const message = messageResult[0];

    // 5. Get user information for the response
    const userResult = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      avatar_url: usersTable.avatar_url,
      is_online: usersTable.is_online,
      last_seen: usersTable.last_seen
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .execute();

    const user = userResult[0];

    // 6. Return message with user information
    return {
      ...message,
      link_preview: message.link_preview ? JSON.parse(message.link_preview) : null,
      user: user
    };
  } catch (error) {
    console.error('Message sending failed:', error);
    throw error;
  }
}

export async function getMessages(input: GetMessagesInput, userId: number): Promise<MessageWithUser[]> {
  try {
    // 1. Verify user has access to the channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, input.channel_id),
        eq(channelMembersTable.user_id, userId)
      ))
      .limit(1)
      .execute();

    if (membership.length === 0) {
      throw new Error('User does not have access to this channel');
    }

    // 2. Fetch messages with pagination and user information
    const results = await db.select({
      // Message fields
      id: chatMessagesTable.id,
      channel_id: chatMessagesTable.channel_id,
      user_id: chatMessagesTable.user_id,
      content: chatMessagesTable.content,
      message_type: chatMessagesTable.message_type,
      image_url: chatMessagesTable.image_url,
      link_preview: chatMessagesTable.link_preview,
      reply_to_message_id: chatMessagesTable.reply_to_message_id,
      is_edited: chatMessagesTable.is_edited,
      created_at: chatMessagesTable.created_at,
      updated_at: chatMessagesTable.updated_at,
      // User fields
      user_id_field: usersTable.id,
      username: usersTable.username,
      avatar_url: usersTable.avatar_url,
      is_online: usersTable.is_online,
      last_seen: usersTable.last_seen
    })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.user_id, usersTable.id))
      .where(eq(chatMessagesTable.channel_id, input.channel_id))
      .orderBy(desc(chatMessagesTable.created_at))
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    // 3. Transform results to MessageWithUser format
    return results.map(result => ({
      id: result.id,
      channel_id: result.channel_id,
      user_id: result.user_id,
      content: result.content,
      message_type: result.message_type,
      image_url: result.image_url,
      link_preview: result.link_preview ? JSON.parse(result.link_preview) : null,
      reply_to_message_id: result.reply_to_message_id,
      is_edited: result.is_edited,
      created_at: result.created_at,
      updated_at: result.updated_at,
      user: {
        id: result.user_id_field,
        username: result.username,
        avatar_url: result.avatar_url,
        is_online: result.is_online,
        last_seen: result.last_seen
      }
    }));
  } catch (error) {
    console.error('Message fetching failed:', error);
    throw error;
  }
}

export async function updateMessage(input: UpdateMessageInput, userId: number): Promise<MessageWithUser> {
  try {
    // 1. Verify user owns the message
    const existingMessage = await db.select()
      .from(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.id, input.message_id),
        eq(chatMessagesTable.user_id, userId)
      ))
      .limit(1)
      .execute();

    if (existingMessage.length === 0) {
      throw new Error('Message not found or user does not have permission to edit');
    }

    // 2. Update message content and set edited flag
    const updateResult = await db.update(chatMessagesTable)
      .set({
        content: input.content,
        is_edited: true,
        updated_at: new Date()
      })
      .where(eq(chatMessagesTable.id, input.message_id))
      .returning()
      .execute();

    const message = updateResult[0];

    // 3. Get user information for the response
    const userResult = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      avatar_url: usersTable.avatar_url,
      is_online: usersTable.is_online,
      last_seen: usersTable.last_seen
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .execute();

    const user = userResult[0];

    // 4. Return updated message with user information
    return {
      ...message,
      link_preview: message.link_preview ? JSON.parse(message.link_preview) : null,
      user: user
    };
  } catch (error) {
    console.error('Message update failed:', error);
    throw error;
  }
}

export async function deleteMessage(messageId: number, userId: number): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Verify user owns the message or has admin privileges in the channel
    const messageResult = await db.select({
      message_user_id: chatMessagesTable.user_id,
      channel_id: chatMessagesTable.channel_id
    })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.id, messageId))
      .limit(1)
      .execute();

    if (messageResult.length === 0) {
      throw new Error('Message not found');
    }

    const messageData = messageResult[0];
    let canDelete = messageData.message_user_id === userId;

    // If user doesn't own the message, check if they have admin privileges
    if (!canDelete) {
      const membershipResult = await db.select()
        .from(channelMembersTable)
        .where(and(
          eq(channelMembersTable.channel_id, messageData.channel_id),
          eq(channelMembersTable.user_id, userId)
        ))
        .limit(1)
        .execute();

      if (membershipResult.length > 0) {
        const membership = membershipResult[0];
        canDelete = membership.role === 'admin' || membership.role === 'owner';
      }
    }

    if (!canDelete) {
      throw new Error('User does not have permission to delete this message');
    }

    // 2. Delete message from database
    await db.delete(chatMessagesTable)
      .where(eq(chatMessagesTable.id, messageId))
      .execute();

    return {
      success: true,
      message: 'Message deleted successfully'
    };
  } catch (error) {
    console.error('Message deletion failed:', error);
    throw error;
  }
}

export async function unfurlLink(url: string): Promise<{ title: string | null; description: string | null; image: string | null; url: string }> {
  try {
    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Invalid URL format');
    }

    // Fetch the webpage
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChatApp/1.0; Link Preview Bot)'
      },
      // Set timeout to avoid hanging requests
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract Open Graph and standard meta tags
    let title = null;
    let description = null;
    let image = null;

    // Extract title (Open Graph first, then standard title)
    const ogTitleMatch = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1];
    } else {
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    }

    // Extract description (Open Graph first, then standard meta description)
    const ogDescMatch = html.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
    if (ogDescMatch) {
      description = ogDescMatch[1];
    } else {
      const descMatch = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      if (descMatch) {
        description = descMatch[1];
      }
    }

    // Extract image (Open Graph)
    const ogImageMatch = html.match(/<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
    if (ogImageMatch) {
      let imageUrl = ogImageMatch[1];
      // Handle relative URLs
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
      }
      image = imageUrl;
    }

    return {
      title: title || null,
      description: description || null,
      image: image || null,
      url: url
    };
  } catch (error) {
    console.error('Link unfurling failed:', error);
    // Return basic URL info if unfurling fails
    return {
      title: null,
      description: null,
      image: null,
      url: url
    };
  }
}