import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TRADES } from '@/types/subTask';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, Plus, Search, Phone, Mail, User, Wrench,
  Loader2, Trash2, Edit2, Save, X, PhoneCall,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradeCompany {
  id: string;
  name: string;
  trade: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

interface TradeCompaniesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterTrade?: string;
}

export function TradeCompaniesModal({ open, onOpenChange, filterTrade }: TradeCompaniesModalProps) {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<TradeCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState(filterTrade || 'all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTrade, setFormTrade] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('trade_companies' as any)
        .select('*')
        .eq('is_active', true)
        .order('trade', { ascending: true });
      if (error) throw error;
      setCompanies((data || []) as unknown as TradeCompany[]);
    } catch (err) {
      console.error('Error fetching trade companies:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchCompanies();
  }, [open, fetchCompanies]);

  const resetForm = () => {
    setFormName('');
    setFormTrade('');
    setFormContactName('');
    setFormPhone('');
    setFormEmail('');
    setFormNotes('');
  };

  const startEdit = (c: TradeCompany) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormTrade(c.trade);
    setFormContactName(c.contact_name || '');
    setFormPhone(c.phone || '');
    setFormEmail(c.email || '');
    setFormNotes(c.notes || '');
    setShowAddForm(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formTrade.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        trade: formTrade.trim(),
        contact_name: formContactName.trim() || null,
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        notes: formNotes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('trade_companies' as any)
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Company updated' });
      } else {
        const { error } = await supabase
          .from('trade_companies' as any)
          .insert(payload);
        if (error) throw error;
        toast({ title: 'Company added' });
      }

      resetForm();
      setShowAddForm(false);
      setEditingId(null);
      await fetchCompanies();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error saving company', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await supabase.from('trade_companies' as any).update({ is_active: false }).eq('id', id);
      toast({ title: 'Company removed' });
      await fetchCompanies();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const filtered = companies.filter(c => {
    if (tradeFilter !== 'all' && c.trade !== tradeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        c.trade.toLowerCase().includes(q);
    }
    return true;
  });

  const uniqueTrades = Array.from(new Set(companies.map(c => c.trade))).sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Trade Companies & Contacts
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={tradeFilter} onValueChange={setTradeFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Trade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {uniqueTrades.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { setShowAddForm(true); setEditingId(null); resetForm(); }} className="h-8 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{editingId ? 'Edit Company' : 'Add New Company'}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setShowAddForm(false); setEditingId(null); resetForm(); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Company Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" placeholder="e.g. Smith Roofing Ltd" />
              </div>
              <div>
                <Label className="text-xs">Trade *</Label>
                <Select value={formTrade} onValueChange={setFormTrade}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select trade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_TRADES.filter(t => t !== 'Other').map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Contact Name</Label>
                <Input value={formContactName} onChange={(e) => setFormContactName(e.target.value)} className="h-8 text-sm" placeholder="e.g. John Smith" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="h-8 text-sm" placeholder="e.g. 07700 123456" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="h-8 text-sm" placeholder="e.g. info@company.com" />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="h-8 text-sm" placeholder="Availability, rates..." />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={!formName.trim() || !formTrade.trim() || isSaving} className="h-7 text-xs">
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* Company List */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No trade companies found.</p>
              <p className="text-xs mt-1">Add your first contractor above.</p>
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {filtered.map(c => (
                <div key={c.id} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          <Wrench className="h-2.5 w-2.5 mr-0.5" />
                          {c.trade}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {c.contact_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {c.contact_name}
                          </span>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-primary hover:underline">
                            <Mail className="h-3 w-3" /> {c.email}
                          </a>
                        )}
                      </div>
                      {c.notes && <p className="text-[11px] text-muted-foreground mt-1">{c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.phone && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <a href={`tel:${c.phone}`}>
                            <PhoneCall className="h-3 w-3 mr-1" /> Call
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(c)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
