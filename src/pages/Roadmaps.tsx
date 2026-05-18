import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoadmaps } from '@/hooks/useRoadmaps';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, ArrowLeft, CalendarRange, Workflow, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const Roadmaps = () => {
  const navigate = useNavigate();
  const { roadmaps, isLoading, create, remove } = useRoadmaps();
  const { categories } = useCategories();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    start_date: '',
    end_date: '',
    time_unit: 'week' as 'week' | 'day',
  });

  const handleCreate = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error('Fill in name, start and end dates');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be after start date');
      return;
    }
    const r = await create({
      name: form.name,
      category_id: form.category_id || null,
      start_date: form.start_date,
      end_date: form.end_date,
      time_unit: form.time_unit,
    });
    setOpen(false);
    setForm({ name: '', category_id: '', start_date: '', end_date: '', time_unit: 'week' });
    navigate(`/roadmaps/${r.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Jobs Database
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2"><Workflow className="w-5 h-5" /> Roadmaps</h1>
            <p className="text-xs text-muted-foreground">Plan, track and manage refurbishment projects end-to-end.</p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New roadmap
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-20"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : roadmaps.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-xl">
            <Workflow className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No roadmaps yet — create your first project plan.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New roadmap</Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmaps.map(r => {
              const cat = categories.find(c => c.id === r.category_id);
              return (
                <div key={r.id} className="group border rounded-xl p-4 bg-card hover:shadow-md transition cursor-pointer"
                  onClick={() => navigate(`/roadmaps/${r.id}`)}>
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold truncate">{r.name}</h3>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${r.name}"?`)) remove(r.id); }}
                      className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <CalendarRange className="w-3 h-3" />
                    {r.start_date} → {r.end_date}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {cat && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                        style={{ background: `${cat.color}20`, color: cat.color }}>
                        {cat.name}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {r.time_unit === 'week' ? 'Weekly view' : 'Daily view'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New roadmap</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Project name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. 14 Elm Road refurb" />
            </div>
            <div>
              <Label>Stream (optional)</Label>
              <Select value={form.category_id || 'none'} onValueChange={v => setForm({ ...form, category_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Standalone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Standalone (no stream)</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Time axis</Label>
              <Select value={form.time_unit} onValueChange={(v: 'week'|'day') => setForm({ ...form, time_unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weeks</SelectItem>
                  <SelectItem value="day">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create & open</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Roadmaps;
