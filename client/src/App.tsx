import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/utils/trpc';
import { AuthForm } from '@/components/AuthForm';
import { ChatInterface } from '@/components/ChatInterface';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PublicUser, AuthResponse } from '../../server/src/schema';

function App() {
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');

  const loadCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    
    try {
      setAuthToken(token);
      const user = await trpc.auth.getCurrentUser.query();
      if (user) {
        setCurrentUser(user);
      } else {
        localStorage.removeItem('auth_token');
        setAuthToken('');
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
      localStorage.removeItem('auth_token');
      setAuthToken('');
      setError('Session expired. Please log in again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  const handleAuth = async (response: AuthResponse) => {
    if (response.success && response.user && response.token) {
      setCurrentUser(response.user);
      setAuthToken(response.token);
      localStorage.setItem('auth_token', response.token);
      setError('');
    } else {
      setError(response.message);
    }
  };

  const handleLogout = async () => {
    try {
      await trpc.auth.logout.mutate();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCurrentUser(null);
      setAuthToken('');
      localStorage.removeItem('auth_token');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-green-400 font-mono boot-sequence text-center">
          <div className="text-4xl mb-4 matrix-text">⚡</div>
          <div className="animate-pulse text-xl mb-2">TERMINAL_CHAT</div>
          <div className="text-sm">
            <span className="cursor-blink">█</span> Initializing secure connection...
          </div>
          <div className="mt-4 flex justify-center">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full typing-dots"></div>
              <div className="w-2 h-2 bg-green-400 rounded-full typing-dots" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-green-400 rounded-full typing-dots" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-green-400 font-mono scan-lines">
      {/* Matrix-style header */}
      <div className="border-b border-green-800 bg-gray-800 relative">
        <div className="container mx-auto px-4 py-2 flex justify-between items-center">
          <h1 className="text-xl font-bold matrix-text">
            <span className="text-green-300">⚡</span> {'>'} TERMINAL_CHAT <span className="animate-pulse cursor-blink">█</span>
          </h1>
          {currentUser && (
            <div className="flex items-center gap-4">
              <span className="text-sm">
                [{currentUser.is_online ? 'ONLINE' : 'OFFLINE'}] {currentUser.username}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 bg-red-900 hover:bg-red-800 border border-red-600 rounded text-red-200 text-sm transition-colors"
              >
                EXIT
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        {error && (
          <Alert className="mb-4 bg-red-900 border-red-600 text-red-200">
            <AlertDescription className="font-mono text-sm">
              ERROR: {error}
            </AlertDescription>
          </Alert>
        )}

        {!currentUser ? (
          <AuthForm onAuth={handleAuth} />
        ) : (
          <ChatInterface 
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        )}
      </div>

      {/* Terminal Footer */}
      <div className="border-t border-green-800 bg-gray-800 px-4 py-2">
        <div className="container mx-auto flex justify-between items-center text-xs font-mono text-green-600">
          <div>
            STATUS: {currentUser ? 'AUTHENTICATED' : 'GUEST'} | 
            USERS: {currentUser ? 'CONNECTED' : 'DISCONNECTED'} | 
            VERSION: v1.0.0
          </div>
          <div className="flex items-center gap-4">
            <span>🔐 E2E ENCRYPTED</span>
            <span>📡 REAL-TIME</span>
            <span className="animate-pulse">●</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;