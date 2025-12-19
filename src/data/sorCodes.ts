export interface SORCode {
  code: string;
  description: string;
  category: string;
  keywords: string[];
}

// Comprehensive SOR 7.2 v2 codes database
export const SOR_CODES_DATABASE: SORCode[] = [
  // Foundations & Groundworks
  { code: '0101AA', description: 'Concrete foundation strip', category: 'Foundations', keywords: ['foundation', 'concrete', 'strip', 'base'] },
  { code: '0101AB', description: 'Concrete foundation pad', category: 'Foundations', keywords: ['foundation', 'pad', 'concrete', 'base'] },
  { code: '0102AA', description: 'Excavation and disposal', category: 'Groundworks', keywords: ['excavate', 'dig', 'disposal', 'soil', 'earth'] },
  { code: '0102AB', description: 'Hardcore bed preparation', category: 'Groundworks', keywords: ['hardcore', 'bed', 'preparation', 'ground'] },
  
  // Drainage
  { code: '0201AA', description: 'Clear blocked drain', category: 'Drainage', keywords: ['drain', 'blocked', 'clear', 'unblock', 'blockage'] },
  { code: '0201AB', description: 'CCTV drain survey', category: 'Drainage', keywords: ['drain', 'survey', 'cctv', 'camera', 'inspection'] },
  { code: '0202AA', description: 'Replace drain pipe section', category: 'Drainage', keywords: ['drain', 'pipe', 'replace', 'section'] },
  { code: '0202AB', description: 'Repair manhole cover', category: 'Drainage', keywords: ['manhole', 'cover', 'repair', 'lid'] },
  { code: '0203AA', description: 'Install new gulley', category: 'Drainage', keywords: ['gulley', 'gully', 'install', 'new', 'drain'] },
  
  // Roofing
  { code: '0301AA', description: 'Replace roof tiles', category: 'Roofing', keywords: ['roof', 'tiles', 'replace', 'tile', 'roofing'] },
  { code: '0301AB', description: 'Repair ridge tiles', category: 'Roofing', keywords: ['ridge', 'tiles', 'repair', 'roof'] },
  { code: '0302AA', description: 'Replace lead flashing', category: 'Roofing', keywords: ['lead', 'flashing', 'replace', 'roof'] },
  { code: '0302AB', description: 'Repair felt roofing', category: 'Roofing', keywords: ['felt', 'roofing', 'repair', 'flat'] },
  { code: '0303AA', description: 'Repair/replace guttering', category: 'Roofing', keywords: ['gutter', 'guttering', 'repair', 'replace', 'downpipe'] },
  { code: '0303AB', description: 'Clear gutters and downpipes', category: 'Roofing', keywords: ['gutter', 'clear', 'clean', 'downpipe', 'blocked'] },
  { code: '0304AA', description: 'Chimney repair and repoint', category: 'Roofing', keywords: ['chimney', 'repair', 'repoint', 'stack'] },
  
  // Plumbing
  { code: '0401AA', description: 'Repair leaking tap', category: 'Plumbing', keywords: ['tap', 'leak', 'leaking', 'drip', 'washer'] },
  { code: '0401AB', description: 'Replace tap', category: 'Plumbing', keywords: ['tap', 'replace', 'new', 'mixer'] },
  { code: '0402AA', description: 'Repair WC', category: 'Plumbing', keywords: ['wc', 'toilet', 'repair', 'cistern', 'flush'] },
  { code: '0402AB', description: 'Replace WC pan and cistern', category: 'Plumbing', keywords: ['wc', 'toilet', 'replace', 'pan', 'cistern'] },
  { code: '0403AA', description: 'Repair bath/shower', category: 'Plumbing', keywords: ['bath', 'shower', 'repair', 'leak'] },
  { code: '0403AB', description: 'Replace bath panel', category: 'Plumbing', keywords: ['bath', 'panel', 'replace'] },
  { code: '0404AA', description: 'Repair basin', category: 'Plumbing', keywords: ['basin', 'sink', 'repair', 'leak'] },
  { code: '0404AB', description: 'Replace basin', category: 'Plumbing', keywords: ['basin', 'sink', 'replace', 'new'] },
  { code: '0405AA', description: 'Clear blocked waste pipe', category: 'Plumbing', keywords: ['waste', 'blocked', 'pipe', 'clear', 'blockage'] },
  { code: '0406AA', description: 'Repair radiator leak', category: 'Plumbing', keywords: ['radiator', 'leak', 'repair', 'heating'] },
  { code: '0406AB', description: 'Replace radiator', category: 'Plumbing', keywords: ['radiator', 'replace', 'new', 'heating'] },
  { code: '0406AC', description: 'Replace radiator valve', category: 'Plumbing', keywords: ['radiator', 'valve', 'trv', 'replace'] },
  { code: '0407AA', description: 'Repair boiler', category: 'Plumbing', keywords: ['boiler', 'repair', 'heating', 'service'] },
  { code: '0407AB', description: 'Service boiler', category: 'Plumbing', keywords: ['boiler', 'service', 'annual', 'maintenance'] },
  { code: '0408AA', description: 'Repair hot water cylinder', category: 'Plumbing', keywords: ['cylinder', 'hot water', 'repair', 'tank'] },
  { code: '0409AA', description: 'Repair/replace stopcock', category: 'Plumbing', keywords: ['stopcock', 'stop cock', 'valve', 'mains'] },
  
  // Electrical
  { code: '0501AA', description: 'Replace light fitting', category: 'Electrical', keywords: ['light', 'fitting', 'replace', 'lamp', 'ceiling'] },
  { code: '0501AB', description: 'Repair light fitting', category: 'Electrical', keywords: ['light', 'fitting', 'repair', 'lamp'] },
  { code: '0502AA', description: 'Replace socket outlet', category: 'Electrical', keywords: ['socket', 'outlet', 'replace', 'power', 'plug'] },
  { code: '0502AB', description: 'Repair socket outlet', category: 'Electrical', keywords: ['socket', 'outlet', 'repair', 'power'] },
  { code: '0503AA', description: 'Replace switch', category: 'Electrical', keywords: ['switch', 'replace', 'light switch'] },
  { code: '0504AA', description: 'Repair/replace consumer unit', category: 'Electrical', keywords: ['consumer', 'unit', 'fuse', 'board', 'trip'] },
  { code: '0505AA', description: 'Install smoke detector', category: 'Electrical', keywords: ['smoke', 'detector', 'alarm', 'install'] },
  { code: '0505AB', description: 'Replace smoke detector battery', category: 'Electrical', keywords: ['smoke', 'detector', 'battery', 'replace'] },
  { code: '0506AA', description: 'Install CO detector', category: 'Electrical', keywords: ['co', 'carbon', 'monoxide', 'detector'] },
  { code: '0507AA', description: 'Electrical test and inspection', category: 'Electrical', keywords: ['electrical', 'test', 'inspection', 'eicr'] },
  { code: '0508AA', description: 'Replace extractor fan', category: 'Electrical', keywords: ['extractor', 'fan', 'replace', 'ventilation'] },
  
  // Windows & Glazing
  { code: '0601AA', description: 'Replace broken window pane', category: 'Windows', keywords: ['window', 'glass', 'broken', 'pane', 'glazing', 'smashed'] },
  { code: '0601AB', description: 'Replace double glazed unit', category: 'Windows', keywords: ['window', 'double', 'glazed', 'unit', 'dgu', 'misted'] },
  { code: '0602AA', description: 'Repair window frame', category: 'Windows', keywords: ['window', 'frame', 'repair', 'rotten', 'timber'] },
  { code: '0602AB', description: 'Replace window frame', category: 'Windows', keywords: ['window', 'frame', 'replace', 'upvc', 'timber'] },
  { code: '0603AA', description: 'Repair window lock/handle', category: 'Windows', keywords: ['window', 'lock', 'handle', 'repair', 'broken'] },
  { code: '0603AB', description: 'Replace window lock/handle', category: 'Windows', keywords: ['window', 'lock', 'handle', 'replace'] },
  { code: '0604AA', description: 'Adjust window', category: 'Windows', keywords: ['window', 'adjust', 'sticking', 'alignment'] },
  { code: '0605AA', description: 'Draught proof window', category: 'Windows', keywords: ['window', 'draught', 'seal', 'weather'] },
  
  // Doors
  { code: '0701AA', description: 'Repair external door', category: 'Doors', keywords: ['door', 'external', 'front', 'back', 'repair'] },
  { code: '0701AB', description: 'Replace external door', category: 'Doors', keywords: ['door', 'external', 'front', 'back', 'replace'] },
  { code: '0702AA', description: 'Repair internal door', category: 'Doors', keywords: ['door', 'internal', 'repair', 'bedroom', 'bathroom'] },
  { code: '0702AB', description: 'Replace internal door', category: 'Doors', keywords: ['door', 'internal', 'replace', 'new'] },
  { code: '0703AA', description: 'Repair door lock', category: 'Doors', keywords: ['door', 'lock', 'repair', 'mechanism'] },
  { code: '0703AB', description: 'Replace door lock', category: 'Doors', keywords: ['door', 'lock', 'replace', 'new', 'cylinder'] },
  { code: '0704AA', description: 'Repair door handle', category: 'Doors', keywords: ['door', 'handle', 'repair', 'lever'] },
  { code: '0704AB', description: 'Replace door handle', category: 'Doors', keywords: ['door', 'handle', 'replace', 'lever'] },
  { code: '0705AA', description: 'Adjust door', category: 'Doors', keywords: ['door', 'adjust', 'sticking', 'binding', 'plane'] },
  { code: '0706AA', description: 'Replace door closer', category: 'Doors', keywords: ['door', 'closer', 'replace', 'fire'] },
  { code: '0707AA', description: 'Repair/replace letterbox', category: 'Doors', keywords: ['letterbox', 'letter', 'box', 'repair', 'replace'] },
  
  // Plastering & Internal Walls
  { code: '0801AA', description: 'Repair internal plaster', category: 'Plastering', keywords: ['plaster', 'wall', 'repair', 'patch', 'hole'] },
  { code: '0801AB', description: 'Replaster wall', category: 'Plastering', keywords: ['plaster', 'wall', 'replaster', 'skim'] },
  { code: '0802AA', description: 'Repair plasterboard', category: 'Plastering', keywords: ['plasterboard', 'drywall', 'repair', 'hole'] },
  { code: '0802AB', description: 'Replace plasterboard section', category: 'Plastering', keywords: ['plasterboard', 'replace', 'section'] },
  { code: '0803AA', description: 'Repair ceiling', category: 'Plastering', keywords: ['ceiling', 'repair', 'plaster', 'crack'] },
  { code: '0803AB', description: 'Replace ceiling section', category: 'Plastering', keywords: ['ceiling', 'replace', 'section'] },
  { code: '0804AA', description: 'Make good around pipes', category: 'Plastering', keywords: ['pipe', 'make good', 'plaster', 'boxing'] },
  
  // Decorating
  { code: '0901AA', description: 'Decorate room - emulsion walls', category: 'Decorating', keywords: ['paint', 'decorate', 'emulsion', 'walls', 'room'] },
  { code: '0901AB', description: 'Decorate room - gloss woodwork', category: 'Decorating', keywords: ['paint', 'decorate', 'gloss', 'woodwork', 'skirting'] },
  { code: '0902AA', description: 'Prepare and paint external walls', category: 'Decorating', keywords: ['external', 'paint', 'masonry', 'render'] },
  { code: '0902AB', description: 'Prepare and paint external woodwork', category: 'Decorating', keywords: ['external', 'paint', 'woodwork', 'fascia'] },
  { code: '0903AA', description: 'Make good after works', category: 'Decorating', keywords: ['make good', 'touch up', 'repair', 'decorate'] },
  
  // Flooring
  { code: '1001AA', description: 'Repair floor boards', category: 'Flooring', keywords: ['floor', 'boards', 'repair', 'floorboard', 'creaking'] },
  { code: '1001AB', description: 'Replace floor boards', category: 'Flooring', keywords: ['floor', 'boards', 'replace', 'floorboard'] },
  { code: '1002AA', description: 'Repair vinyl flooring', category: 'Flooring', keywords: ['vinyl', 'floor', 'repair', 'lino'] },
  { code: '1002AB', description: 'Replace vinyl flooring', category: 'Flooring', keywords: ['vinyl', 'floor', 'replace', 'lino'] },
  { code: '1003AA', description: 'Repair carpet/threshold', category: 'Flooring', keywords: ['carpet', 'threshold', 'repair', 'strip'] },
  { code: '1004AA', description: 'Repair tiles', category: 'Flooring', keywords: ['tile', 'floor', 'repair', 'cracked'] },
  { code: '1004AB', description: 'Replace tiles', category: 'Flooring', keywords: ['tile', 'floor', 'replace', 'ceramic'] },
  
  // Joinery
  { code: '1101AA', description: 'Repair skirting board', category: 'Joinery', keywords: ['skirting', 'board', 'repair'] },
  { code: '1101AB', description: 'Replace skirting board', category: 'Joinery', keywords: ['skirting', 'board', 'replace'] },
  { code: '1102AA', description: 'Repair architrave', category: 'Joinery', keywords: ['architrave', 'repair', 'door frame'] },
  { code: '1102AB', description: 'Replace architrave', category: 'Joinery', keywords: ['architrave', 'replace', 'door frame'] },
  { code: '1103AA', description: 'Repair staircase', category: 'Joinery', keywords: ['stair', 'stairs', 'staircase', 'repair', 'baluster'] },
  { code: '1103AB', description: 'Repair handrail', category: 'Joinery', keywords: ['handrail', 'banister', 'repair', 'loose'] },
  { code: '1104AA', description: 'Repair kitchen unit', category: 'Joinery', keywords: ['kitchen', 'unit', 'cupboard', 'repair', 'door'] },
  { code: '1104AB', description: 'Replace kitchen unit door', category: 'Joinery', keywords: ['kitchen', 'unit', 'door', 'replace'] },
  { code: '1105AA', description: 'Repair worktop', category: 'Joinery', keywords: ['worktop', 'counter', 'repair', 'kitchen'] },
  { code: '1105AB', description: 'Replace worktop section', category: 'Joinery', keywords: ['worktop', 'counter', 'replace', 'kitchen'] },
  
  // External Works
  { code: '1201AA', description: 'Repair fencing', category: 'External', keywords: ['fence', 'fencing', 'repair', 'panel', 'post'] },
  { code: '1201AB', description: 'Replace fence panel', category: 'External', keywords: ['fence', 'panel', 'replace'] },
  { code: '1201AC', description: 'Replace fence post', category: 'External', keywords: ['fence', 'post', 'replace', 'concrete'] },
  { code: '1202AA', description: 'Repair garden gate', category: 'External', keywords: ['gate', 'garden', 'repair', 'hinge'] },
  { code: '1202AB', description: 'Replace garden gate', category: 'External', keywords: ['gate', 'garden', 'replace'] },
  { code: '1203AA', description: 'Repair path/paving', category: 'External', keywords: ['path', 'paving', 'repair', 'slab', 'trip'] },
  { code: '1203AB', description: 'Replace paving slabs', category: 'External', keywords: ['paving', 'slab', 'replace', 'path'] },
  { code: '1204AA', description: 'Repair external wall', category: 'External', keywords: ['external', 'wall', 'repair', 'brick', 'repoint'] },
  { code: '1205AA', description: 'Repair steps', category: 'External', keywords: ['steps', 'repair', 'external', 'concrete'] },
  
  // Damp & Ventilation
  { code: '1301AA', description: 'Treat mould growth', category: 'Damp', keywords: ['mould', 'mold', 'treat', 'fungicidal'] },
  { code: '1301AB', description: 'Investigate damp', category: 'Damp', keywords: ['damp', 'investigate', 'survey', 'moisture'] },
  { code: '1302AA', description: 'Install air brick', category: 'Ventilation', keywords: ['air', 'brick', 'ventilation', 'install'] },
  { code: '1302AB', description: 'Clear blocked air brick', category: 'Ventilation', keywords: ['air', 'brick', 'blocked', 'clear'] },
  { code: '1303AA', description: 'Install trickle vent', category: 'Ventilation', keywords: ['trickle', 'vent', 'window', 'ventilation'] },
  
  // Security
  { code: '1401AA', description: 'Emergency boarding up', category: 'Security', keywords: ['boarding', 'emergency', 'secure', 'break'] },
  { code: '1401AB', description: 'Remove boarding', category: 'Security', keywords: ['boarding', 'remove', 'unboard'] },
  { code: '1402AA', description: 'Repair door entry system', category: 'Security', keywords: ['entry', 'system', 'intercom', 'door', 'repair'] },
  { code: '1402AB', description: 'Replace door entry handset', category: 'Security', keywords: ['entry', 'handset', 'intercom', 'replace'] },
  
  // General
  { code: '9901AA', description: 'Preliminary inspection', category: 'General', keywords: ['inspect', 'inspection', 'survey', 'preliminary'] },
  { code: '9902AA', description: 'Clear and clean after works', category: 'General', keywords: ['clear', 'clean', 'rubbish', 'disposal'] },
  { code: '9903AA', description: 'Asbestos inspection required', category: 'General', keywords: ['asbestos', 'inspect', 'survey', 'sample'] },
];

