export interface SOROption {
  code: string;
  description: string;
  cost: number;
  isPremium?: boolean;
}

export interface ConvertedWorkItem {
  id: string;
  description: string;
  options: SOROption[];
  selectedOptionIndex: number;
  qty: number;
}
