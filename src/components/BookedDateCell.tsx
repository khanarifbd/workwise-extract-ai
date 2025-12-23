import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, CalendarCheck, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookedDateCellProps {
  bookedDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

export const BookedDateCell = ({ bookedDate, onDateChange }: BookedDateCellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
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
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSetBooked = () => {
    setShowDatePicker(true);
  };

  const handleDateInput = (value: string) => {
    setInputValue(value);
    if (value) {
      onDateChange(new Date(value));
      setIsOpen(false);
      setShowDatePicker(false);
    }
  };

  const handleSetUnbooked = () => {
    onDateChange(null);
    setInputValue('');
    setIsOpen(false);
    setShowDatePicker(false);
  };

  const isBooked = !!bookedDate;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors",
          isBooked 
            ? "bg-amber-500 text-white hover:bg-amber-600" 
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {isBooked ? (
          <>
            <CalendarCheck className="w-3 h-3" />
            <span>{format(bookedDate, 'dd/MM/yy')}</span>
            <span className="font-bold uppercase">BOOKED</span>
          </>
        ) : (
          <>
            <CalendarX className="w-3 h-3" />
            <span>UnBooked</span>
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-2 min-w-[180px]">
            {!showDatePicker ? (
              <div className="space-y-1">
                <button
                  onClick={handleSetBooked}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left",
                    isBooked 
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" 
                      : "hover:bg-muted"
                  )}
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span className="font-medium">Booked</span>
                  {isBooked && (
                    <span className="text-xs ml-auto">{format(bookedDate, 'dd/MM/yy')}</span>
                  )}
                </button>
                
                <button
                  onClick={handleSetUnbooked}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left",
                    !isBooked 
                      ? "bg-muted text-foreground" 
                      : "hover:bg-muted"
                  )}
                >
                  <CalendarX className="w-4 h-4" />
                  <span className="font-medium">UnBooked</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Select Booked Date</label>
                <input
                  type="date"
                  value={inputValue}
                  onChange={(e) => handleDateInput(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                  autoFocus
                />
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  ← Back
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
