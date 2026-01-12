import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SignOffStatusIndicatorProps {
  jobId: string;
  team1?: string | null;
  team2?: string | null;
  onClick?: () => void;
  compact?: boolean;
}

export const SignOffStatusIndicator = ({
  jobId,
  team1,
  team2,
  onClick,
  compact = false,
}: SignOffStatusIndicatorProps) => {
  const [signedOffTeams, setSignedOffTeams] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const assignedTeams = [team1, team2].filter(Boolean) as string[];
  const totalAssigned = assignedTeams.length;
  const totalSignedOff = signedOffTeams.filter(t => assignedTeams.includes(t)).length;

  useEffect(() => {
    if (jobId && totalAssigned > 0) {
      fetchSignOffStatus();
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel(`sign-offs-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'team_sign_offs',
            filter: `job_id=eq.${jobId}`,
          },
          () => {
            fetchSignOffStatus();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setIsLoading(false);
    }
  }, [jobId, team1, team2]);

  const fetchSignOffStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('team_sign_offs')
        .select('team_name')
        .eq('job_id', jobId);

      if (error) throw error;
      setSignedOffTeams((data || []).map(d => d.team_name));
    } catch (error) {
      console.error('Failed to fetch sign-off status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show if no teams assigned
  if (totalAssigned === 0) return null;

  // Loading state
  if (isLoading) {
    return (
      <Badge variant="outline" className="text-xs opacity-50">
        <Clock className="h-3 w-3 animate-pulse" />
      </Badge>
    );
  }

  const allSignedOff = totalSignedOff === totalAssigned;
  const someSignedOff = totalSignedOff > 0 && totalSignedOff < totalAssigned;
  const noneSignedOff = totalSignedOff === 0;

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs cursor-pointer",
          allSignedOff && "bg-success/10 text-success border-success/30",
          someSignedOff && "bg-amber-500/10 text-amber-600 border-amber-500/30",
          noneSignedOff && "bg-muted text-muted-foreground border-border"
        )}
        onClick={onClick}
        title={`${totalSignedOff}/${totalAssigned} teams signed off`}
      >
        {allSignedOff ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        {totalSignedOff}/{totalAssigned}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
      title="Click to view sign-off history"
    >
      {/* Individual team indicators */}
      {assignedTeams.map(team => {
        const hasSigned = signedOffTeams.includes(team);
        return (
          <div
            key={team}
            className={cn(
              "w-2 h-2 rounded-full",
              hasSigned ? "bg-success" : "bg-muted-foreground/30"
            )}
            title={`${team}: ${hasSigned ? 'Signed off' : 'Pending'}`}
          />
        );
      })}
      
      {/* Status icon */}
      {allSignedOff ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : someSignedOff ? (
        <Clock className="h-4 w-4 text-amber-500" />
      ) : (
        <Users className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
};
