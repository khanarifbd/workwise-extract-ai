import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, SlidersHorizontal, X, Save, CalendarIcon, ChevronDown, Trash2, FileDown, FileSpreadsheet, Home } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { FilterState, FilterPreset, STORAGE_KEY, getDefaultFilterState } from './filterTypes';

// Insulation Teams
const INSULATION_TEAMS = [
  { id: 'i1', name: 'Team Alpha' },
  { id: 'i2', name: 'Team Beta' },
  { id: 'i3', name: 'Team Gamma' },
];

interface InsulationJobFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableSorCodes?: string[];
  onExportPDF?: () => void;
  onExportExcel?: () => void;
}

export const InsulationJobFilters = ({
  filters,
  onFiltersChange,
  availableSorCodes = [],
  onExportPDF,
  onExportExcel,
}: InsulationJobFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Load presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load filter presets:', e);
      }
    }
  }, []);

  // Save presets to localStorage
  const savePresets = (newPresets: FilterPreset[]) => {
    setPresets(newPresets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPresets));
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange(getDefaultFilterState());
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    
    const { search, ...filtersWithoutSearch } = filters;
    const newPreset: FilterPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      filters: filtersWithoutSearch,
    };
    
    savePresets([...presets, newPreset]);
    setPresetName('');
    setShowSavePreset(false);
  };

  const applyPreset = (preset: FilterPreset) => {
    onFiltersChange({ ...filters, ...preset.filters });
  };

  const deletePreset = (presetId: string) => {
    savePresets(presets.filter(p => p.id !== presetId));
  };

  // Count active filters (excluding search)
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') return false;
    if (value === '' || value === undefined || value === null) return false;
    return true;
  }).length;

  return (
    <div className="space-y-3">
      {/* Top row: Search + Advanced toggle + Presets */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Advanced filters toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(activeFilterCount > 0 && "border-primary")}
        >
          <SlidersHorizontal className="w-4 h-4 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Presets dropdown */}
        {presets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Presets <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  className="flex items-center justify-between"
                >
                  <span 
                    onClick={() => applyPreset(preset)}
                    className="flex-1 cursor-pointer"
                  >
                    {preset.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 ml-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePreset(preset.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clear / Save buttons */}
        {activeFilterCount > 0 && (
          <>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear all
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowSavePreset(true)}
            >
              <Save className="w-4 h-4 mr-1" />
              Save Preset
            </Button>
          </>
        )}

        {/* Export buttons */}
        {onExportPDF && (
          <Button variant="outline" size="sm" onClick={onExportPDF}>
            <FileDown className="w-4 h-4 mr-1" />
            PDF
          </Button>
        )}
        {onExportExcel && (
          <Button variant="outline" size="sm" onClick={onExportExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Excel
          </Button>
        )}
      </div>

      {/* Save preset input */}
      {showSavePreset && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
          <Input
            placeholder="Preset name..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" onClick={saveCurrentAsPreset} disabled={!presetName.trim()}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSavePreset(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3 bg-muted/50 rounded-lg border">
          {/* Team filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Team</label>
            <Select value={filters.team} onValueChange={(v) => updateFilter('team', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All teams</SelectItem>
                {INSULATION_TEAMS.map((team) => (
                  <SelectItem key={team.id} value={team.name}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="pause">Pause</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SOR Code filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">SOR Code</label>
            <Select value={filters.sorCode} onValueChange={(v) => updateFilter('sorCode', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="All codes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All codes</SelectItem>
                {availableSorCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date From */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date From</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full h-8 justify-start text-left font-normal",
                    !filters.dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateFrom ? format(filters.dateFrom, "dd/MM/yy") : "Pick date"}
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
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date To</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full h-8 justify-start text-left font-normal",
                    !filters.dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateTo ? format(filters.dateTo, "dd/MM/yy") : "Pick date"}
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
          </div>

          {/* Insulation Units filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Home className="w-3 h-3" /> Insulation
            </label>
            <Select value={filters.hasFans} onValueChange={(v) => updateFilter('hasFans', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="yes">Has Insulation</SelectItem>
                <SelectItem value="no">No Insulation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Booked Date filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Booked</label>
            <Select value={filters.hasBookedDate} onValueChange={(v) => updateFilter('hasBookedDate', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="yes">Has Booking</SelectItem>
                <SelectItem value="no">Not Booked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sign-Off Status filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sign-Off</label>
            <Select value={filters.signOffStatus} onValueChange={(v) => updateFilter('signOffStatus', v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="signed_off">All Signed Off</SelectItem>
                <SelectItem value="pending">Pending Sign-Off</SelectItem>
                <SelectItem value="no_signoff">No Sign-Off</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
};
