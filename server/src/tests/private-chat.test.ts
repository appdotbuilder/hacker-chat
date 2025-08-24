import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatChannelsTable, channelMembersTable, chatMessagesTable } from '../db/schema';
import { createPrivateChat, getPrivateChats, getPrivateChatUsers, addUserToPrivateChat } from '../handlers/private-chat';
import { eq, and } from 'drizzle-orm';

describe('Private Chat Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users
  async function createTestUsers() {
    const users = await db.insert(usersTable)
      .values([
        {
          username: 'user1',
          email: 'user1@test.com',
          password_hash: 'hash1',
          is_online: true
        },
        {
          username: 'user2',
          email: 'user2@test.com',
          password_hash: 'hash2',
          is_online: false
        },
        {
          username: 'user3',
          email: 'user3@test.com',
          password_hash: 'hash3',
          is_online: true
        }
      ])
      .returning()
      .execute();
    
    return users;
  }

  describe('createPrivateChat', () => {
    it('should create a new private chat between two users', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);

      // Verify chat properties
      expect(privateChat.name).toBe('');
      expect(privateChat.description).toBeNull();
      expect(privateChat.is_private).toBe(true);
      expect(privateChat.created_by).toBe(user1.id);
      expect(privateChat.id).toBeDefined();
      expect(privateChat.created_at).toBeInstanceOf(Date);

      // Verify both users are members
      const members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, privateChat.id))
        .execute();

      expect(members).toHaveLength(2);
      
      const memberIds = members.map(m => m.user_id).sort();
      expect(memberIds).toEqual([user1.id, user2.id].sort());

      // Verify roles
      const user1Member = members.find(m => m.user_id === user1.id);
      const user2Member = members.find(m => m.user_id === user2.id);
      
      expect(user1Member?.role).toBe('owner');
      expect(user2Member?.role).toBe('member');
    });

    it('should return existing private chat if it already exists', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      // Create first chat
      const firstChat = await createPrivateChat(user1.id, user2.id);
      
      // Try to create again
      const secondChat = await createPrivateChat(user1.id, user2.id);

      // Should return the same chat
      expect(secondChat.id).toBe(firstChat.id);
      expect(secondChat.created_at.getTime()).toBe(firstChat.created_at.getTime());

      // Verify still only 2 members
      const members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, firstChat.id))
        .execute();

      expect(members).toHaveLength(2);
    });

    it('should work when called with users in reverse order', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const firstChat = await createPrivateChat(user1.id, user2.id);
      const secondChat = await createPrivateChat(user2.id, user1.id);

      expect(secondChat.id).toBe(firstChat.id);
    });

    it('should allow creating different private chats with different users', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const chat1 = await createPrivateChat(user1.id, user2.id);
      const chat2 = await createPrivateChat(user1.id, user3.id);

      expect(chat1.id).not.toBe(chat2.id);

      // Verify chat1 has user1 and user2
      const chat1Members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, chat1.id))
        .execute();

      const chat1MemberIds = chat1Members.map(m => m.user_id).sort();
      expect(chat1MemberIds).toEqual([user1.id, user2.id].sort());

      // Verify chat2 has user1 and user3
      const chat2Members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, chat2.id))
        .execute();

      const chat2MemberIds = chat2Members.map(m => m.user_id).sort();
      expect(chat2MemberIds).toEqual([user1.id, user3.id].sort());
    });
  });

  describe('getPrivateChats', () => {
    it('should return empty array when user has no private chats', async () => {
      const users = await createTestUsers();
      const [user1] = users;

      const privateChats = await getPrivateChats(user1.id);

      expect(privateChats).toEqual([]);
    });

    it('should return private chats with other user info', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      // Create two private chats
      await createPrivateChat(user1.id, user2.id);
      await createPrivateChat(user1.id, user3.id);

      const privateChats = await getPrivateChats(user1.id);

      expect(privateChats).toHaveLength(2);

      // Check that each chat has other user info
      privateChats.forEach(chat => {
        expect(chat.is_private).toBe(true);
        expect(chat.otherUser).toBeDefined();
        expect(chat.otherUser.id).not.toBe(user1.id);
        expect(chat.otherUser.username).toBeDefined();
        expect(typeof chat.otherUser.is_online).toBe('boolean');
        expect(['user2', 'user3']).toContain(chat.otherUser.username);
      });
    });

    it('should include last message when available', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);

      // Add a message to the chat
      await db.insert(chatMessagesTable)
        .values({
          channel_id: privateChat.id,
          user_id: user1.id,
          content: 'Hello there!'
        })
        .execute();

      const privateChats = await getPrivateChats(user1.id);

      expect(privateChats).toHaveLength(1);
      expect(privateChats[0].lastMessage).toBeDefined();
      expect(privateChats[0].lastMessage?.content).toBe('Hello there!');
      expect(privateChats[0].lastMessage?.created_at).toBeInstanceOf(Date);
    });

    it('should sort chats by most recent activity', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const chat1 = await createPrivateChat(user1.id, user2.id);
      const chat2 = await createPrivateChat(user1.id, user3.id);

      // Add older message to chat1
      await db.insert(chatMessagesTable)
        .values({
          channel_id: chat1.id,
          user_id: user1.id,
          content: 'Old message'
        })
        .execute();

      // Wait a bit and add newer message to chat2
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await db.insert(chatMessagesTable)
        .values({
          channel_id: chat2.id,
          user_id: user1.id,
          content: 'New message'
        })
        .execute();

      const privateChats = await getPrivateChats(user1.id);

      expect(privateChats).toHaveLength(2);
      expect(privateChats[0].id).toBe(chat2.id); // More recent should be first
      expect(privateChats[0].lastMessage?.content).toBe('New message');
      expect(privateChats[1].id).toBe(chat1.id);
      expect(privateChats[1].lastMessage?.content).toBe('Old message');
    });
  });

  describe('getPrivateChatUsers', () => {
    it('should return other users in private chat', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      const otherUsers = await getPrivateChatUsers(privateChat.id, user1.id);

      expect(otherUsers).toHaveLength(1);
      expect(otherUsers[0].id).toBe(user2.id);
      expect(otherUsers[0].username).toBe('user2');
      expect(otherUsers[0].is_online).toBe(false);
      expect(otherUsers[0].avatar_url).toBeNull();
    });

    it('should exclude current user from results', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      
      // Add third user to make it a group chat
      await addUserToPrivateChat(privateChat.id, user1.id, user3.id);
      
      const otherUsers = await getPrivateChatUsers(privateChat.id, user1.id);

      expect(otherUsers).toHaveLength(2);
      const userIds = otherUsers.map(u => u.id);
      expect(userIds).toContain(user2.id);
      expect(userIds).toContain(user3.id);
      expect(userIds).not.toContain(user1.id);
    });

    it('should throw error for non-existent or non-private channel', async () => {
      const users = await createTestUsers();
      const [user1] = users;

      // Test with non-existent channel
      await expect(getPrivateChatUsers(999, user1.id)).rejects.toThrow(/Channel not found or access denied/i);

      // Create public channel
      const publicChannel = await db.insert(chatChannelsTable)
        .values({
          name: 'Public Channel',
          is_private: false,
          created_by: user1.id
        })
        .returning()
        .execute();

      await db.insert(channelMembersTable)
        .values({
          channel_id: publicChannel[0].id,
          user_id: user1.id,
          role: 'owner'
        })
        .execute();

      // Should throw error for public channel
      await expect(getPrivateChatUsers(publicChannel[0].id, user1.id)).rejects.toThrow(/Channel not found or access denied/i);
    });

    it('should throw error when user is not member of channel', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);

      // user3 is not a member, should throw error
      await expect(getPrivateChatUsers(privateChat.id, user3.id)).rejects.toThrow(/Channel not found or access denied/i);
    });
  });

  describe('addUserToPrivateChat', () => {
    it('should successfully add user when requester is owner', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      const result = await addUserToPrivateChat(privateChat.id, user1.id, user3.id);

      expect(result.success).toBe(true);
      expect(result.message).toBe('User added to private chat successfully');

      // Verify user3 is now a member
      const members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, privateChat.id))
        .execute();

      expect(members).toHaveLength(3);
      const user3Member = members.find(m => m.user_id === user3.id);
      expect(user3Member).toBeDefined();
      expect(user3Member?.role).toBe('member');
    });

    it('should fail when user does not have permission', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      
      // user2 is member but not owner/admin, should fail
      const result = await addUserToPrivateChat(privateChat.id, user2.id, user3.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe('You do not have permission to add users to this chat');

      // Verify user3 was not added
      const members = await db.select()
        .from(channelMembersTable)
        .where(eq(channelMembersTable.channel_id, privateChat.id))
        .execute();

      expect(members).toHaveLength(2);
    });

    it('should fail when target user is already in chat', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      
      // Try to add user2 who is already a member
      const result = await addUserToPrivateChat(privateChat.id, user1.id, user2.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe('User is already a member of this chat');
    });

    it('should fail when target user does not exist', async () => {
      const users = await createTestUsers();
      const [user1, user2] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      
      // Try to add non-existent user
      const result = await addUserToPrivateChat(privateChat.id, user1.id, 999);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target user not found');
    });

    it('should work when requester is admin', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      const privateChat = await createPrivateChat(user1.id, user2.id);
      
      // Make user2 an admin
      await db.update(channelMembersTable)
        .set({ role: 'admin' })
        .where(
          and(
            eq(channelMembersTable.channel_id, privateChat.id),
            eq(channelMembersTable.user_id, user2.id)
          )
        )
        .execute();

      // Now user2 should be able to add user3
      const result = await addUserToPrivateChat(privateChat.id, user2.id, user3.id);

      expect(result.success).toBe(true);
      expect(result.message).toBe('User added to private chat successfully');
    });

    it('should fail for non-private channel', async () => {
      const users = await createTestUsers();
      const [user1, user2, user3] = users;

      // Create public channel
      const publicChannel = await db.insert(chatChannelsTable)
        .values({
          name: 'Public Channel',
          is_private: false,
          created_by: user1.id
        })
        .returning()
        .execute();

      await db.insert(channelMembersTable)
        .values({
          channel_id: publicChannel[0].id,
          user_id: user1.id,
          role: 'owner'
        })
        .execute();

      const result = await addUserToPrivateChat(publicChannel[0].id, user1.id, user3.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe('You do not have permission to add users to this chat');
    });
  });
});