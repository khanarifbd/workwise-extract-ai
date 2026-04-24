import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { startOfDay, isBefore } from 'date-fns';

export interface TradeBookingInfo {
  jobId: string;
  effectiveBookedDate: Date; // Nearest upcoming incomplete trade booked date
  totalTrades: number;
  completedTrades: number;
  pendingTrades: { trade: string; bookedDate: Date; taskType: string }[];
  isTradeBooked: true; // Marker to distinguish from regular bookings
  taskType: 'trade' | 'dm_team' | 'mixed'; // Whether this is a trade, DM team, or mixed
}

/**
 * Fetches sub-tasks with booked dates and computes the nearest upcoming
 * incomplete trade booked date for each parent job.
 * Jobs appear under the earliest pending trade date, moving forward as trades complete.
 */
export function useTradeBookedJobs() {
  const [tradeBookings, setTradeBookings] = useState<Map<string, TradeBookingInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchTradeBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('job_sub_tasks')
        .select('id, parent_job_id, trade, booked_date, status, completion_date, task_type')
        .not('booked_date', 'is', null)
        .order('booked_date', { ascending: true });

      if (error) throw error;

      const map = new Map<string, TradeBookingInfo>();
      const completedStatuses = ['completed_awaiting_portal', 'completed_signed_off'];

      (data || []).forEach(row => {
        const isCompleted = completedStatuses.includes(row.status) || !!row.completion_date;
        const bookedDate = new Date(row.booked_date!);
        const taskType = (row as any).task_type || 'trade';
        
        if (!map.has(row.parent_job_id)) {
          map.set(row.parent_job_id, {
            jobId: row.parent_job_id,
            effectiveBookedDate: bookedDate,
            totalTrades: 0,
            completedTrades: 0,
            pendingTrades: [],
            isTradeBooked: true,
            taskType: taskType,
          });
        }

        const info = map.get(row.parent_job_id)!;
        info.totalTrades++;

        // Track mixed task types
        if (info.taskType !== 'mixed' && info.taskType !== taskType) {
          info.taskType = 'mixed';
        }

        if (isCompleted) {
          info.completedTrades++;
        } else {
          info.pendingTrades.push({ trade: row.trade, bookedDate, taskType });
        }
      });

      // Set effective date to nearest upcoming incomplete trade date.
      // If all trades are completed we KEEP the entry (using the latest trade
      // booked_date as the effective date) so the parent job still appears in
      // its original Booked folder day, rendered in green alongside the live
      // booked work for that day.
      map.forEach((info) => {
        if (info.pendingTrades.length > 0) {
          info.pendingTrades.sort((a, b) => a.bookedDate.getTime() - b.bookedDate.getTime());
          info.effectiveBookedDate = info.pendingTrades[0].bookedDate;
        }
        // else: effectiveBookedDate already holds the most recent trade's
        // booked_date (last assignment from the loop above) — leave it intact.
      });

      setTradeBookings(map);
    } catch (err) {
      console.error('Error fetching trade bookings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTradeBookings(); }, [fetchTradeBookings]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('trade-bookings-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'job_sub_tasks',
      }, () => {
        fetchTradeBookings();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTradeBookings]);

  return { tradeBookings, isLoading, refetch: fetchTradeBookings };
}
