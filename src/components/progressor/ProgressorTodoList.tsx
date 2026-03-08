import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ListChecks, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_TODOS = [
  'Photos',
  'More photos documenting the works',
  'Clear description covering the works',
  'Additional trades',
  'More works to complete',
  'Additional carpentry',
  'Additional plumbing',
  'Additional roof works',
  'Polysafe flooring',
  'Rubbish removal',
];

interface TodoItem {
  id: string;
  jobId: string;
  label: string;
  isCustom: boolean;
  customText: string;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
}

interface ProgressorTodoListProps {
  jobId: string;
}

export const ProgressorTodoList = ({ jobId }: ProgressorTodoListProps) => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customText, setCustomText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('progressor_todos')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setTodos((data || []).map((row: any) => ({
        id: row.id,
        jobId: row.job_id,
        label: row.label,
        isCustom: row.is_custom,
        customText: row.custom_text || '',
        isCompleted: row.is_completed,
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })));
    } catch (err) {
      console.error('Error fetching todos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addPresetTodo = async () => {
    if (!selectedPreset) return;
    setIsAdding(true);
    try {
      const { error } = await supabase.from('progressor_todos').insert({
        job_id: jobId,
        label: selectedPreset,
        is_custom: false,
      } as any);
      if (error) throw error;
      setSelectedPreset('');
      await fetchTodos();
    } catch (err) {
      console.error('Error adding todo:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const addCustomTodo = async () => {
    if (!customText.trim()) return;
    setIsAdding(true);
    try {
      const { error } = await supabase.from('progressor_todos').insert({
        job_id: jobId,
        label: customText.trim(),
        is_custom: true,
      } as any);
      if (error) throw error;
      setCustomText('');
      await fetchTodos();
    } catch (err) {
      console.error('Error adding custom todo:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const toggleTodo = async (todo: TodoItem) => {
    const newCompleted = !todo.isCompleted;
    try {
      const { error } = await supabase
        .from('progressor_todos')
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        } as any)
        .eq('id', todo.id);
      if (error) throw error;
      setTodos(prev => prev.map(t => t.id === todo.id
        ? { ...t, isCompleted: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null }
        : t
      ));
    } catch (err) {
      console.error('Error toggling todo:', err);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const { error } = await supabase.from('progressor_todos').delete().eq('id', id);
      if (error) throw error;
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  const completedCount = todos.filter(t => t.isCompleted).length;
  const totalCount = todos.length;

  // Filter out already-added presets
  const availablePresets = PRESET_TODOS.filter(
    preset => !todos.some(t => t.label === preset)
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading to-do list...
      </div>
    );
  }

  return (
    <div className="bg-violet-50 dark:bg-violet-950/30 border-2 border-violet-300 dark:border-violet-700 rounded-lg p-3 space-y-3 shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold flex items-center gap-1.5 text-violet-800 dark:text-violet-200">
          <ListChecks className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          📋 To-Do Checklist
          {totalCount > 0 && (
            <Badge className="text-[10px] ml-1 bg-violet-600 text-white">
              {completedCount}/{totalCount}
            </Badge>
          )}
        </span>
        {totalCount > 0 && (
          <div className="h-2 w-24 bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* Todo Items */}
      {todos.length > 0 && (
        <div className="space-y-1">
          {todos.map(todo => (
            <div
              key={todo.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group",
                todo.isCompleted
                  ? "bg-emerald-50 dark:bg-emerald-950/20 text-muted-foreground"
                  : "bg-muted/30 hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={todo.isCompleted}
                onCheckedChange={() => toggleTodo(todo)}
                className="h-4 w-4 border-2"
              />
              <span className={cn("flex-1", todo.isCompleted && "line-through")}>
                {todo.label}
              </span>
              {todo.isCustom && (
                <Badge variant="outline" className="text-[9px] px-1">Custom</Badge>
              )}
              <button
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add preset */}
      <div className="flex gap-2">
        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="Select to-do item..." />
          </SelectTrigger>
          <SelectContent>
            {availablePresets.map(preset => (
              <SelectItem key={preset} value={preset} className="text-xs">
                {preset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2"
          onClick={addPresetTodo}
          disabled={!selectedPreset || isAdding}
        >
          <Plus className="h-3 w-3 mr-0.5" /> Add
        </Button>
      </div>

      {/* Add custom */}
      <div className="flex gap-2">
        <Input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Add custom to-do item..."
          className="h-7 text-xs flex-1"
          onKeyDown={(e) => e.key === 'Enter' && addCustomTodo()}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2"
          onClick={addCustomTodo}
          disabled={!customText.trim() || isAdding}
        >
          <Plus className="h-3 w-3 mr-0.5" /> Add
        </Button>
      </div>
    </div>
  );
};
