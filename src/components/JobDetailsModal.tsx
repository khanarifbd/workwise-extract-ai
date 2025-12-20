import { useState } from 'react';
import { Job, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  X, 
  Save, 
  Wand2, 
  Plus, 
  Trash2, 
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIWorkConverter } from './AIWorkConverter';
import { AttachmentUpload } from './AttachmentUpload';
import { searchSORCodes, SORCode } from '@/data/sorCodes';

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

  const handleSave = () => {
    onUpdate(editedJob);
    onClose();
  };

  const updateWorkItem = (index: number, field: keyof WorkItem, value: string | number) => {
    const newWorkItems = [...editedJob.workItems];
    newWorkItems[index] = { ...newWorkItems[index], [field]: value };
    setEditedJob({ ...editedJob, workItems: newWorkItems });
  };

  const addWorkItem = () => {
    setEditedJob({
      ...editedJob,
      workItems: [
        ...editedJob.workItems,
        { id: crypto.randomUUID(), description: '', sorCode: '', qty: 1, cost: 0 }
      ]
    });
  };

  const removeWorkItem = (index: number) => {
    setEditedJob({
      ...editedJob,
      workItems: editedJob.workItems.filter((_, i) => i !== index)
    });
  };

  const updateAdditionalWork = (index: number, field: keyof WorkItem, value: string | number) => {
    const newAdditionalWorks = [...editedJob.additionalWorks];
    newAdditionalWorks[index] = { ...newAdditionalWorks[index], [field]: value };
    setEditedJob({ ...editedJob, additionalWorks: newAdditionalWorks });
  };

  const addAdditionalWork = () => {
    setEditedJob({
      ...editedJob,
      additionalWorks: [
        ...editedJob.additionalWorks,
        { id: crypto.randomUUID(), description: '', sorCode: '', qty: 1, cost: 0 }
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
    return items.reduce((sum, item) => sum + (item.qty * item.cost), 0);
  };

  const handleSORSearch = (term: string, index: number, isAdditional: boolean = false) => {
    setSorSearchTerm(term);
    setSorSearchIndex(index);
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

  const renderWorkItemEditor = (
    item: WorkItem, 
    index: number, 
    isAdditional: boolean,
    updateFn: (index: number, field: keyof WorkItem, value: string | number) => void,
    removeFn: (index: number) => void
  ) => (
    <div key={item.id} className="flex gap-2 items-start p-3 bg-muted/30 rounded-lg">
      <div className="flex-1 space-y-2">
        <Input
          placeholder="Description"
          value={item.description}
          onChange={(e) => updateFn(index, 'description', e.target.value)}
          className="text-sm"
        />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="flex gap-1">
              <Input
                placeholder="SOR Code"
                value={item.sorCode}
                onChange={(e) => {
                  updateFn(index, 'sorCode', e.target.value);
                  handleSORSearch(e.target.value, index, isAdditional);
                }}
                onFocus={() => {
                  if (item.sorCode.length >= 2) {
                    handleSORSearch(item.sorCode, index, isAdditional);
                  }
                }}
                className="w-28 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setSorSearchIndex(sorSearchIndex === index ? null : index);
                  setSorSearchTerm('');
                }}
              >
                <Search className="w-3 h-3" />
              </Button>
            </div>
            {sorSearchIndex === index && sorSearchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                {sorSearchResults.map((sor) => (
                  <button
                    key={sor.code}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                    onClick={() => selectSORCode(sor.code, index, isAdditional)}
                  >
                    <span className="font-mono text-primary">{sor.code}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{sor.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            type="number"
            placeholder="Qty"
            value={item.qty}
            onChange={(e) => updateFn(index, 'qty', parseInt(e.target.value) || 0)}
            className="w-16 text-sm"
          />
          <Input
            type="number"
            placeholder="Cost"
            value={item.cost}
            onChange={(e) => updateFn(index, 'cost', parseFloat(e.target.value) || 0)}
            className="w-24 text-sm"
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeFn(index)}
        className="text-destructive hover:text-destructive h-8 w-8"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );

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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">Works List</h3>
                  <p className="text-xs text-muted-foreground">
                    Total: £{getTotalCost(editedJob.workItems).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAIConverter(true)}>
                    <Wand2 className="w-3 h-3 mr-1" />
                    AI Convert
                  </Button>
                  <Button size="sm" onClick={addWorkItem}>
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

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {editedJob.workItems.map((item, index) => 
                  renderWorkItemEditor(item, index, false, updateWorkItem, removeWorkItem)
                )}
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">Additional Works (Variations)</h3>
                  <p className="text-xs text-muted-foreground">
                    Total: £{getTotalCost(editedJob.additionalWorks).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAdditionalAI(true)}>
                    <Wand2 className="w-3 h-3 mr-1" />
                    AI Convert
                  </Button>
                  <Button size="sm" onClick={addAdditionalWork}>
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

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {editedJob.additionalWorks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No additional works added yet</p>
                    <p className="text-xs">Use the AI converter or add items manually</p>
                  </div>
                ) : (
                  editedJob.additionalWorks.map((item, index) => 
                    renderWorkItemEditor(item, index, true, updateAdditionalWork, removeAdditionalWork)
                  )
                )}
              </div>
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
