import { useState, useEffect } from 'react';
import { Category } from '@/types/category';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setCategories((data || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        color: cat.color || '#3B82F6',
        sortOrder: cat.sort_order,
        createdAt: new Date(cat.created_at)
      })));
    } catch (error) {
      console.error('Error loading categories:', error);
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();

    const channel = supabase
      .channel(`categories-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => loadCategories()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addCategory = async (name: string, color: string = '#3B82F6') => {
    // Check if category with this name already exists locally
    const existingCategory = categories.find(
      c => c.name.toLowerCase() === name.toLowerCase()
    );
    if (existingCategory) {
      toast({ 
        title: "Category already exists", 
        description: `"${existingCategory.name}" is already in your categories list.`,
        variant: "destructive" 
      });
      return null;
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const maxOrder = Math.max(...categories.map(c => c.sortOrder), -1);
    
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, slug, color, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Refresh categories to sync with database
        await loadCategories();
        toast({ 
          title: "Category already exists", 
          description: `A category with this name already exists. The list has been refreshed.`,
          variant: "destructive" 
        });
      } else {
        throw error;
      }
      return null;
    }

    return data;
  };

  const updateCategory = async (id: string, updates: { name?: string; color?: string }) => {
    const updateData: any = {};
    if (updates.name) {
      updateData.name = updates.name;
      updateData.slug = updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (updates.color) updateData.color = updates.color;

    const { error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
  };

  return {
    categories,
    isLoading,
    addCategory,
    updateCategory,
    deleteCategory,
    refreshCategories: loadCategories
  };
};
