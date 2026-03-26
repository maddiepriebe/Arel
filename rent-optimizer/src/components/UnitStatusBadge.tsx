import { Badge } from '@/src/components/ui/Badge';

interface UnitStatusBadgeProps {
  isEligible: boolean;
  noticeOverdue: boolean;
  daysUntilEligible: number;
}

export function UnitStatusBadge({ isEligible, noticeOverdue, daysUntilEligible }: UnitStatusBadgeProps) {
  if (noticeOverdue) {
    return <Badge variant="red">Notice Overdue</Badge>;
  }
  if (isEligible && daysUntilEligible <= 0 && daysUntilEligible > -14) {
    return <Badge variant="amber">Action Soon</Badge>;
  }
  if (isEligible) {
    return <Badge variant="green">Eligible</Badge>;
  }
  const months = Math.ceil(-daysUntilEligible / 30);
  return <Badge variant="gray">{months}mo</Badge>;
}
