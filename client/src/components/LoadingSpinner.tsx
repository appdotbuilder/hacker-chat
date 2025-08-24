interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ message = 'Loading...', size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const spinnerSize = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className="flex items-center justify-center py-8">
      <div className={`text-green-400 font-mono ${sizeClasses[size]} flex items-center gap-3`}>
        <div className={`${spinnerSize[size]} border-2 border-green-400 border-t-transparent rounded-full animate-spin`}></div>
        <span className="animate-pulse">{'>'} {message}</span>
      </div>
    </div>
  );
}