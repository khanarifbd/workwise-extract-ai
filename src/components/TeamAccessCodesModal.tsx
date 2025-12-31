import { useState } from 'react';
import { X, Plus, KeyRound, Trash2, RefreshCw, Check, XCircle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useTeamAccessCodes } from '@/hooks/useTeamAccessCodes';
import { cn } from '@/lib/utils';

interface TeamAccessCodesModalProps {
  onClose: () => void;
}

export const TeamAccessCodesModal = ({ onClose }: TeamAccessCodesModalProps) => {
  const { codes, isLoading, addCode, updateCode, deleteCode, refreshCodes } = useTeamAccessCodes();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newAccessCode, setNewAccessCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState('');

  const handleAdd = async () => {
    if (!newTeamName.trim() || !newAccessCode.trim()) return;
    setIsAdding(true);
    const success = await addCode(newTeamName.trim(), newAccessCode.trim());
    if (success) {
      setNewTeamName('');
      setNewAccessCode('');
      setShowAddForm(false);
    }
    setIsAdding(false);
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await updateCode(id, { isActive: !currentStatus });
  };

  const handleDelete = async (id: string, teamName: string) => {
    if (confirm(`Delete access code for ${teamName}?`)) {
      await deleteCode(id);
    }
  };

  const handleStartEdit = (id: string, currentCode: string) => {
    setEditingId(id);
    setEditingCode(currentCode);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingCode.trim()) {
      await updateCode(id, { accessCode: editingCode.trim() });
    }
    setEditingId(null);
    setEditingCode('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingCode('');
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col animate-scale-in" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team Access Codes</h2>
              <p className="text-xs text-muted-foreground">Manage PIN codes for team portal access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={refreshCodes}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ minHeight: 0 }}>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : (
            <>
              {/* Add New Form */}
              {showAddForm ? (
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                  <h4 className="font-medium text-sm">Add New Team Access Code</h4>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Team name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Access code"
                      value={newAccessCode}
                      onChange={(e) => setNewAccessCode(e.target.value.toUpperCase())}
                      className="w-32 uppercase font-mono"
                      maxLength={8}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAdd} disabled={isAdding || !newTeamName.trim() || !newAccessCode.trim()}>
                      {isAdding ? 'Adding...' : 'Add Code'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setShowAddForm(true)} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Team Code
                </Button>
              )}

              {/* Codes List */}
              <div className="space-y-2">
                {codes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No access codes configured</p>
                ) : (
                  codes.map((code) => (
                    <div
                      key={code.id}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-lg border",
                        code.isActive ? "border-border bg-muted/20" : "border-destructive/30 bg-destructive/5"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {code.isActive ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                        )}
                        <span className="font-medium truncate">{code.teamName}</span>
                      </div>
                      
                      {editingId === code.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingCode}
                            onChange={(e) => setEditingCode(e.target.value.toUpperCase())}
                            className="w-28 h-8 font-mono text-sm tracking-wider uppercase"
                            maxLength={8}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(code.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleSaveEdit(code.id)}>
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleCancelEdit}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <code className="px-3 py-1 bg-muted rounded font-mono text-sm tracking-wider">
                            {code.accessCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleStartEdit(code.id, code.accessCode)}
                            title="Edit access code"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Active</span>
                          <Switch
                            checked={code.isActive}
                            onCheckedChange={() => handleToggleActive(code.id, code.isActive)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(code.id, code.teamName)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            Teams use these codes to access the portal at /team
          </p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
