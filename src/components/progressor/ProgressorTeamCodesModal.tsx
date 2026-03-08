import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Key, Plus, Trash2, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TeamCode {
  id: string;
  teamName: string;
  accessCode: string;
  isActive: boolean;
  createdAt: string;
}

interface ProgressorTeamCodesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PT';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

export const ProgressorTeamCodesModal = ({ open, onOpenChange }: ProgressorTeamCodesModalProps) => {
  const [codes, setCodes] = useState<TeamCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const fetchCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('progressor_team_codes')
        .select('*')
        .order('team_name');

      if (error) throw error;

      setCodes((data || []).map((row: any) => ({
        id: row.id,
        teamName: row.team_name,
        accessCode: row.access_code,
        isActive: row.is_active,
        createdAt: row.created_at,
      })));
    } catch (err) {
      console.error('Error fetching codes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchCodes();
  }, [open, fetchCodes]);

  const addCode = async () => {
    if (!newTeamName.trim()) return;
    setIsAdding(true);
    try {
      const code = generateCode();
      const { error } = await supabase.from('progressor_team_codes').insert({
        team_name: newTeamName.trim(),
        access_code: code,
      } as any);
      if (error) throw error;
      setNewTeamName('');
      await fetchCodes();
      toast({ title: 'Code Generated', description: `Access code ${code} created for ${newTeamName}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate code', variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const toggleActive = async (code: TeamCode) => {
    try {
      const { error } = await supabase
        .from('progressor_team_codes')
        .update({ is_active: !code.isActive } as any)
        .eq('id', code.id);
      if (error) throw error;
      setCodes(prev => prev.map(c => c.id === code.id ? { ...c, isActive: !c.isActive } : c));
    } catch (err) {
      console.error('Error toggling code:', err);
    }
  };

  const deleteCode = async (id: string) => {
    if (!confirm('Delete this access code? The team will lose access.')) return;
    try {
      const { error } = await supabase.from('progressor_team_codes').delete().eq('id', id);
      if (error) throw error;
      setCodes(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting code:', err);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Copied', description: `Code ${code} copied to clipboard` });
  };

  const regenerateCode = async (codeItem: TeamCode) => {
    const newCode = generateCode();
    try {
      const { error } = await supabase
        .from('progressor_team_codes')
        .update({ access_code: newCode } as any)
        .eq('id', codeItem.id);
      if (error) throw error;
      setCodes(prev => prev.map(c => c.id === codeItem.id ? { ...c, accessCode: newCode } : c));
      toast({ title: 'Regenerated', description: `New code ${newCode} for ${codeItem.teamName}` });
    } catch (err) {
      console.error('Error regenerating code:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Team Access Codes
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Generate unique codes for teams to access their jobs with limited editing (description & media only).
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new code */}
          <div className="flex gap-2">
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name (e.g. Indika, Bartek)..."
              className="text-sm h-9 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCode()}
            />
            <Button
              size="sm"
              onClick={addCode}
              disabled={!newTeamName.trim() || isAdding}
              className="h-9"
            >
              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Generate
            </Button>
          </div>

          {/* Codes list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No team codes generated yet. Add a team name above to create one.
            </p>
          ) : (
            <div className="space-y-2">
              {codes.map(code => (
                <div
                  key={code.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{code.teamName}</span>
                      <Badge
                        variant={code.isActive ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {code.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                        {code.accessCode}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => copyCode(code.accessCode)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => regenerateCode(code)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={code.isActive}
                      onCheckedChange={() => toggleActive(code)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => deleteCode(code.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-muted/50 border rounded-lg p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Share the access code with the team member</li>
              <li>They visit the Team Progressor Portal and enter the code</li>
              <li>They can only see their assigned jobs</li>
              <li>They can edit descriptions (type or voice record) and upload photos/videos</li>
              <li>All other fields are read-only</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
