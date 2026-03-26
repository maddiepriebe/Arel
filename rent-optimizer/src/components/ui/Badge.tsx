import { cn } from '@/src/lib/utils';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  green:  'bg-green-100 text-green-800 ring-green-200',
  red:    'bg-red-100 text-red-800 ring-red-200',
  amber:  'bg-amber-100 text-amber-800 ring-amber-200',
  blue:   'bg-blue-100 text-blue-800 ring-blue-200',
  gray:   'bg-gray-100 text-gray-700 ring-gray-200',
  purple: 'bg-purple-100 text-purple-800 ring-purple-200',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
