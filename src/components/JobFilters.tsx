import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ALLSAINTS_TEAMS } from '@/types/job';
import { Search, Filter, X, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface FilterState {
  search: string;
  team: string;
  status: string;
  sorCode: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

interface JobFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableSorCodes: string[];
}

export const JobFilters = ({ filters, onFiltersChange, availableSorCodes }: JobFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      team: '',
      status: '',
      sorCode: '',
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  const activeFilterCount = [
    filters.team,
    filters.status,
    filters.sorCode,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs, names, addresses..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9 h-8 text-sm"
          />
          {filters.search && (
            <button
              onClick={() => updateFilter('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Advanced Filters Toggle */}
        <Button
          variant={showAdvanced ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="h-8 text-xs"
        >
          <Filter className="w-3 h-3 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs text-muted-foreground"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
          {/* Team Filter */}
          <Select value={filters.team} onValueChange={(v) => updateFilter('team', v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {ALLSAINTS_TEAMS.map((team) => (
                <SelectItem key={team.id} value={team.name}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    {team.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="not-started">Not Started</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {/* SOR Code Filter */}
          <Select value={filters.sorCode} onValueChange={(v) => updateFilter('sorCode', v)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All SOR Codes" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">All SOR Codes</SelectItem>
              {availableSorCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  <span className="font-mono text-xs">{code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs justify-start",
                  !filters.dateFrom && "text-muted-foreground"
                )}
              >
                <CalendarDays className="w-3 h-3 mr-1" />
                {filters.dateFrom ? format(filters.dateFrom, 'dd/MM/yy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom}
                onSelect={(date) => updateFilter('dateFrom', date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs justify-start",
                  !filters.dateTo && "text-muted-foreground"
                )}
              >
                <CalendarDays className="w-3 h-3 mr-1" />
                {filters.dateTo ? format(filters.dateTo, 'dd/MM/yy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo}
                onSelect={(date) => updateFilter('dateTo', date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {(filters.dateFrom || filters.dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                updateFilter('dateFrom', undefined);
                updateFilter('dateTo', undefined);
              }}
              className="h-8 text-xs text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" />
              Clear dates
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
