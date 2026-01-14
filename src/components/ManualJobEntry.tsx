import { useState } from 'react';
import { PenLine, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Job } from '@/types/job';

interface ManualJobEntryProps {
  onJobCreate: (job: Omit<Job, 'id'>) => Promise<Job>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManualJobEntry = ({ onJobCreate, isOpen, onOpenChange }: ManualJobEntryProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '',
    name: '',
    address: '',
    phoneNumber: '',
    description: '',
    summaryOfWorks: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.jobNumber.trim() || !formData.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const newJob: Omit<Job, 'id'> = {
        jobNumber: formData.jobNumber.trim(),
        name: formData.name.trim(),
        address: formData.address.trim() || '',
        phoneNumber: formData.phoneNumber.trim() || '',
        description: formData.description.trim() || '',
        summaryOfWorks: formData.summaryOfWorks.trim() || '',
        workItems: [],
        additionalWorks: [],
        team: null,
        team2: null,
        progress: 0,
        progressNotes: '',
        isCompleted: false,
        createdAt: new Date(),
        dateIssued: new Date(),
        bookedDate: null,
        isFlexibleBooking: false,
        bookingNotes: '',
        startDate: null,
        completionDate: null,
        attachments: [],
        status: 'pending',
        fanInfo: null,
        linkedFanJobId: null,
        costs: null,
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
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.jobNumber.trim() && formData.name.trim();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" />
            Create New Job Manually
          </DialogTitle>
          <DialogDescription>
            Enter the job details below. Job Number and Tenant Name are required.
          </DialogDescription>
        </DialogHeader>

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
              className="w-full min-h-[120px] resize-y"
            />
          </div>
        </div>

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
};