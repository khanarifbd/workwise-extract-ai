import { useState } from 'react';
import { FanInfo } from '@/types/job';
import { Fan, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface FanEditorProps {
  fanInfo: FanInfo[] | null;
  onUpdate: (fanInfo: FanInfo[]) => void;
}

export const FanEditor = ({ fanInfo, onUpdate }: FanEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newFan, setNewFan] = useState<FanInfo>({ type: '', quantity: 1, location: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  // Filter out the "no fans" marker
  const actualFans = fanInfo?.filter(f => f.type !== '__SCANNED_NO_FANS__') || [];
  const totalCount = actualFans.reduce((sum, fan) => sum + fan.quantity, 0);

  const handleUpdateFan = (index: number, updates: Partial<FanInfo>) => {
    const updated = [...actualFans];
    updated[index] = { ...updated[index], ...updates };
    onUpdate(updated);
  };

  const handleDeleteFan = (index: number) => {
    const updated = actualFans.filter((_, i) => i !== index);
    onUpdate(updated);
  };

  const handleAddFan = () => {
    if (!newFan.type.trim()) return;
    onUpdate([...actualFans, { ...newFan }]);
    setNewFan({ type: '', quantity: 1, location: '' });
    setShowAddForm(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="flex flex-col gap-1 items-start">
          {totalCount > 0 ? (
            <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30">
              <Fan className="w-3 h-3 mr-1" />
              {totalCount}
              <Edit2 className="w-2.5 h-2.5 ml-1 opacity-60" />
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Fan className="w-3 h-3 mr-1" />
              Add Fans
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Fan className="w-4 h-4 text-cyan-500" />
              Fan Details
            </h4>
            <span className="text-xs text-muted-foreground">
              Total: {totalCount}
            </span>
          </div>

          {/* Fan List */}
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {actualFans.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No fans added</p>
            ) : (
              actualFans.map((fan, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                >
                  {editingIndex === index ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={fan.type}
                        onChange={(e) => handleUpdateFan(index, { type: e.target.value })}
                        placeholder="Fan type"
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={fan.quantity}
                          onChange={(e) => handleUpdateFan(index, { quantity: parseInt(e.target.value) || 1 })}
                          placeholder="Qty"
                          className="h-7 text-xs w-16"
                          min={1}
                        />
                        <Input
                          value={fan.location}
                          onChange={(e) => handleUpdateFan(index, { location: e.target.value })}
                          placeholder="Location"
                          className="h-7 text-xs flex-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-7"
                        onClick={() => setEditingIndex(null)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Done
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{fan.type}</span>
                          <Badge variant="secondary" className="text-xs px-1.5">
                            x{fan.quantity}
                          </Badge>
                        </div>
                        {fan.location && (
                          <p className="text-xs text-muted-foreground truncate">{fan.location}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setEditingIndex(index)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteFan(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add New Fan */}
          {showAddForm ? (
            <div className="space-y-2 p-2 border border-dashed border-border rounded-lg">
              <Input
                value={newFan.type}
                onChange={(e) => setNewFan({ ...newFan, type: e.target.value })}
                placeholder="Fan type (e.g., Extractor Fan)"
                className="h-7 text-xs"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={newFan.quantity}
                  onChange={(e) => setNewFan({ ...newFan, quantity: parseInt(e.target.value) || 1 })}
                  placeholder="Qty"
                  className="h-7 text-xs w-16"
                  min={1}
                />
                <Input
                  value={newFan.location}
                  onChange={(e) => setNewFan({ ...newFan, location: e.target.value })}
                  placeholder="Location (optional)"
                  className="h-7 text-xs flex-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewFan({ type: '', quantity: 1, location: '' });
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7"
                  onClick={handleAddFan}
                  disabled={!newFan.type.trim()}
                >
                  <Check className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Fan
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
