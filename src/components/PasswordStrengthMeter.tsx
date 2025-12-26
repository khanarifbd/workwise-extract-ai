import { useMemo } from 'react';
import { Check, X, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

interface StrengthCriteria {
  label: string;
  met: boolean;
}

export const PasswordStrengthMeter = ({ password, className }: PasswordStrengthMeterProps) => {
  const analysis = useMemo(() => {
    const criteria: StrengthCriteria[] = [
      { label: 'At least 8 characters', met: password.length >= 8 },
      { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
      { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
      { label: 'Contains a number', met: /[0-9]/.test(password) },
      { label: 'Contains special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
    ];

    const metCount = criteria.filter(c => c.met).length;
    
    let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    let label = 'Weak';
    let color = 'bg-destructive';
    
    if (metCount >= 5) {
      strength = 'strong';
      label = 'Strong';
      color = 'bg-green-500';
    } else if (metCount >= 4) {
      strength = 'good';
      label = 'Good';
      color = 'bg-blue-500';
    } else if (metCount >= 3) {
      strength = 'fair';
      label = 'Fair';
      color = 'bg-yellow-500';
    }

    const percentage = (metCount / 5) * 100;

    return { criteria, strength, label, color, percentage, metCount };
  }, [password]);

  if (!password) return null;

  const StrengthIcon = analysis.strength === 'strong' 
    ? ShieldCheck 
    : analysis.strength === 'weak' 
      ? ShieldAlert 
      : Shield;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Strength bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <StrengthIcon className={cn(
              'h-4 w-4',
              analysis.strength === 'strong' && 'text-green-500',
              analysis.strength === 'good' && 'text-blue-500',
              analysis.strength === 'fair' && 'text-yellow-500',
              analysis.strength === 'weak' && 'text-destructive',
            )} />
            <span className="font-medium">Password Strength:</span>
          </div>
          <span className={cn(
            'font-semibold',
            analysis.strength === 'strong' && 'text-green-600 dark:text-green-400',
            analysis.strength === 'good' && 'text-blue-600 dark:text-blue-400',
            analysis.strength === 'fair' && 'text-yellow-600 dark:text-yellow-400',
            analysis.strength === 'weak' && 'text-destructive',
          )}>
            {analysis.label}
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className={cn('h-full transition-all duration-300', analysis.color)}
            style={{ width: `${analysis.percentage}%` }}
          />
        </div>
      </div>

      {/* Criteria checklist */}
      <ul className="grid grid-cols-1 gap-1.5 text-xs">
        {analysis.criteria.map((criterion, index) => (
          <li 
            key={index}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              criterion.met 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-muted-foreground'
            )}
          >
            {criterion.met ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            {criterion.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
