import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  signupInputSchema,
  loginInputSchema,
  createChannelInputSchema,
  sendMessageInputSchema,
  getMessagesInputSchema,
  updateMessageInputSchema,
  joinChannelInputSchema,
  updateUserStatusInputSchema
} from './schema';

// Import handlers
import { signup, login, logout, getCurrentUser } from './handlers/auth';
import { 
  createChannel, 
  getPublicChannels, 
  getUserChannels, 
  joinChannel, 
  leaveChannel, 
  getChannelMembers 
} from './handlers/channels';
import { 
  sendMessage, 
  getMessages, 
  updateMessage, 
  deleteMessage, 
  unfurlLink 
} from './handlers/messages';
import { 
  getOnlineUsers, 
  getAllUsers, 
  searchUsers, 
  updateUserStatus, 
  updateUserProfile 
} from './handlers/users';
import { 
  createPrivateChat, 
  getPrivateChats, 
  getPrivateChatUsers, 
  addUserToPrivateChat 
} from './handlers/private-chat';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Mock authentication middleware - replace with proper JWT verification
const authenticatedProcedure = publicProcedure.use(async ({ next, ctx }) => {
  // This is a placeholder! Real implementation should:
  // 1. Extract JWT token from Authorization header
  // 2. Verify and decode the token
  // 3. Add user ID to context
  const userId = 1; // Placeholder user ID
  return next({
    ctx: {
      ...ctx,
      userId,
    },
  });
});

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    signup: publicProcedure
      .input(signupInputSchema)
      .mutation(({ input }) => signup(input)),
    
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    logout: authenticatedProcedure
      .mutation(({ ctx }) => logout(ctx.userId)),
    
    getCurrentUser: authenticatedProcedure
      .query(({ ctx }) => getCurrentUser(ctx.userId)),
  }),

  // Channel management routes
  channels: router({
    create: authenticatedProcedure
      .input(createChannelInputSchema)
      .mutation(({ input, ctx }) => createChannel(input, ctx.userId)),
    
    getPublic: publicProcedure
      .query(() => getPublicChannels()),
    
    getUserChannels: authenticatedProcedure
      .query(({ ctx }) => getUserChannels(ctx.userId)),
    
    join: authenticatedProcedure
      .input(joinChannelInputSchema)
      .mutation(({ input, ctx }) => joinChannel(input, ctx.userId)),
    
    leave: authenticatedProcedure
      .input(z.object({ channelId: z.number() }))
      .mutation(({ input, ctx }) => leaveChannel(input.channelId, ctx.userId)),
    
    getMembers: authenticatedProcedure
      .input(z.object({ channelId: z.number() }))
      .query(({ input, ctx }) => getChannelMembers(input.channelId, ctx.userId)),
  }),

  // Message management routes
  messages: router({
    send: authenticatedProcedure
      .input(sendMessageInputSchema)
      .mutation(({ input, ctx }) => sendMessage(input, ctx.userId)),
    
    get: authenticatedProcedure
      .input(getMessagesInputSchema)
      .query(({ input, ctx }) => getMessages(input, ctx.userId)),
    
    update: authenticatedProcedure
      .input(updateMessageInputSchema)
      .mutation(({ input, ctx }) => updateMessage(input, ctx.userId)),
    
    delete: authenticatedProcedure
      .input(z.object({ messageId: z.number() }))
      .mutation(({ input, ctx }) => deleteMessage(input.messageId, ctx.userId)),
    
    unfurlLink: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .query(({ input }) => unfurlLink(input.url)),
  }),

  // User management routes
  users: router({
    getOnline: publicProcedure
      .query(() => getOnlineUsers()),
    
    getAll: authenticatedProcedure
      .query(({ ctx }) => getAllUsers(ctx.userId)),
    
    search: authenticatedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input, ctx }) => searchUsers(input.query, ctx.userId)),
    
    updateStatus: authenticatedProcedure
      .input(updateUserStatusInputSchema)
      .mutation(({ input, ctx }) => updateUserStatus(input, ctx.userId)),
    
    updateProfile: authenticatedProcedure
      .input(z.object({ 
        username: z.string().min(3).max(30).optional(),
        avatar_url: z.string().url().optional()
      }))
      .mutation(({ input, ctx }) => updateUserProfile(ctx.userId, input)),
  }),

  // Private chat routes
  privateChats: router({
    create: authenticatedProcedure
      .input(z.object({ otherUserId: z.number() }))
      .mutation(({ input, ctx }) => createPrivateChat(ctx.userId, input.otherUserId)),
    
    get: authenticatedProcedure
      .query(({ ctx }) => getPrivateChats(ctx.userId)),
    
    getUsers: authenticatedProcedure
      .input(z.object({ channelId: z.number() }))
      .query(({ input, ctx }) => getPrivateChatUsers(input.channelId, ctx.userId)),
    
    addUser: authenticatedProcedure
      .input(z.object({ channelId: z.number(), targetUserId: z.number() }))
      .mutation(({ input, ctx }) => addUserToPrivateChat(input.channelId, ctx.userId, input.targetUserId)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC Chat Server listening at port: ${port}`);
  console.log('Available routes:');
  console.log('- Authentication: /auth/signup, /auth/login, /auth/logout, /auth/getCurrentUser');
  console.log('- Channels: /channels/create, /channels/getPublic, /channels/getUserChannels, /channels/join, /channels/leave, /channels/getMembers');
  console.log('- Messages: /messages/send, /messages/get, /messages/update, /messages/delete, /messages/unfurlLink');
  console.log('- Users: /users/getOnline, /users/getAll, /users/search, /users/updateStatus, /users/updateProfile');
  console.log('- Private Chats: /privateChats/create, /privateChats/get, /privateChats/getUsers, /privateChats/addUser');
}

start();