import { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MessageWithUser, PublicUser } from '../../../server/src/schema';

interface ChatMessagesProps {
  messages: MessageWithUser[];
  currentUser: PublicUser;
  isLoading: boolean;
  channelId: number;
}

export function ChatMessages({ messages, currentUser, isLoading, channelId }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(date));
  };

  const formatDate = (date: Date) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString();
    }
  };

  const renderMessage = (message: MessageWithUser) => {
    const isCurrentUser = message.user_id === currentUser.id;

    return (
      <div
        key={message.id}
        className={`flex gap-3 p-3 message-fade-in ${isCurrentUser ? 'bg-green-900/20' : ''} hover:bg-gray-700/30 transition-colors`}
      >
        <Avatar className="w-8 h-8 border border-green-700">
          <AvatarImage src={message.user.avatar_url || undefined} />
          <AvatarFallback className="bg-green-800 text-green-200 text-xs font-mono">
            {message.user.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-green-300 font-semibold">
              {message.user.username}
            </span>
            {message.user.is_online && (
              <Badge 
                variant="outline" 
                className="text-xs border-green-600 text-green-500 px-1 py-0"
              >
                ONLINE
              </Badge>
            )}
            <span className="text-xs text-green-600 font-mono">
              {formatTime(message.created_at)}
            </span>
            {message.is_edited && (
              <span className="text-xs text-yellow-600 font-mono">(edited)</span>
            )}
          </div>

          <div className="text-green-100 text-sm font-mono break-words">
            {message.message_type === 'text' && (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}

            {message.message_type === 'image' && (
              <div className="space-y-2">
                {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
                {message.image_url && (
                  <img
                    src={message.image_url}
                    alt="Shared image"
                    className="max-w-md rounded border border-green-700 hover:border-green-500 transition-colors"
                  />
                )}
              </div>
            )}

            {message.message_type === 'link' && (
              <div className="space-y-2">
                {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
                {message.link_preview && (
                  <Card className="bg-gray-700 border-green-700 p-3 max-w-md">
                    {message.link_preview.image && (
                      <img
                        src={message.link_preview.image}
                        alt="Link preview"
                        className="w-full h-32 object-cover rounded mb-2"
                      />
                    )}
                    <div className="space-y-1">
                      {message.link_preview.title && (
                        <h4 className="font-semibold text-green-300 text-sm">
                          {message.link_preview.title}
                        </h4>
                      )}
                      {message.link_preview.description && (
                        <p className="text-green-200 text-xs line-clamp-2">
                          {message.link_preview.description}
                        </p>
                      )}
                      <a
                        href={message.link_preview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 underline text-xs break-all"
                      >
                        {message.link_preview.url}
                      </a>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>

          {message.reply_to_message_id && (
            <div className="mt-2 pl-3 border-l-2 border-green-700 text-xs text-green-500">
              <span className="font-mono">↳ Replying to message</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-green-400 font-mono animate-pulse">
          {'>'} Loading messages...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-1 scrollbar-thin">
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-green-600 font-mono">
            <div className="text-2xl mb-2">📡</div>
            <p>No messages yet.</p>
            <p className="text-sm mt-1">Start the conversation!</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message: MessageWithUser, index: number) => {
            const showDateSeparator =
              index === 0 ||
              formatDate(messages[index - 1].created_at) !== formatDate(message.created_at);

            return (
              <div key={message.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center py-2">
                    <div className="bg-gray-700 text-green-500 text-xs font-mono px-3 py-1 rounded-full border border-green-700">
                      {formatDate(message.created_at)}
                    </div>
                  </div>
                )}
                {renderMessage(message)}
              </div>
            );
          })}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}