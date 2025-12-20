import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookedDateCellProps {
  bookedDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

export const BookedDateCell = ({ bookedDate, onDateChange }: BookedDateCellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(
    bookedDate ? format(bookedDate, 'yyyy-MM-dd') : ''
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(bookedDate ? format(bookedDate, 'yyyy-MM-dd') : '');
  }, [bookedDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDateInput = (value: string) => {
    setInputValue(value);
    if (value) {
      onDateChange(new Date(value));
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateChange(null);
    setInputValue('');
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
          bookedDate 
            ? "bg-primary/10 text-primary hover:bg-primary/20" 
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        <Calendar className="w-3 h-3" />
        {bookedDate ? format(bookedDate, 'dd/MM/yy') : 'Not Booked'}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-2 min-w-[180px]">
            <div className="space-y-2">
              <input
                type="date"
                value={inputValue}
                onChange={(e) => handleDateInput(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background text-foreground"
                autoFocus
              />
              
              {bookedDate && (
                <button
                  onClick={handleClear}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear Booked Date
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
