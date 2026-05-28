import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Wrench } from "lucide-react";

interface TeamRow { teamId: string; teamName: string; }
interface SkillRow {
  team_id: string;
  team_name: string;
  skills: string[];
  strengths: string;
  weaknesses: string;
  proficiency_level: string;
  max_daily_jobs: number;
  notes: string;
}

const COMMON_SKILLS = [
  "Plumbing", "Electrics", "Carpentry", "Tiling", "Plastering",
  "Decorating", "Roofing", "Flooring", "Fan installation", "Fire doors",
  "Kitchen fitting", "Bathroom refit", "Damp & mould", "Insulation",
  "General repairs", "Painting", "Glazing", "Brickwork",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teams: TeamRow[];
  initialTeamId?: string;
}

export default function TeamSkillsManager({ open, onOpenChange, teams, initialTeamId }: Props) {
  const { toast } = useToast();
  const [activeTeamId, setActiveTeamId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<SkillRow | null>(null);
  const [newSkill, setNewSkill] = useState("");

  useEffect(() => {
    if (open) setActiveTeamId(initialTeamId || teams[0]?.teamId || "");
  }, [open, initialTeamId, teams]);

  useEffect(() => {
    if (!activeTeamId || !open) return;
    const team = teams.find(t => t.teamId === activeTeamId);
    if (!team) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("team_skills" as any)
        .select("*")
        .eq("team_id", activeTeamId)
        .maybeSingle();
      setRow(
        (data as any) || {
          team_id: activeTeamId,
          team_name: team.teamName,
          skills: [],
          strengths: "",
          weaknesses: "",
          proficiency_level: "experienced",
          max_daily_jobs: 3,
          notes: "",
        }
      );
      setLoading(false);
    })();
  }, [activeTeamId, open, teams]);

  const addSkill = (s: string) => {
    if (!row || !s.trim()) return;
    if (row.skills.includes(s.trim())) return;
    setRow({ ...row, skills: [...row.skills, s.trim()] });
    setNewSkill("");
  };
  const removeSkill = (s: string) => {
    if (!row) return;
    setRow({ ...row, skills: row.skills.filter(x => x !== s) });
  };

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase
      .from("team_skills" as any)
      .upsert(
        {
          team_id: row.team_id,
          team_name: row.team_name,
          skills: row.skills,
          strengths: row.strengths,
          weaknesses: row.weaknesses,
          proficiency_level: row.proficiency_level,
          max_daily_jobs: row.max_daily_jobs,
          notes: row.notes,
        },
        { onConflict: "team_id" }
      );
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Skills saved", description: `${row.team_name} profile updated.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Team Skillsets & Abilities
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <aside className="border border-border rounded-md p-2 space-y-1 max-h-[60vh] overflow-y-auto">
            {teams.map(t => (
              <button
                key={t.teamId}
                onClick={() => setActiveTeamId(t.teamId)}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition ${
                  activeTeamId === t.teamId
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {t.teamName}
              </button>
            ))}
          </aside>

          <div className="space-y-4">
            {loading || !row ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</label>
                  <div className="flex flex-wrap gap-1.5 mt-2 min-h-[32px]">
                    {row.skills.map(s => (
                      <Badge key={s} variant="secondary" className="gap-1">
                        {s}
                        <button onClick={() => removeSkill(s)} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Add custom skill…"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill(newSkill))}
                      className="h-9"
                    />
                    <Button size="sm" onClick={() => addSkill(newSkill)} disabled={!newSkill.trim()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {COMMON_SKILLS.filter(s => !row.skills.includes(s)).map(s => (
                      <button
                        key={s}
                        onClick={() => addSkill(s)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-border hover:bg-muted text-muted-foreground"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proficiency</label>
                    <Select value={row.proficiency_level} onValueChange={(v) => setRow({ ...row, proficiency_level: v })}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apprentice">Apprentice</SelectItem>
                        <SelectItem value="experienced">Experienced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max jobs / day</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={row.max_daily_jobs}
                      onChange={(e) => setRow({ ...row, max_daily_jobs: parseInt(e.target.value) || 1 })}
                      className="h-9 mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Strengths</label>
                  <Textarea
                    placeholder="e.g. Fast with bathroom refits, excellent at customer interaction…"
                    value={row.strengths}
                    onChange={(e) => setRow({ ...row, strengths: e.target.value })}
                    className="mt-1 min-h-[60px]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weaknesses / Avoid</label>
                  <Textarea
                    placeholder="e.g. Not qualified for gas work, struggles with complex electrical…"
                    value={row.weaknesses}
                    onChange={(e) => setRow({ ...row, weaknesses: e.target.value })}
                    className="mt-1 min-h-[60px]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatcher notes</label>
                  <Textarea
                    placeholder="Any extra guidance the AI should follow when assigning to this team…"
                    value={row.notes}
                    onChange={(e) => setRow({ ...row, notes: e.target.value })}
                    className="mt-1 min-h-[50px]"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={saving || !row}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
