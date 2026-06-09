import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { Search, Filter, X, CalendarDays, Bookmark, Save, FileDown, FileSpreadsheet, Fan, Calendar, Phone, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { FilterState, FilterPreset, STORAGE_KEY } from './filterTypes';

interface DMJobFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableSorCodes: string[];
  onExportPDF?: () => void;
  onExportExcel?: () => void;
}

export const DMJobFilters = ({ 
  filters, 
  onFiltersChange, 
  availableSorCodes, 
  onExportPDF, 
  onExportExcel 
}: DMJobFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { settings: teamSettings } = useTeamSettings();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY}-dm`);
    if (stored) {
      try {
        setPresets(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const savePresets = (newPresets: FilterPreset[]) => {
    setPresets(newPresets);
    localStorage.setItem(`${STORAGE_KEY}-dm`, JSON.stringify(newPresets));
  };

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
      hasFans: '',
      hasBookedDate: '',
      phoneNumber: '',
      signOffStatus: '',
      hasExternalAssignee: '',
    });
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) {
      toast({ title: 'Please enter a preset name', variant: 'destructive' });
      return;
    }
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: {
        team: filters.team,
        status: filters.status,
        sorCode: filters.sorCode,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        hasFans: filters.hasFans,
        hasBookedDate: filters.hasBookedDate,
        phoneNumber: filters.phoneNumber,
        signOffStatus: filters.signOffStatus,
        hasExternalAssignee: filters.hasExternalAssignee,
      },
    };
    savePresets([...presets, newPreset]);
    setPresetName('');
    setShowSavePreset(false);
    toast({ title: 'Preset saved!' });
  };

  const applyPreset = (preset: FilterPreset) => {
    onFiltersChange({
      ...filters,
      ...preset.filters,
    });
    toast({ title: `Applied: ${preset.name}` });
  };

  const deletePreset = (presetId: string) => {
    savePresets(presets.filter(p => p.id !== presetId));
    toast({ title: 'Preset deleted' });
  };

  const activeFilterCount = [
    filters.team,
    filters.status,
    filters.sorCode,
    filters.dateFrom,
    filters.dateTo,
    filters.hasFans,
    filters.hasBookedDate,
    filters.phoneNumber,
    filters.signOffStatus,
    filters.hasExternalAssignee,
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs, names, addresses..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9 h-9 text-sm"
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
          className="h-9 text-sm"
        >
          <Filter className="w-4 h-4 mr-1.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-1.5 h-5 w-5 p-0 text-xs flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Presets Dropdown */}
        {presets.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-sm">
                <Bookmark className="w-4 h-4 mr-1.5" />
                Presets
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {presets.map(preset => (
                  <div key={preset.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/50">
                    <button
                      onClick={() => applyPreset(preset)}
                      className="text-sm font-medium text-left flex-1 truncate"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => deletePreset(preset.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {activeFilterCount > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 text-sm text-muted-foreground"
            >
              Clear all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSavePreset(!showSavePreset)}
              className="h-9 text-sm"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Save Preset
            </Button>
          </>
        )}

        {/* Export Buttons */}
        <div className="flex items-center gap-1 ml-auto">
          {onExportPDF && (
            <Button variant="outline" size="sm" onClick={onExportPDF} className="h-9 text-sm">
              <FileDown className="w-4 h-4 mr-1.5" />
              PDF
            </Button>
          )}
          {onExportExcel && (
            <Button variant="outline" size="sm" onClick={onExportExcel} className="h-9 text-sm">
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              Excel
            </Button>
          )}
        </div>
      </div>

      {/* Save Preset Input */}
      {showSavePreset && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
          <Input
            placeholder="Preset name..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="h-9 flex-1 max-w-xs text-sm"
            onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
          />
          <Button size="sm" onClick={saveCurrentAsPreset} className="h-9">
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSavePreset(false)} className="h-9">
            Cancel
          </Button>
        </div>
      )}

      {/* Advanced Filters Panel - DM Specific */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
          {/* Team Filter - DM Teams */}
          <Select value={filters.team} onValueChange={(v) => updateFilter('team', v)}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {teamSettings.map((team) => (
                <SelectItem key={team.teamId} value={team.teamName}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: team.color || '#6B7280' }}
                    />
                    {team.teamName}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
            <SelectTrigger className="w-36 h-9 text-sm">
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
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="All SOR Codes" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">All SOR Codes</SelectItem>
              {availableSorCodes.filter(code => code && code.trim() !== '').map((code) => (
                <SelectItem key={code} value={code}>
                  <span className="font-mono text-sm">{code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Phone Number Filter */}
          <div className="relative">
            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Phone..."
              value={filters.phoneNumber || ''}
              onChange={(e) => updateFilter('phoneNumber', e.target.value)}
              className="pl-8 w-32 h-9 text-sm"
            />
          </div>

          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 text-sm justify-start",
                  !filters.dateFrom && "text-muted-foreground"
                )}
              >
                <CalendarDays className="w-4 h-4 mr-1.5" />
                {filters.dateFrom ? format(filters.dateFrom, 'dd/MM/yy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
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
                  "h-9 text-sm justify-start",
                  !filters.dateTo && "text-muted-foreground"
                )}
              >
                <CalendarDays className="w-4 h-4 mr-1.5" />
                {filters.dateTo ? format(filters.dateTo, 'dd/MM/yy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
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
              className="h-9 text-sm text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear dates
            </Button>
          )}

          {/* Fan Filter - DM categories can have fan info */}
          <Select value={filters.hasFans} onValueChange={(v) => updateFilter('hasFans', v)}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="All Fans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              <SelectItem value="with-fans">
                <div className="flex items-center gap-2">
                  <Fan className="w-3 h-3" />
                  With Fans
                </div>
              </SelectItem>
              <SelectItem value="no-fans">No Fans</SelectItem>
            </SelectContent>
          </Select>

          {/* Booked Date Filter */}
          <Select value={filters.hasBookedDate} onValueChange={(v) => updateFilter('hasBookedDate', v)}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              <SelectItem value="booked">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  Booked
                </div>
              </SelectItem>
              <SelectItem value="unbooked">Unbooked</SelectItem>
            </SelectContent>
          </Select>

          {/* Sign-Off Status Filter */}
          <Select value={filters.signOffStatus} onValueChange={(v) => updateFilter('signOffStatus', v)}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder="Sign-Off" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sign-Off</SelectItem>
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-3 h-3" />
                  Pending Sign-Off
                </div>
              </SelectItem>
              <SelectItem value="complete">All Signed Off</SelectItem>
            </SelectContent>
          </Select>

          {/* External Assignee Filter */}
          <Select value={filters.hasExternalAssignee} onValueChange={(v) => updateFilter('hasExternalAssignee', v)}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="External" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              <SelectItem value="with">👤 With External</SelectItem>
              <SelectItem value="without">No External</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
