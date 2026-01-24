export interface InsulationInfo {
  type: string; // e.g., "Loft Insulation", "Cavity Wall", "External Wall"
  quantity: number;
  location: string;
  thickness?: string; // e.g., "270mm", "100mm"
  material?: string; // e.g., "Mineral Wool", "PIR Board", "EPS"
  manualOverride?: boolean; // When true, auto-scan should not overwrite this
}

// Common insulation types in UK property maintenance
export const INSULATION_TYPES = [
  'Loft Insulation',
  'Cavity Wall Insulation',
  'External Wall Insulation',
  'Internal Wall Insulation',
  'Floor Insulation',
  'Pipe Insulation',
  'Tank Insulation',
  'Draught Proofing',
  'Underfloor Insulation',
] as const;

export const INSULATION_MATERIALS = [
  'Mineral Wool',
  'Glass Wool',
  'PIR Board',
  'EPS (Expanded Polystyrene)',
  'XPS (Extruded Polystyrene)',
  'Cellulose',
  'Sheep Wool',
  'Hemp',
  'Spray Foam',
] as const;
