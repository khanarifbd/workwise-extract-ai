import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BookOpen, ChevronDown, Edit2, Sparkles, Save, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { SimpleMarkdown } from "@/lib/simpleMarkdown";

interface Props {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  canEdit?: boolean;
  defaultOpen?: boolean;
}

export const CategoryGuidelinesPanel = ({
  categoryId,
  categoryName,
  categoryColor = "#3B82F6",
  canEdit = false,
  defaultOpen = false,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("category_guidelines")
        .select("content")
        .eq("category_id", categoryId)
        .maybeSingle();
      if (cancelled) return;
      setContent(data?.content || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("category_guidelines")
        .upsert(
          { category_id: categoryId, content: draft },
          { onConflict: "category_id" },
        );
      if (error) throw error;
      setContent(draft);
      setEditing(false);
      toast({ title: "Guidelines saved", description: `${categoryName} guidelines updated.` });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e.message || "Could not save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAIFormat = async () => {
    if (!draft.trim()) {
      toast({ title: "Nothing to format", description: "Paste or type some notes first." });
      return;
    }
    setFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke("format-guidelines", {
        body: { rawText: draft, categoryName },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.formatted) {
        setDraft(data.formatted);
        toast({ title: "AI formatted", description: "Review and save when ready." });
      }
    } catch (e: any) {
      toast({
        title: "AI formatting failed",
        description: e.message || "Try again shortly",
        variant: "destructive",
      });
    } finally {
      setFormatting(false);
    }
  };

  return (
    <div
      className="rounded-xl border-2 bg-card overflow-hidden mb-3 shadow-sm"
      style={{ borderColor: `${categoryColor}40` }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{ backgroundColor: `${categoryColor}12` }}
        >
          <CollapsibleTrigger className="flex items-center gap-2.5 flex-1 text-left group min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: categoryColor }}
            >
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                NPH Guidelines
              </div>
              <div className="text-sm font-bold truncate" style={{ color: categoryColor }}>
                {categoryName} — rules, expectations & timescales
              </div>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground transition-transform flex-shrink-0",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          {canEdit && !editing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
              className="h-8 gap-1"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="px-4 py-3 border-t border-border/40">
            {loading ? (
              <div className="text-sm text-muted-foreground py-2">Loading guidelines…</div>
            ) : editing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    Paste raw notes or write freely — use AI Format for clean structure.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAIFormat}
                      disabled={formatting}
                      className="gap-1.5"
                    >
                      {formatting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      )}
                      AI Format
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Paste NPH guidelines, rules, timescales, contacts, escalation steps…"
                  className="min-h-[260px] text-sm font-mono"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    Save guidelines
                  </Button>
                </div>
                {draft.trim() && (
                  <div className="border-t border-border/40 pt-3">
                    <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">
                      Preview
                    </p>
                    <div className="rounded-lg bg-muted/30 p-3 max-h-[300px] overflow-auto">
                      <SimpleMarkdown source={draft} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <SimpleMarkdown source={content} />
                {!content.trim() && canEdit && (
                  <Button size="sm" variant="outline" onClick={startEdit} className="mt-2">
                    <Edit2 className="w-4 h-4 mr-1" /> Add guidelines
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
