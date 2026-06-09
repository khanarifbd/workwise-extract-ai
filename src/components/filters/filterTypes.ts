export interface FilterState {
  search: string;
  team: string;
  status: string;
  sorCode: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  hasFans: string;
  hasBookedDate: string;
  phoneNumber: string;
  signOffStatus: string;
  hasExternalAssignee: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: Omit<FilterState, 'search'>;
}

export const STORAGE_KEY = 'job-filter-presets';

export const getDefaultFilterState = (): FilterState => ({
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
