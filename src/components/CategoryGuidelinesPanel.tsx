import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BookOpen, ChevronDown, Edit2, Sparkles, Save, X, Loader2, Smartphone, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { SimpleMarkdown } from "@/lib/simpleMarkdown";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  canEdit?: boolean;
  defaultOpen?: boolean;
  /** Force mobile view (shows only the short mobile_content read-only) regardless of viewport. */
  forceMobile?: boolean;
}

export const CategoryGuidelinesPanel = ({
  categoryId,
  categoryName,
  categoryColor = "#3B82F6",
  canEdit = false,
  defaultOpen = false,
  forceMobile = false,
}: Props) => {
  const isMobileViewport = useIsMobile();
  const showMobileOnly = forceMobile || (isMobileViewport && !canEdit);

  const [open, setOpen] = useState(defaultOpen);
  const [content, setContent] = useState<string>("");
  const [mobileContent, setMobileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [mobileDraft, setMobileDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState<"full" | "mobile" | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("category_guidelines")
        .select("content, mobile_content")
        .eq("category_id", categoryId)
        .maybeSingle();
      if (cancelled) return;
      setContent(data?.content || "");
      setMobileContent((data as any)?.mobile_content || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const startEdit = () => {
    setDraft(content);
    setMobileDraft(mobileContent);
    setEditing(true);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("category_guidelines")
        .upsert(
          { category_id: categoryId, content: draft, mobile_content: mobileDraft } as any,
          { onConflict: "category_id" },
        );
      if (error) throw error;
      setContent(draft);
      setMobileContent(mobileDraft);
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

  const handleAIFormat = async (target: "full" | "mobile") => {
    const source = target === "full" ? draft : mobileDraft;
    if (!source.trim()) {
      toast({ title: "Nothing to format", description: "Paste or type some notes first." });
      return;
    }
    setFormatting(target);
    try {
      const { data, error } = await supabase.functions.invoke("format-guidelines", {
        body: { rawText: source, categoryName, mode: target },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.formatted) {
        if (target === "full") setDraft(data.formatted);
        else setMobileDraft(data.formatted);
        toast({ title: "AI formatted", description: "Review and save when ready." });
      }
    } catch (e: any) {
      toast({
        title: "AI formatting failed",
        description: e.message || "Try again shortly",
        variant: "destructive",
      });
    } finally {
      setFormatting(null);
    }
  };

  // What gets shown in read mode
  const displayContent = showMobileOnly
    ? mobileContent || content // fall back to full if no mobile version yet
    : content;

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
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                NPH Guidelines
                {showMobileOnly && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary">
                    <Smartphone className="w-3 h-3" /> MOBILE
                  </span>
                )}
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
              <div className="space-y-6">
                {/* FULL VERSION EDITOR */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-sm font-bold">Full guidelines (desktop / admin)</h4>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAIFormat("full")}
                      disabled={formatting !== null}
                      className="gap-1.5"
                    >
                      {formatting === "full" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      )}
                      AI Format
                    </Button>
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Paste full NPH guidelines, rules, timescales, contacts, escalation steps…"
                    className="min-h-[240px] text-sm font-mono"
                  />
                </section>

                {/* MOBILE VERSION EDITOR */}
                <section
                  className="space-y-3 rounded-lg border-2 border-dashed p-3"
                  style={{ borderColor: `${categoryColor}60`, backgroundColor: `${categoryColor}08` }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4" style={{ color: categoryColor }} />
                      <h4 className="text-sm font-bold">Mobile version (shown on phones)</h4>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAIFormat("mobile")}
                      disabled={formatting !== null}
                      className="gap-1.5"
                    >
                      {formatting === "mobile" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      )}
                      AI Format → bullets
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste a much shorter, scannable, bullet-point summary. This is exactly what field
                    teams will see on the mobile app. Leave blank to fall back to the full version.
                  </p>
                  <Textarea
                    value={mobileDraft}
                    onChange={(e) => setMobileDraft(e.target.value)}
                    placeholder={`- Key rule 1\n- Timescale: respond within X hours\n- Escalation: contact Y`}
                    className="min-h-[180px] text-sm font-mono bg-background"
                  />
                  {mobileDraft.trim() && (
                    <div className="rounded-lg bg-background/80 p-3 border border-border/60">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> Mobile preview
                      </p>
                      <SimpleMarkdown source={mobileDraft} />
                    </div>
                  )}
                </section>

                <div className="flex justify-end gap-2 sticky bottom-0 bg-card/95 backdrop-blur py-2">
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
                    Save both versions
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <SimpleMarkdown source={displayContent} />
                {!displayContent.trim() && canEdit && (
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