// Keyword matching for SOR codes
export const SOR_KEYWORDS: Record<string, string[]> = {};
SOR_CODES_DATABASE.forEach(sor => {
  SOR_KEYWORDS[sor.code] = sor.keywords;
});

// Find matching SOR code based on description
export const findMatchingSORCode = (description: string): { code: string; confidence: number } => {
  const lowerDesc = description.toLowerCase();
  let bestMatch = { code: 'MANUAL', confidence: 0 };
  
  for (const sor of SOR_CODES_DATABASE) {
    let matchCount = 0;
    let totalKeywords = sor.keywords.length;
    
    for (const keyword of sor.keywords) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    const confidence = matchCount / totalKeywords;
    
    if (confidence > bestMatch.confidence) {
      bestMatch = { code: sor.code, confidence };
    }
  }
  
  // Only return code if confidence is above threshold
  return bestMatch.confidence >= 0.3 ? bestMatch : { code: 'MANUAL', confidence: 0 };
};

// Search SOR codes by term
export const searchSORCodes = (term: string): SORCode[] => {
  const lowerTerm = term.toLowerCase();
  return SOR_CODES_DATABASE.filter(sor => 
    sor.code.toLowerCase().includes(lowerTerm) ||
    sor.description.toLowerCase().includes(lowerTerm) ||
    sor.category.toLowerCase().includes(lowerTerm) ||
    sor.keywords.some(k => k.toLowerCase().includes(lowerTerm))
  ).slice(0, 10);
};

// Get SOR code details
export const getSORCodeDetails = (code: string): SORCode | undefined => {
  return SOR_CODES_DATABASE.find(sor => sor.code === code);
};
