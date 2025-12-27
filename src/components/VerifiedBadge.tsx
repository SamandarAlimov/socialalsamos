import { cn } from '@/lib/utils';

interface VerifiedBadgeProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function VerifiedBadge({ className, size = 'sm' }: VerifiedBadgeProps) {
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <svg
      viewBox="0 0 22 22"
      className={cn(sizeClasses[size], 'flex-shrink-0', className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Instagram-style blue verification badge */}
      <circle cx="11" cy="11" r="11" fill="#0095F6" />
      <path
        d="M9.5 11.5L10.5 12.5L13.5 9.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}