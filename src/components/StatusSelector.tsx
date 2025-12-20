import { useState } from 'react';
import { JobStatus, JOB_STATUS_OPTIONS } from '@/types/job';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusSelectorProps {
  currentStatus: JobStatus;
  onSelect: (status: JobStatus) => void;
}

export const StatusSelector = ({ currentStatus, onSelect }: StatusSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentOption = JOB_STATUS_OPTIONS.find(o => o.value === currentStatus) || JOB_STATUS_OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
          "hover:opacity-80 border border-transparent hover:border-border"
        )}
        style={{ 
          backgroundColor: `${currentOption.color}20`,
          color: currentOption.color 
        }}
      >
        <div 
          className="w-2 h-2 rounded-full" 
          style={{ backgroundColor: currentOption.color }}
        />
        {currentOption.label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-1 min-w-[140px]">
            {JOB_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors",
                  "hover:bg-muted",
                  currentStatus === option.value && "bg-muted"
                )}
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
