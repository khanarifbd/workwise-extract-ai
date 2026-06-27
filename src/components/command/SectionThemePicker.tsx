import { useState, useMemo } from "react";
import { Palette, RotateCcw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SECTION_PRESETS, useRegistry, useSelections,
  setSectionPreset, resetSectionPreset, resetAllPresets,
  type SectionPresetId,
} from "@/lib/sectionTheme";

export const SectionThemePicker = () => {
  const [open, setOpen] = useState(false);
  const sections = useRegistry();
  const selections = useSelections();

  // Group sections by their page
  const grouped = useMemo(() => {
    const out = new Map<string, typeof sections>();
    for (const s of sections) {
      if (!out.has(s.group)) out.set(s.group, []);
      out.get(s.group)!.push(s);
    }
    return Array.from(out.entries());
  }, [sections]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Customize section colors"
        className="fixed bottom-24 right-4 z-50 h-12 w-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg ring-2 ring-white/40 grid place-items-center hover:scale-105 transition-transform"
      >
        <Palette className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex justify-end"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md h-full bg-card shadow-2xl border-l overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Theme</p>
                <h2 className="text-lg font-semibold">Section Colors</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={resetAllPresets}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset all
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {grouped.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Visit a section page (Command, DM, A&amp;A, Live Log) to surface its sections here.
              </p>
            ) : (
              <div className="p-5 space-y-6">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2.5">{group}</h3>
                    <div className="space-y-3">
                      {items.map((s) => {
                        const current = selections[s.id] ?? s.defaultPreset;
                        return (
                          <div key={s.id} className="rounded-xl border bg-background p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium">{s.label}</p>
                              {selections[s.id] && (
                                <button
                                  onClick={() => resetSectionPreset(s.id)}
                                  className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-8 gap-1.5">
                              {SECTION_PRESETS.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => setSectionPreset(s.id, p.id as SectionPresetId)}
                                  title={p.label}
                                  aria-label={p.label}
                                  className={cn(
                                    "h-8 w-full rounded-md border-2 grid place-items-center transition-transform hover:scale-110",
                                    p.swatch,
                                    current === p.id && "ring-2 ring-offset-2 ring-foreground/70"
                                  )}
                                >
                                  {current === p.id && <Check className="h-3.5 w-3.5 text-foreground/70" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
