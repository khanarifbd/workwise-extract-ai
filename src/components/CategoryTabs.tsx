import { useState } from 'react';
import { Category } from '@/types/category';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, X, Edit2, Check, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string | null;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory: (name: string, color: string) => Promise<any>;
  onUpdateCategory: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  '#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#EF4444', '#06B6D4', '#84CC16', '#6366F1'
];

export const CategoryTabs = ({
  categories,
  activeCategory,
  onCategoryChange,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory
}: CategoryTabsProps) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAddCategory(newName.trim(), newColor);
    setNewName('');
    setNewColor('#3B82F6');
    setShowAddDialog(false);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdateCategory(editingId, { name: editName.trim(), color: editColor });
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((cat) => (
        <div key={cat.id} className="flex items-center group relative">
          {editingId === cat.id ? (
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 w-28 text-sm"
                autoFocus
              />
              <div className="flex gap-0.5">
                {PRESET_COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "w-5 h-5 rounded-full border-2 transition-all",
                      editColor === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditColor(color)}
                  />
                ))}
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <button
              className={cn(
                "flex items-center gap-2 rounded-lg font-medium transition-all whitespace-nowrap",
                ['dm-jobs', 'a--a', 'a-a', 'fans'].includes(cat.slug)
                  ? "px-5 py-2.5 text-base font-semibold"
                  : "px-4 py-2 text-sm",
                activeCategory === cat.id
                  ? "text-white shadow-md"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
              style={activeCategory === cat.id ? { backgroundColor: cat.color } : undefined}
              onClick={() => onCategoryChange(cat.id)}
            >
              <span
                className={cn(
                  "rounded-full flex-shrink-0",
                  ['dm-jobs', 'a--a', 'a-a', 'fans'].includes(cat.slug) ? "w-3 h-3" : "w-2.5 h-2.5"
                )}
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </button>
          )}
          
          {activeCategory === cat.id && editingId !== cat.id && (
            <div className="absolute -right-1 -top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="secondary"
                className="h-5 w-5 rounded-full"
                onClick={(e) => { e.stopPropagation(); startEdit(cat); }}
              >
                <Edit2 className="w-2.5 h-2.5" />
              </Button>
              {categories.length > 1 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-5 w-5 rounded-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Jobs in this category will become uncategorized.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDeleteCategory(cat.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      ))}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 ml-1 flex-shrink-0">
            <Plus className="w-4 h-4" />
            Add Category
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Category name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    newColor === color ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewColor(color)}
                />
              ))}
            </div>
            <Button onClick={handleAdd} className="w-full" disabled={!newName.trim()}>
              Create Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
