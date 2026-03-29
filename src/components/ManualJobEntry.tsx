import { useState, useMemo, forwardRef } from 'react';
import { PenLine, Loader2, Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Job, WorkItem } from '@/types/job';
import { SOR_CODES_DATABASE, SORCode } from '@/data/sorCodes';

interface ManualJobEntryProps {
  onJobCreate: (job: Omit<Job, 'id'>) => Promise<Job>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WorkItemEntry {
  id: string;
  description: string;
  sorCode: string;
  qty: number;
  cost: number;
  isCustom: boolean;
}

// Get unique categories from SOR codes
const SOR_CATEGORIES = [...new Set(SOR_CODES_DATABASE.map(code => code.category))].sort();

export const ManualJobEntry = forwardRef<HTMLDivElement, ManualJobEntryProps>(({ onJobCreate, isOpen, onOpenChange }, ref) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '',
    name: '',
    address: '',
    phoneNumber: '',
    description: '',
    summaryOfWorks: '',
  });
  const [workItems, setWorkItems] = useState<WorkItemEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const filteredSorCodes = useMemo(() => {
    let codes = SOR_CODES_DATABASE;
    
    if (selectedCategory && selectedCategory !== 'all') {
      codes = codes.filter(c => c.category === selectedCategory);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      codes = codes.filter(c => 
        c.code.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        c.keywords.some(k => k.toLowerCase().includes(query))
      );
    }
    
    return codes.slice(0, 50); // Limit for performance
  }, [searchQuery, selectedCategory]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addWorkItem = () => {
    const newItem: WorkItemEntry = {
      id: crypto.randomUUID(),
      description: '',
      sorCode: '',
      qty: 1,
      cost: 0,
      isCustom: false,
    };
    setWorkItems(prev => [...prev, newItem]);
  };

  const removeWorkItem = (id: string) => {
    setWorkItems(prev => prev.filter(item => item.id !== id));
  };

  const updateWorkItem = (id: string, updates: Partial<WorkItemEntry>) => {
    setWorkItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const selectSorCode = (itemId: string, sorCode: SORCode) => {
    updateWorkItem(itemId, {
      description: sorCode.description,
      sorCode: sorCode.code,
      cost: sorCode.cost,
      isCustom: false,
    });
    setOpenPopoverId(null);
    setSearchQuery('');
  };

  const handleSubmit = async () => {
    if (!formData.jobNumber.trim() || !formData.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const mappedWorkItems: WorkItem[] = workItems
        .filter(item => item.description.trim())
        .map(item => ({
          id: item.id,
          description: item.description,
          sorCode: item.sorCode || 'CUSTOM',
          qty: item.qty,
          cost: item.cost,
          isConfirmed: true,
        }));

      const newJob: Omit<Job, 'id'> = {
        jobNumber: formData.jobNumber.trim(),
        name: formData.name.trim(),
        address: formData.address.trim() || '',
        phoneNumber: formData.phoneNumber.trim() || '',
        description: formData.description.trim() || '',
        summaryOfWorks: formData.summaryOfWorks.trim() || '',
        workItems: mappedWorkItems,
        additionalWorks: [],
        team: null,
        team2: null,
        progress: 0,
        progressNotes: '',
        isCompleted: false,
        isOngoing: false,
        ongoingReason: '',
        scheduledTrades: [],
        createdAt: new Date(),
        dateIssued: new Date(),
        bookedDate: null,
        isFlexibleBooking: false,
        bookingNotes: '',
        completionDate: null,
        attachments: [],
        status: 'pending',
        fanInfo: null,
        linkedFanJobId: null,
        insulationInfo: null,
        linkedInsulationJobId: null,
        costs: null,
        privateNotes: '',
        referBack: false,
        referBackReason: '',
        referBackDate: null,
        expectedCompletionDate: null,
        blockerType: null,
        blockerNotes: '',
        blockerSetAt: null,
        blockerChaseDate: null,
      };

      await onJobCreate(newJob);
      
      // Reset form and close modal
      setFormData({
        jobNumber: '',
        name: '',
        address: '',
        phoneNumber: '',
        description: '',
        summaryOfWorks: '',
      });
      setWorkItems([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.jobNumber.trim() && formData.name.trim();

  const totalCost = workItems.reduce((sum, item) => sum + (item.cost * item.qty), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" />
            Create New Job Manually
          </DialogTitle>
          <DialogDescription>
            Enter the job details below. Job Number and Tenant Name are required.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Required fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jobNumber" className="text-sm font-medium">
                  Job Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="jobNumber"
                  placeholder="e.g., JOB-001"
                  value={formData.jobNumber}
                  onChange={(e) => handleInputChange('jobNumber', e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Tenant Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., John Smith"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">
                  Address
                </Label>
                <Input
                  id="address"
                  placeholder="e.g., 123 Main Street, London"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm font-medium">
                  Phone Number
                </Label>
                <Input
                  id="phoneNumber"
                  placeholder="e.g., 07123 456789"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="summaryOfWorks" className="text-sm font-medium">
                Summary of Works
              </Label>
              <Input
                id="summaryOfWorks"
                placeholder="Brief summary of the work required"
                value={formData.summaryOfWorks}
                onChange={(e) => handleInputChange('summaryOfWorks', e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Description / Notes
              </Label>
              <Textarea
                id="description"
                placeholder="Detailed description of the job, work items, notes, etc."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full min-h-[80px] resize-y"
              />
            </div>

            {/* Work Items Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Work Items
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addWorkItem}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </Button>
              </div>

              {workItems.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                  No work items added yet. Click "Add Item" to start adding work items.
                </div>
              ) : (
                <div className="space-y-3">
                  {workItems.map((item, index) => (
                    <div key={item.id} className="p-3 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Item {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeWorkItem(item.id)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        {/* SOR Code Selection */}
                        <div className="sm:col-span-4 space-y-1">
                          <Label className="text-xs text-muted-foreground">SOR Code</Label>
                          <Popover 
                            open={openPopoverId === item.id} 
                            onOpenChange={(open) => {
                              setOpenPopoverId(open ? item.id : null);
                              if (!open) setSearchQuery('');
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between text-xs h-9"
                              >
                                {item.sorCode || 'Select SOR code...'}
                                <Search className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0" align="start">
                              <div className="p-2 border-b space-y-2">
                                <Input
                                  placeholder="Search SOR codes..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="h-8 text-sm"
                                />
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Filter by category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {SOR_CATEGORIES.map(cat => (
                                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <ScrollArea className="h-[200px]">
                                <div className="p-1">
                                  {filteredSorCodes.map(code => (
                                    <button
                                      key={code.code}
                                      onClick={() => selectSorCode(item.id, code)}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm flex justify-between items-center gap-2"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <span className="font-mono text-primary">{code.code}</span>
                                        <span className="text-muted-foreground"> - {code.description}</span>
                                      </div>
                                      <span className="font-medium shrink-0">£{code.cost}</span>
                                    </button>
                                  ))}
                                  {filteredSorCodes.length === 0 && (
                                    <div className="text-center py-4 text-muted-foreground text-xs">
                                      No matching SOR codes found
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                              <div className="p-2 border-t">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => {
                                    updateWorkItem(item.id, { isCustom: true, sorCode: 'CUSTOM' });
                                    setOpenPopoverId(null);
                                  }}
                                >
                                  Use Custom (No SOR Code)
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Description */}
                        <div className="sm:col-span-4 space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Input
                            placeholder="Work description"
                            value={item.description}
                            onChange={(e) => updateWorkItem(item.id, { description: e.target.value })}
                            className="h-9 text-xs"
                          />
                        </div>

                        {/* Quantity */}
                        <div className="sm:col-span-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => updateWorkItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="h-9 text-xs text-center"
                          />
                        </div>

                        {/* Cost */}
                        <div className="sm:col-span-2 space-y-1">
                          <Label className="text-xs text-muted-foreground">Cost (£)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cost}
                            onChange={(e) => updateWorkItem(item.id, { cost: parseFloat(e.target.value) || 0 })}
                            className="h-9 text-xs"
                            disabled={!item.isCustom && item.sorCode !== ''}
                          />
                        </div>

                        {/* Line Total */}
                        <div className="sm:col-span-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Total</Label>
                          <div className="h-9 flex items-center text-xs font-medium">
                            £{(item.qty * item.cost).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  {workItems.length > 0 && (
                    <div className="flex justify-end pt-2 border-t">
                      <div className="text-sm font-medium">
                        Total: <span className="text-primary">£{totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Job
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

ManualJobEntry.displayName = 'ManualJobEntry';
