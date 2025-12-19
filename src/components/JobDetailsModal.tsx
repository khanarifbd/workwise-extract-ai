import { useState } from 'react';
import { Job, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  X, 
  Save, 
  Wand2, 
  Plus, 
  Trash2, 
  Upload, 
  FileText, 
  Image as ImageIcon,
  Video,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIWorkConverter } from './AIWorkConverter';

interface JobDetailsModalProps {
  job: Job;
  onClose: () => void;
  onUpdate: (job: Job) => void;
}

export const JobDetailsModal = ({ job, onClose, onUpdate }: JobDetailsModalProps) => {
  const [editedJob, setEditedJob] = useState<Job>({ ...job });
  const [showAIConverter, setShowAIConverter] = useState(false);
  const [showAdditionalAI, setShowAdditionalAI] = useState(false);

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

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Job #{editedJob.jobNumber}
            </h2>
            <p className="text-sm text-muted-foreground">{editedJob.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="works">Works & SOR Codes</TabsTrigger>
              <TabsTrigger value="additional">Additional Works</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Job Number</label>
                  <Input
                    value={editedJob.jobNumber}
                    onChange={(e) => setEditedJob({ ...editedJob, jobNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name</label>
                  <Input
                    value={editedJob.name}
                    onChange={(e) => setEditedJob({ ...editedJob, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Phone Number</label>
                  <Input
                    value={editedJob.phoneNumber}
                    onChange={(e) => setEditedJob({ ...editedJob, phoneNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Address</label>
                  <Input
                    value={editedJob.address}
                    onChange={(e) => setEditedJob({ ...editedJob, address: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Summary of Works</label>
                <Textarea
                  value={editedJob.summaryOfWorks}
                  onChange={(e) => setEditedJob({ ...editedJob, summaryOfWorks: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Full Description</label>
                <Textarea
                  value={editedJob.description}
                  onChange={(e) => setEditedJob({ ...editedJob, description: e.target.value })}
                  className="min-h-[150px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="works" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Works List</h3>
                  <p className="text-sm text-muted-foreground">
                    Total: £{getTotalCost(editedJob.workItems).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAIConverter(true)}>
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI Convert Description
                  </Button>
                  <Button size="sm" onClick={addWorkItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </div>

              {showAIConverter && (
                <AIWorkConverter
                  onConvert={handleAIConvert}
                  onClose={() => setShowAIConverter(false)}
                />
              )}

              <div className="space-y-3">
                {editedJob.workItems.map((item, index) => (
                  <div key={item.id} className="flex gap-3 items-start p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateWorkItem(index, 'description', e.target.value)}
                        className="mb-2"
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="SOR Code"
                          value={item.sorCode}
                          onChange={(e) => updateWorkItem(index, 'sorCode', e.target.value)}
                          className="w-32 font-mono"
                        />
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) => updateWorkItem(index, 'qty', parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                        <Input
                          type="number"
                          placeholder="Cost"
                          value={item.cost}
                          onChange={(e) => updateWorkItem(index, 'cost', parseFloat(e.target.value) || 0)}
                          className="w-28"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeWorkItem(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Additional Works (Variations)</h3>
                  <p className="text-sm text-muted-foreground">
                    Total: £{getTotalCost(editedJob.additionalWorks).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAdditionalAI(true)}>
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI Convert Description
                  </Button>
                  <Button size="sm" onClick={addAdditionalWork}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </div>

              {showAdditionalAI && (
                <AIWorkConverter
                  onConvert={handleAdditionalAIConvert}
                  onClose={() => setShowAdditionalAI(false)}
                />
              )}

              <div className="space-y-3">
                {editedJob.additionalWorks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No additional works added yet</p>
                    <p className="text-sm">Use the AI converter or add items manually</p>
                  </div>
                ) : (
                  editedJob.additionalWorks.map((item, index) => (
                    <div key={item.id} className="flex gap-3 items-start p-3 bg-muted/30 rounded-lg">
                      <div className="flex-1">
                        <Input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateAdditionalWork(index, 'description', e.target.value)}
                          className="mb-2"
                        />
                        <div className="flex gap-2">
                          <Input
                            placeholder="SOR Code"
                            value={item.sorCode}
                            onChange={(e) => updateAdditionalWork(index, 'sorCode', e.target.value)}
                            className="w-32 font-mono"
                          />
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.qty}
                            onChange={(e) => updateAdditionalWork(index, 'qty', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                          <Input
                            type="number"
                            placeholder="Cost"
                            value={item.cost}
                            onChange={(e) => updateAdditionalWork(index, 'cost', parseFloat(e.target.value) || 0)}
                            className="w-28"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAdditionalWork(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="attachments" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Attachments</h3>
                <Button size="sm">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Files
                </Button>
              </div>

              {editedJob.attachments.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No attachments yet</p>
                  <p className="text-sm text-muted-foreground">
                    Upload photos, videos, or documents
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {editedJob.attachments.map((attachment) => (
                    <div 
                      key={attachment.id}
                      className="p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center mb-2">
                        {attachment.type === 'image' && <ImageIcon className="w-8 h-8 text-muted-foreground" />}
                        {attachment.type === 'video' && <Video className="w-8 h-8 text-muted-foreground" />}
                        {attachment.type === 'document' && <FileText className="w-8 h-8 text-muted-foreground" />}
                      </div>
                      <p className="text-sm font-medium truncate">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {attachment.uploadedAt.toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
