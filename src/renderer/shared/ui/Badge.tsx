export type JobStatus = 'pending' | 'pre_flight' | 'running' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export type BadgeTone = 'neutral' | 'ai' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-hover text-text-secondary',
  ai: 'bg-bg-selected text-text-primary',
  success: 'bg-accent-success/15 text-accent-success',
  warning: 'bg-accent-warning/15 text-accent-warning',
  danger: 'bg-accent-danger/15 text-accent-danger',
  info: 'bg-accent-info/15 text-accent-info',
};

const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  pending: 'neutral',
  pre_flight: 'info',
  running: 'info',
  downloading: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  status?: JobStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ label, tone, status, size = 'sm', className = '' }: BadgeProps) {
  const resolvedTone = tone ?? (status ? JOB_STATUS_TONE[status] : 'neutral');
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses} ${TONE_CLASSES[resolvedTone]} ${className}`}
    >
      {label}
    </span>
  );
}
