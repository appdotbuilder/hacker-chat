import { serial, text, pgTable, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'link']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  avatar_url: text('avatar_url'), // Nullable by default
  is_online: boolean('is_online').notNull().default(false),
  last_seen: timestamp('last_seen'), // Nullable by default
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Chat channels table
export const chatChannelsTable = pgTable('chat_channels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'), // Nullable by default
  is_private: boolean('is_private').notNull().default(false),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Chat messages table
export const chatMessagesTable = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  channel_id: integer('channel_id').notNull().references(() => chatChannelsTable.id),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  content: text('content').notNull(),
  message_type: messageTypeEnum('message_type').notNull().default('text'),
  image_url: text('image_url'), // Nullable by default
  link_preview: text('link_preview'), // JSON stored as text, nullable by default
  reply_to_message_id: integer('reply_to_message_id'),
  is_edited: boolean('is_edited').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Channel members table (for managing who can access which channels)
export const channelMembersTable = pgTable('channel_members', {
  id: serial('id').primaryKey(),
  channel_id: integer('channel_id').notNull().references(() => chatChannelsTable.id),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  role: memberRoleEnum('role').notNull().default('member'),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdChannels: many(chatChannelsTable),
  messages: many(chatMessagesTable),
  channelMemberships: many(channelMembersTable),
}));

export const chatChannelsRelations = relations(chatChannelsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [chatChannelsTable.created_by],
    references: [usersTable.id],
  }),
  messages: many(chatMessagesTable),
  members: many(channelMembersTable),
}));

export const chatMessagesRelations = relations(chatMessagesTable, ({ one, many }) => ({
  channel: one(chatChannelsTable, {
    fields: [chatMessagesTable.channel_id],
    references: [chatChannelsTable.id],
  }),
  user: one(usersTable, {
    fields: [chatMessagesTable.user_id],
    references: [usersTable.id],
  }),
  replyToMessage: one(chatMessagesTable, {
    fields: [chatMessagesTable.reply_to_message_id],
    references: [chatMessagesTable.id],
    relationName: 'messageReplies',
  }),
  replies: many(chatMessagesTable, {
    relationName: 'messageReplies',
  }),
}));

export const channelMembersRelations = relations(channelMembersTable, ({ one }) => ({
  channel: one(chatChannelsTable, {
    fields: [channelMembersTable.channel_id],
    references: [chatChannelsTable.id],
  }),
  user: one(usersTable, {
    fields: [channelMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type ChatChannel = typeof chatChannelsTable.$inferSelect;
export type NewChatChannel = typeof chatChannelsTable.$inferInsert;

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type NewChatMessage = typeof chatMessagesTable.$inferInsert;

export type ChannelMember = typeof channelMembersTable.$inferSelect;
export type NewChannelMember = typeof channelMembersTable.$inferInsert;

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  chatChannels: chatChannelsTable,
  chatMessages: chatMessagesTable,
  channelMembers: channelMembersTable,
};