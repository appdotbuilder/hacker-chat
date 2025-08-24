import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  avatar_url: z.string().nullable(),
  is_online: z.boolean(),
  last_seen: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Public user schema (without sensitive data)
export const publicUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  avatar_url: z.string().nullable(),
  is_online: z.boolean(),
  last_seen: z.coerce.date().nullable()
});

export type PublicUser = z.infer<typeof publicUserSchema>;

// Chat channel schema
export const chatChannelSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  is_private: z.boolean(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ChatChannel = z.infer<typeof chatChannelSchema>;

// Chat message schema
export const chatMessageSchema = z.object({
  id: z.number(),
  channel_id: z.number(),
  user_id: z.number(),
  content: z.string(),
  message_type: z.enum(['text', 'image', 'link']),
  image_url: z.string().nullable(),
  link_preview: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    url: z.string()
  }).nullable(),
  reply_to_message_id: z.number().nullable(),
  is_edited: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// Channel member schema
export const channelMemberSchema = z.object({
  id: z.number(),
  channel_id: z.number(),
  user_id: z.number(),
  role: z.enum(['owner', 'admin', 'member']),
  joined_at: z.coerce.date()
});

export type ChannelMember = z.infer<typeof channelMemberSchema>;

// Input schemas for authentication
export const signupInputSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Input schemas for chat operations
export const createChannelInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  is_private: z.boolean(),
  member_user_ids: z.array(z.number()).optional() // For private chats
});

export type CreateChannelInput = z.infer<typeof createChannelInputSchema>;

export const sendMessageInputSchema = z.object({
  channel_id: z.number(),
  content: z.string().min(1),
  message_type: z.enum(['text', 'image', 'link']).default('text'),
  image_url: z.string().optional(),
  reply_to_message_id: z.number().optional()
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const updateMessageInputSchema = z.object({
  message_id: z.number(),
  content: z.string().min(1)
});

export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>;

export const getMessagesInputSchema = z.object({
  channel_id: z.number(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
});

export type GetMessagesInput = z.infer<typeof getMessagesInputSchema>;

export const joinChannelInputSchema = z.object({
  channel_id: z.number()
});

export type JoinChannelInput = z.infer<typeof joinChannelInputSchema>;

// Response schemas
export const authResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: publicUserSchema.optional(),
  token: z.string().optional()
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const messageWithUserSchema = chatMessageSchema.extend({
  user: publicUserSchema
});

export type MessageWithUser = z.infer<typeof messageWithUserSchema>;

export const channelWithMembersSchema = chatChannelSchema.extend({
  members: z.array(publicUserSchema),
  member_count: z.number()
});

export type ChannelWithMembers = z.infer<typeof channelWithMembersSchema>;

// Update user status input
export const updateUserStatusInputSchema = z.object({
  is_online: z.boolean()
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusInputSchema>;