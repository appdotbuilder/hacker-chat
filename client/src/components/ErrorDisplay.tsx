import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  showRetry?: boolean;
}

export function ErrorDisplay({ error, onRetry, showRetry = true }: ErrorDisplayProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="max-w-md w-full">
        <Alert className="bg-red-900 border-red-600 text-red-200 mb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-red-400">⚠️ ERROR</span>
          </div>
          <AlertDescription className="font-mono text-sm mt-2 glitch">
            {error}
          </AlertDescription>
        </Alert>
        
        {showRetry && onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="w-full border-red-600 text-red-400 hover:bg-red-900 font-mono"
          >
            {'>'} RETRY CONNECTION
          </Button>
        )}
      </div>
    </div>
  );
}