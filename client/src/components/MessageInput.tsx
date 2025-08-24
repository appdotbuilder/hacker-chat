import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/utils/trpc';
import type { PublicUser, SendMessageInput, MessageWithUser } from '../../../server/src/schema';

interface MessageInputProps {
  channelId: number;
  currentUser: PublicUser;
  onMessageSent: (message: MessageWithUser) => void;
}

export function MessageInput({ channelId, currentUser, onMessageSent }: MessageInputProps) {
  const [messageData, setMessageData] = useState<SendMessageInput>({
    channel_id: channelId,
    content: '',
    message_type: 'text',
    image_url: undefined,
    reply_to_message_id: undefined
  });
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageData.content.trim() && !messageData.image_url) return;

    setIsLoading(true);
    try {
      const newMessage = await trpc.messages.send.mutate({
        ...messageData,
        channel_id: channelId
      });
      
      onMessageSent(newMessage);
      
      // Reset form
      setMessageData({
        channel_id: channelId,
        content: '',
        message_type: 'text',
        image_url: undefined,
        reply_to_message_id: undefined
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In a real app, you would upload the file to a cloud storage service
    // For now, we'll create a placeholder URL
    const placeholderImageUrl = `https://via.placeholder.com/400x300?text=Image+${file.name}`;
    
    setMessageData((prev: SendMessageInput) => ({
      ...prev,
      message_type: 'image',
      image_url: placeholderImageUrl
    }));
  };

  const detectMessageType = (content: string): 'text' | 'image' | 'link' => {
    // Simple URL detection
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(content)) {
      return 'link';
    }
    return 'text';
  };

  const handleContentChange = (value: string) => {
    const messageType = detectMessageType(value);
    setMessageData((prev: SendMessageInput) => ({
      ...prev,
      content: value,
      message_type: messageType
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Message Type Selector */}
      <div className="flex items-center gap-2">
        <Select
          value={messageData.message_type}
          onValueChange={(value: 'text' | 'image' | 'link') =>
            setMessageData((prev: SendMessageInput) => ({ ...prev, message_type: value }))
          }
        >
          <SelectTrigger className="w-32 bg-gray-700 border-green-700 text-green-400 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-green-700">
            <SelectItem value="text" className="font-mono text-green-400 focus:bg-green-900">
              📝 TEXT
            </SelectItem>
            <SelectItem value="image" className="font-mono text-green-400 focus:bg-green-900">
              🖼️ IMAGE
            </SelectItem>
            <SelectItem value="link" className="font-mono text-green-400 focus:bg-green-900">
              🔗 LINK
            </SelectItem>
          </SelectContent>
        </Select>

        {messageData.message_type === 'image' && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="border-green-700 text-green-400 hover:bg-green-900 font-mono text-xs"
            >
              UPLOAD
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Image Preview */}
      {messageData.message_type === 'image' && messageData.image_url && (
        <div className="relative">
          <img
            src={messageData.image_url}
            alt="Preview"
            className="max-h-32 rounded border border-green-700"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMessageData((prev: SendMessageInput) => ({ ...prev, image_url: undefined }))}
            className="absolute top-1 right-1 bg-red-900 hover:bg-red-800 border-red-600 text-red-200 text-xs"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Message Input */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={messageData.content}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleContentChange(e.target.value)
            }
            onKeyPress={handleKeyPress}
            placeholder={
              messageData.message_type === 'image'
                ? 'Add a caption (optional)...'
                : messageData.message_type === 'link'
                ? 'Paste a link or add text...'
                : 'Type your message...'
            }
            className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
            disabled={isLoading}
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || (!messageData.content.trim() && !messageData.image_url)}
          className="bg-green-800 hover:bg-green-700 text-green-100 font-mono px-6"
        >
          {isLoading ? '>>>' : 'SEND'}
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-xs text-green-600 font-mono">
        💡 Press Enter to send • Shift+Enter for new line
        {messageData.message_type === 'link' && ' • Links will be auto-detected and unfurled'}
      </div>
    </form>
  );
}