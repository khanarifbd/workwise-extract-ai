import { useState } from 'react';
import { Plus, KeyRound, Trash2, RefreshCw, Check, XCircle, Pencil, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useTeamAccessCodes } from '@/hooks/useTeamAccessCodes';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  const handleToggleOpsManager = async (id: string, currentStatus: boolean) => {
    await updateCode(id, { isOpsManager: !currentStatus });
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

  const handleStartEditName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingName(currentName);
  };

  const handleSaveEditName = async (id: string) => {
    if (editingName.trim()) {
      await updateCode(id, { teamName: editingName.trim() });
    }
    setEditingNameId(null);
    setEditingName('');
  };

  const handleCancelEditName = () => {
    setEditingNameId(null);
    setEditingName('');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Team Access Codes</DialogTitle>
                <DialogDescription className="text-xs">
                  Manage PIN codes for team portal access
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={refreshCodes} className="h-8 w-8">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content - Native scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-5 pb-24">
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading...</div>
            ) : (
              <>
                {/* Add New Form */}
                {showAddForm ? (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 mb-4">
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
                  <Button variant="outline" onClick={() => setShowAddForm(true)} className="w-full mb-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Team Code
                  </Button>
                )}

                {/* Codes List - Full display grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {codes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm col-span-full">No access codes configured</p>
                  ) : (
                    codes.map((code) => (
                      <div
                        key={code.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border",
                          code.isActive ? "border-border bg-muted/20" : "border-destructive/30 bg-destructive/5"
                        )}
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {code.isActive ? (
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                          )}
                          {editingNameId === code.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-7 text-sm flex-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditName(code.id);
                                  if (e.key === 'Escape') handleCancelEditName();
                                }}
                              />
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveEditName(code.id)}>
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCancelEditName}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-sm font-medium truncate">{code.teamName}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => handleStartEditName(code.id, code.teamName)}
                                title="Edit team name"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {editingId === code.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingCode}
                              onChange={(e) => setEditingCode(e.target.value.toUpperCase())}
                              className="w-20 h-7 font-mono text-xs tracking-wider uppercase"
                              maxLength={8}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(code.id);
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveEdit(code.id)}>
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCancelEdit}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <code className="px-2 py-1 bg-muted rounded text-xs font-mono tracking-wider">
                              {code.accessCode}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleStartEdit(code.id, code.accessCode)}
                              title="Edit access code"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {/* Ops Manager Toggle */}
                          <div className="flex items-center gap-1" title="Operations Manager receives ALL notifications">
                            <Crown className={cn("w-3.5 h-3.5", code.isOpsManager ? "text-amber-500" : "text-muted-foreground/40")} />
                            <Switch
                              checked={code.isOpsManager}
                              onCheckedChange={() => handleToggleOpsManager(code.id, code.isOpsManager)}
                              className="scale-75"
                            />
                          </div>
                          {/* Active Toggle */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">Active</span>
                            <Switch
                              checked={code.isActive}
                              onCheckedChange={() => handleToggleActive(code.id, code.isActive)}
                              className="scale-75"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(code.id, code.teamName)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground mt-6">
              Teams use these codes to access the portal at /team. 
              <span className="inline-flex items-center gap-1 ml-1">
                <Crown className="w-3 h-3 text-amber-500" /> = Operations Manager (receives ALL notifications & sees ALL jobs)
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
