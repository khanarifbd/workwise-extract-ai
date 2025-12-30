import { useState } from 'react';
import { Job, WorkItem, JOB_STATUS_OPTIONS, JobStatus } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  X, 
  Save, 
  Wand2, 
  Plus,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { AIWorkConverter } from './AIWorkConverter';
import { AttachmentUpload } from './AttachmentUpload';
import { SortableWorkItem } from './SortableWorkItem';
import { searchSORCodes, SORCode } from '@/data/sorCodes';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { format } from 'date-fns';

interface JobDetailsModalProps {
  job: Job;
  onClose: () => void;
  onUpdate: (job: Job) => void;
}

export const JobDetailsModal = ({ job, onClose, onUpdate }: JobDetailsModalProps) => {
  const [editedJob, setEditedJob] = useState<Job>({ ...job });
  const [showAIConverter, setShowAIConverter] = useState(false);
  const [showAdditionalAI, setShowAdditionalAI] = useState(false);
  const [sorSearchIndex, setSorSearchIndex] = useState<number | null>(null);
  const [sorSearchTerm, setSorSearchTerm] = useState('');
  const [sorSearchResults, setSorSearchResults] = useState<SORCode[]>([]);
  const [isAdditionalSearch, setIsAdditionalSearch] = useState(false);
  const [worksExpanded, setWorksExpanded] = useState(false);
  const [additionalExpanded, setAdditionalExpanded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSave = () => {
    onUpdate(editedJob);
    onClose();
  };

  const updateWorkItem = (index: number, field: keyof WorkItem, value: string | number | boolean) => {
    const newWorkItems = [...editedJob.workItems];
    newWorkItems[index] = { ...newWorkItems[index], [field]: value };
    setEditedJob({ ...editedJob, workItems: newWorkItems });
  };

  const addWorkItem = () => {
    setEditedJob({
      ...editedJob,
      workItems: [
        ...editedJob.workItems,
        { id: crypto.randomUUID(), description: '', sorCode: '', qty: 1, cost: 0, isConfirmed: true }
      ]
    });
  };

  const removeWorkItem = (index: number) => {
    setEditedJob({
      ...editedJob,
      workItems: editedJob.workItems.filter((_, i) => i !== index)
    });
  };

  const updateAdditionalWork = (index: number, field: keyof WorkItem, value: string | number | boolean) => {
    const newAdditionalWorks = [...editedJob.additionalWorks];
    newAdditionalWorks[index] = { ...newAdditionalWorks[index], [field]: value };
    setEditedJob({ ...editedJob, additionalWorks: newAdditionalWorks });
  };

  const addAdditionalWork = () => {
    setEditedJob({
      ...editedJob,
      additionalWorks: [
        ...editedJob.additionalWorks,
        { id: crypto.randomUUID(), description: '', sorCode: '', qty: 1, cost: 0, isConfirmed: true }
      ]
    });
  };

  const removeAdditionalWork = (index: number) => {
    setEditedJob({
      ...editedJob,
      additionalWorks: editedJob.additionalWorks.filter((_, i) => i !== index)
    });
  };

  const handleAIConvert = (workItems: WorkItem[]) => {
    setEditedJob({ ...editedJob, workItems: [...editedJob.workItems, ...workItems] });
    setShowAIConverter(false);
  };

  const handleAdditionalAIConvert = (workItems: WorkItem[]) => {
    setEditedJob({ ...editedJob, additionalWorks: [...editedJob.additionalWorks, ...workItems] });
    setShowAdditionalAI(false);
  };

  const getTotalCost = (items: WorkItem[]) => {
    // Only count confirmed items in the total
    return items
      .filter(item => item.isConfirmed !== false)
      .reduce((sum, item) => sum + (item.qty * item.cost), 0);
  };

  const handleSORSearch = (term: string, index: number, isAdditional: boolean = false) => {
    setSorSearchTerm(term);
    setSorSearchIndex(index);
    setIsAdditionalSearch(isAdditional);
    if (term.length >= 2) {
      const results = searchSORCodes(term);
      setSorSearchResults(results);
    } else {
      setSorSearchResults([]);
    }
  };

  const selectSORCode = (code: string, index: number, isAdditional: boolean = false) => {
    if (isAdditional) {
      updateAdditionalWork(index, 'sorCode', code);
    } else {
      updateWorkItem(index, 'sorCode', code);
    }
    setSorSearchIndex(null);
    setSorSearchTerm('');
    setSorSearchResults([]);
  };

  const handleDragEnd = (event: DragEndEvent, isAdditional: boolean) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const items = isAdditional ? editedJob.additionalWorks : editedJob.workItems;
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      
      if (isAdditional) {
        setEditedJob({ ...editedJob, additionalWorks: newItems });
      } else {
        setEditedJob({ ...editedJob, workItems: newItems });
      }
    }
  };

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd');
  };

  const handleDateChange = (field: 'startDate' | 'completionDate' | 'bookedDate', value: string) => {
    const newDate = value ? new Date(value) : null;
    let updates: Partial<Job> = { [field]: newDate };
    
    // Auto-update progress based on dates
    if (field === 'startDate' && newDate && editedJob.progress === 0) {
      updates.progress = 10; // Job started
    }
    if (field === 'completionDate' && newDate) {
      updates.progress = 100;
      updates.isCompleted = true;
    }
    // If completion date is cleared, mark as not completed
    if (field === 'completionDate' && !newDate && editedJob.isCompleted) {
      updates.isCompleted = false;
      updates.progress = editedJob.startDate ? 50 : 0;
    }
    
    setEditedJob({ ...editedJob, ...updates });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Job #{editedJob.jobNumber}
            </h2>
            <p className="text-xs text-muted-foreground">{editedJob.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-64px)]">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="works" className="text-xs">Works & SOR</TabsTrigger>
              <TabsTrigger value="additional" className="text-xs">Additional</TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs">Attachments</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Job Number</label>
                  <Input
                    value={editedJob.jobNumber}
                    onChange={(e) => setEditedJob({ ...editedJob, jobNumber: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Name</label>
                  <Input
                    value={editedJob.name}
                    onChange={(e) => setEditedJob({ ...editedJob, name: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Phone Number</label>
                  <Input
                    value={editedJob.phoneNumber}
                    onChange={(e) => setEditedJob({ ...editedJob, phoneNumber: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Address</label>
                  <Input
                    value={editedJob.address}
                    onChange={(e) => setEditedJob({ ...editedJob, address: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Booked Date
                  </label>
                  <Input
                    type="date"
                    value={formatDateForInput(editedJob.bookedDate)}
                    onChange={(e) => handleDateChange('bookedDate', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={formatDateForInput(editedJob.startDate)}
                    onChange={(e) => handleDateChange('startDate', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Completion Date
                  </label>
                  <Input
                    type="date"
                    value={formatDateForInput(editedJob.completionDate)}
                    onChange={(e) => handleDateChange('completionDate', e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <Textarea
                  value={editedJob.description}
                  onChange={(e) => setEditedJob({ ...editedJob, description: e.target.value })}
                  className="min-h-[120px] text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="works" className="space-y-4">
              <Collapsible open={worksExpanded} onOpenChange={setWorksExpanded}>
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors">
                      <ChevronDown className={`w-4 h-4 transition-transform ${worksExpanded ? 'rotate-180' : ''}`} />
                      <div className="text-left">
                        <h3 className="font-medium text-sm">Works List ({editedJob.workItems.length})</h3>
                        <p className="text-xs text-muted-foreground">
                          Total: £{getTotalCost(editedJob.workItems).toLocaleString()} • Click to {worksExpanded ? 'collapse' : 'expand'}
                        </p>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAIConverter(true)}>
                      <Wand2 className="w-3 h-3 mr-1" />
                      AI Convert
                    </Button>
                    <Button size="sm" onClick={() => { addWorkItem(); setWorksExpanded(true); }}>
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>

                {showAIConverter && (
                  <AIWorkConverter
                    onConvert={handleAIConvert}
                    onClose={() => setShowAIConverter(false)}
                  />
                )}

                <CollapsibleContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleDragEnd(e, false)}
                  >
                    <SortableContext
                      items={editedJob.workItems.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2 max-h-[400px] overflow-y-auto mt-3">
                        {editedJob.workItems.map((item, index) => (
                          <SortableWorkItem
                            key={item.id}
                            item={item}
                            index={index}
                            isAdditional={false}
                            updateFn={updateWorkItem}
                            removeFn={removeWorkItem}
                            onSORSearch={handleSORSearch}
                            sorSearchIndex={!isAdditionalSearch ? sorSearchIndex : null}
                            sorSearchResults={sorSearchResults}
                            onSelectSOR={selectSORCode}
                            onToggleSearch={(idx) => {
                              setSorSearchIndex(sorSearchIndex === idx && !isAdditionalSearch ? null : idx);
                              setIsAdditionalSearch(false);
                              setSorSearchTerm('');
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <Collapsible open={additionalExpanded} onOpenChange={setAdditionalExpanded}>
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors">
                      <ChevronDown className={`w-4 h-4 transition-transform ${additionalExpanded ? 'rotate-180' : ''}`} />
                      <div className="text-left">
                        <h3 className="font-medium text-sm">Additional Works ({editedJob.additionalWorks.length})</h3>
                        <p className="text-xs text-muted-foreground">
                          Total: £{getTotalCost(editedJob.additionalWorks).toLocaleString()} • Click to {additionalExpanded ? 'collapse' : 'expand'}
                        </p>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAdditionalAI(true)}>
                      <Wand2 className="w-3 h-3 mr-1" />
                      AI Convert
                    </Button>
                    <Button size="sm" onClick={() => { addAdditionalWork(); setAdditionalExpanded(true); }}>
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>

                {showAdditionalAI && (
                  <AIWorkConverter
                    onConvert={handleAdditionalAIConvert}
                    onClose={() => setShowAdditionalAI(false)}
                  />
                )}

                <CollapsibleContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleDragEnd(e, true)}
                  >
                    <SortableContext
                      items={editedJob.additionalWorks.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2 max-h-[400px] overflow-y-auto mt-3">
                        {editedJob.additionalWorks.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <p className="text-sm">No additional works added yet</p>
                            <p className="text-xs">Use the AI converter or add items manually</p>
                          </div>
                        ) : (
                          editedJob.additionalWorks.map((item, index) => (
                            <SortableWorkItem
                              key={item.id}
                              item={item}
                              index={index}
                              isAdditional={true}
                              updateFn={updateAdditionalWork}
                              removeFn={removeAdditionalWork}
                              onSORSearch={handleSORSearch}
                              sorSearchIndex={isAdditionalSearch ? sorSearchIndex : null}
                              sorSearchResults={sorSearchResults}
                              onSelectSOR={selectSORCode}
                              onToggleSearch={(idx) => {
                                setSorSearchIndex(sorSearchIndex === idx && isAdditionalSearch ? null : idx);
                                setIsAdditionalSearch(true);
                                setSorSearchTerm('');
                              }}
                            />
                          ))
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            <TabsContent value="attachments" className="space-y-4">
              <AttachmentUpload
                jobId={editedJob.id}
                attachments={editedJob.attachments}
                onAttachmentsChange={(attachments) => setEditedJob({ ...editedJob, attachments })}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
