import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatChannelsTable, chatMessagesTable, channelMembersTable } from '../db/schema';
import { type SendMessageInput, type GetMessagesInput, type UpdateMessageInput } from '../schema';
import { sendMessage, getMessages, updateMessage, deleteMessage, unfurlLink } from '../handlers/messages';
import { eq, and } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password_hash: 'hashedpassword',
  is_online: true
};

const testUser2 = {
  username: 'testuser2',
  email: 'test2@example.com',
  password_hash: 'hashedpassword2',
  is_online: false
};

const testChannel = {
  name: 'Test Channel',
  description: 'A channel for testing',
  is_private: false,
  created_by: 1
};

describe('Message Handlers', () => {
  let userId: number;
  let userId2: number;
  let channelId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test users
    const userResults = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();
    
    userId = userResults[0].id;
    userId2 = userResults[1].id;

    // Create test channel
    const channelResult = await db.insert(chatChannelsTable)
      .values({ ...testChannel, created_by: userId })
      .returning()
      .execute();
    
    channelId = channelResult[0].id;

    // Add both users as members of the channel
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: channelId,
          user_id: userId,
          role: 'owner'
        },
        {
          channel_id: channelId,
          user_id: userId2,
          role: 'member'
        }
      ])
      .execute();
  });

  afterEach(resetDB);

  describe('sendMessage', () => {
    it('should send a text message successfully', async () => {
      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Hello, world!',
        message_type: 'text'
      };

      const result = await sendMessage(input, userId);

      expect(result.channel_id).toBe(channelId);
      expect(result.user_id).toBe(userId);
      expect(result.content).toBe('Hello, world!');
      expect(result.message_type).toBe('text');
      expect(result.image_url).toBe(null);
      expect(result.link_preview).toBe(null);
      expect(result.reply_to_message_id).toBe(null);
      expect(result.is_edited).toBe(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify user information is included
      expect(result.user.id).toBe(userId);
      expect(result.user.username).toBe('testuser');
      expect(result.user.is_online).toBe(true);
    });

    it('should send an image message successfully', async () => {
      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Check out this image!',
        message_type: 'image',
        image_url: 'https://example.com/image.jpg'
      };

      const result = await sendMessage(input, userId);

      expect(result.message_type).toBe('image');
      expect(result.image_url).toBe('https://example.com/image.jpg');
    });

    it('should send a link message with preview data', async () => {
      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Check this out: https://example.com',
        message_type: 'link'
      };

      const result = await sendMessage(input, userId);

      expect(result.message_type).toBe('link');
      expect(result.link_preview).toBeDefined();
      expect(result.link_preview?.url).toBe('https://example.com');
    });

    it('should save message to database', async () => {
      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Database test message',
        message_type: 'text'
      };

      const result = await sendMessage(input, userId);

      // Verify message was saved to database
      const savedMessages = await db.select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, result.id))
        .execute();

      expect(savedMessages).toHaveLength(1);
      expect(savedMessages[0].content).toBe('Database test message');
      expect(savedMessages[0].channel_id).toBe(channelId);
      expect(savedMessages[0].user_id).toBe(userId);
    });

    it('should handle reply to message', async () => {
      // First, create a parent message
      const parentInput: SendMessageInput = {
        channel_id: channelId,
        content: 'Parent message',
        message_type: 'text'
      };
      const parentMessage = await sendMessage(parentInput, userId);

      // Now reply to it
      const replyInput: SendMessageInput = {
        channel_id: channelId,
        content: 'This is a reply',
        message_type: 'text',
        reply_to_message_id: parentMessage.id
      };

      const result = await sendMessage(replyInput, userId);

      expect(result.reply_to_message_id).toBe(parentMessage.id);
    });

    it('should reject message from non-member', async () => {
      // Create a user who is not a member of the channel
      const nonMemberResult = await db.insert(usersTable)
        .values({
          username: 'nonmember',
          email: 'nonmember@example.com',
          password_hash: 'hash',
          is_online: false
        })
        .returning()
        .execute();

      const nonMemberId = nonMemberResult[0].id;

      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Unauthorized message',
        message_type: 'text'
      };

      await expect(sendMessage(input, nonMemberId)).rejects.toThrow(/not a member/i);
    });

    it('should reject reply to non-existent message', async () => {
      const input: SendMessageInput = {
        channel_id: channelId,
        content: 'Reply to nothing',
        message_type: 'text',
        reply_to_message_id: 99999
      };

      await expect(sendMessage(input, userId)).rejects.toThrow(/reply target message not found/i);
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      // Create some test messages
      const messages = [
        { content: 'Message 1', user_id: userId },
        { content: 'Message 2', user_id: userId2 },
        { content: 'Message 3', user_id: userId },
        { content: 'Message 4', user_id: userId2 },
        { content: 'Message 5', user_id: userId }
      ];

      for (const msg of messages) {
        await db.insert(chatMessagesTable)
          .values({
            channel_id: channelId,
            content: msg.content,
            user_id: msg.user_id,
            message_type: 'text'
          })
          .execute();
      }
    });

    it('should get messages with default pagination', async () => {
      const input: GetMessagesInput = {
        channel_id: channelId,
        limit: 50,
        offset: 0
      };

      const result = await getMessages(input, userId);

      expect(result).toHaveLength(5);
      // Messages should be ordered by created_at desc (most recent first)
      expect(result[0].content).toBe('Message 5');
      expect(result[4].content).toBe('Message 1');

      // Check that user information is included
      result.forEach(message => {
        expect(message.user).toBeDefined();
        expect(message.user.id).toBeDefined();
        expect(message.user.username).toBeDefined();
        expect(typeof message.user.is_online).toBe('boolean');
      });
    });

    it('should respect pagination limits', async () => {
      const input: GetMessagesInput = {
        channel_id: channelId,
        limit: 2,
        offset: 1
      };

      const result = await getMessages(input, userId);

      expect(result).toHaveLength(2);
      // Should skip the first message and get the next 2
      expect(result[0].content).toBe('Message 4');
      expect(result[1].content).toBe('Message 3');
    });

    it('should reject access for non-members', async () => {
      // Create a user who is not a member of the channel
      const nonMemberResult = await db.insert(usersTable)
        .values({
          username: 'nonmember',
          email: 'nonmember@example.com',
          password_hash: 'hash',
          is_online: false
        })
        .returning()
        .execute();

      const nonMemberId = nonMemberResult[0].id;

      const input: GetMessagesInput = {
        channel_id: channelId,
        limit: 50,
        offset: 0
      };

      await expect(getMessages(input, nonMemberId)).rejects.toThrow(/does not have access/i);
    });

    it('should return empty array for channel with no messages', async () => {
      // Create a new channel with no messages
      const emptyChannelResult = await db.insert(chatChannelsTable)
        .values({
          name: 'Empty Channel',
          description: 'No messages here',
          is_private: false,
          created_by: userId
        })
        .returning()
        .execute();

      const emptyChannelId = emptyChannelResult[0].id;

      // Add user as member
      await db.insert(channelMembersTable)
        .values({
          channel_id: emptyChannelId,
          user_id: userId,
          role: 'owner'
        })
        .execute();

      const input: GetMessagesInput = {
        channel_id: emptyChannelId,
        limit: 50,
        offset: 0
      };

      const result = await getMessages(input, userId);
      expect(result).toHaveLength(0);
    });
  });

  describe('updateMessage', () => {
    let messageId: number;

    beforeEach(async () => {
      // Create a test message
      const messageResult = await db.insert(chatMessagesTable)
        .values({
          channel_id: channelId,
          content: 'Original message',
          user_id: userId,
          message_type: 'text'
        })
        .returning()
        .execute();

      messageId = messageResult[0].id;
    });

    it('should update message content successfully', async () => {
      const input: UpdateMessageInput = {
        message_id: messageId,
        content: 'Updated message content'
      };

      const result = await updateMessage(input, userId);

      expect(result.id).toBe(messageId);
      expect(result.content).toBe('Updated message content');
      expect(result.is_edited).toBe(true);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.user.id).toBe(userId);
      expect(result.user.username).toBe('testuser');
    });

    it('should save updated message to database', async () => {
      const input: UpdateMessageInput = {
        message_id: messageId,
        content: 'Database update test'
      };

      await updateMessage(input, userId);

      // Verify message was updated in database
      const updatedMessage = await db.select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, messageId))
        .execute();

      expect(updatedMessage).toHaveLength(1);
      expect(updatedMessage[0].content).toBe('Database update test');
      expect(updatedMessage[0].is_edited).toBe(true);
    });

    it('should reject update by non-owner', async () => {
      const input: UpdateMessageInput = {
        message_id: messageId,
        content: 'Unauthorized update'
      };

      await expect(updateMessage(input, userId2)).rejects.toThrow(/does not have permission/i);
    });

    it('should reject update of non-existent message', async () => {
      const input: UpdateMessageInput = {
        message_id: 99999,
        content: 'Update nothing'
      };

      await expect(updateMessage(input, userId)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteMessage', () => {
    let messageId: number;
    let otherUserMessageId: number;

    beforeEach(async () => {
      // Create messages from different users
      const userMessageResult = await db.insert(chatMessagesTable)
        .values({
          channel_id: channelId,
          content: 'Message from user',
          user_id: userId,
          message_type: 'text'
        })
        .returning()
        .execute();

      messageId = userMessageResult[0].id;

      const otherMessageResult = await db.insert(chatMessagesTable)
        .values({
          channel_id: channelId,
          content: 'Message from other user',
          user_id: userId2,
          message_type: 'text'
        })
        .returning()
        .execute();

      otherUserMessageId = otherMessageResult[0].id;
    });

    it('should delete own message successfully', async () => {
      const result = await deleteMessage(messageId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message deleted successfully');

      // Verify message was deleted from database
      const deletedMessage = await db.select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, messageId))
        .execute();

      expect(deletedMessage).toHaveLength(0);
    });

    it('should allow admin to delete any message', async () => {
      // userId is the owner, so they should be able to delete any message in their channel
      const result = await deleteMessage(otherUserMessageId, userId);

      expect(result.success).toBe(true);

      // Verify message was deleted
      const deletedMessage = await db.select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, otherUserMessageId))
        .execute();

      expect(deletedMessage).toHaveLength(0);
    });

    it('should reject deletion by regular member of others messages', async () => {
      // userId2 is just a member, so they cannot delete userId's message
      await expect(deleteMessage(messageId, userId2)).rejects.toThrow(/does not have permission/i);
    });

    it('should reject deletion of non-existent message', async () => {
      await expect(deleteMessage(99999, userId)).rejects.toThrow(/message not found/i);
    });
  });

  describe('unfurlLink', () => {
    it('should handle invalid URLs gracefully', async () => {
      const result = await unfurlLink('not-a-url');

      expect(result.title).toBe(null);
      expect(result.description).toBe(null);
      expect(result.image).toBe(null);
      expect(result.url).toBe('not-a-url');
    });

    it('should return basic structure for valid URL format', async () => {
      // This will likely fail to fetch, but should handle gracefully
      const result = await unfurlLink('https://nonexistent-domain-12345.com');

      expect(result.url).toBe('https://nonexistent-domain-12345.com');
      expect(result.title).toBe(null);
      expect(result.description).toBe(null);
      expect(result.image).toBe(null);
    });

    it('should preserve original URL in response', async () => {
      const testUrl = 'https://example.com/test-page';
      const result = await unfurlLink(testUrl);

      expect(result.url).toBe(testUrl);
    });
  });
});