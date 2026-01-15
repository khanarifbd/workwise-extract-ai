import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FolderPlus, Image as ImageIcon, X, Loader2, Trash2, Edit2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Attachment } from '@/types/job';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PhotoFolder {
  id: string;
  job_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

interface PhotoFolderUploadProps {
  jobId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  teamId?: string;
  readOnly?: boolean;
}

// Default folder names
const DEFAULT_FOLDERS = ['Before Works', 'After Works'];

// Get public URL for an attachment
const getPublicUrl = (path: string): string => {
  const { data } = supabase.storage
    .from('job-attachments')
    .getPublicUrl(path);
  return data.publicUrl;
};

export const PhotoFolderUpload = ({ 
  jobId, 
  attachments, 
  onAttachmentsChange,
  teamId,
  readOnly = false
}: PhotoFolderUploadProps) => {
  const [folders, setFolders] = useState<PhotoFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [displayUrls, setDisplayUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFolderRef = useRef<string | null>(null);
  const { toast } = useToast();

  // Fetch folders for this job
  useEffect(() => {
    fetchFolders();
  }, [jobId]);

  // Generate display URLs for all image attachments
  useEffect(() => {
    const imageAttachments = attachments.filter(a => a.type === 'image');
    const urlMap: Record<string, string> = {};
    
    imageAttachments.forEach((attachment) => {
      if (attachment.path) {
        urlMap[attachment.id] = getPublicUrl(attachment.path);
      } else {
        urlMap[attachment.id] = attachment.url;
      }
    });
    
    setDisplayUrls(urlMap);
  }, [attachments]);

  const fetchFolders = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('photo_folders')
        .select('*')
        .eq('job_id', jobId)
        .order('sort_order');

      if (error) throw error;
      
      // If no folders exist, create defaults
      if (!data || data.length === 0) {
        await createDefaultFolders();
      } else {
        setFolders(data);
        // Expand all folders by default
        setExpandedFolders(new Set(data.map(f => f.id)));
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultFolders = async () => {
    try {
      const foldersToCreate = DEFAULT_FOLDERS.map((name, idx) => ({
        job_id: jobId,
        name,
        sort_order: idx,
        created_by: teamId || null,
      }));

      const { data, error } = await supabase
        .from('photo_folders')
        .insert(foldersToCreate)
        .select();

      if (error) throw error;
      setFolders(data || []);
      setExpandedFolders(new Set((data || []).map(f => f.id)));
    } catch (error) {
      console.error('Failed to create default folders:', error);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const { data, error } = await supabase
        .from('photo_folders')
        .insert({
          job_id: jobId,
          name: newFolderName.trim(),
          sort_order: folders.length,
          created_by: teamId || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      setFolders([...folders, data]);
      setExpandedFolders(prev => new Set([...prev, data.id]));
      setNewFolderName('');
      setShowNewFolder(false);
      
      toast({ title: "Folder created", description: `Created "${data.name}" folder` });
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast({ title: "Error", description: "Failed to create folder", variant: "destructive" });
    }
  };

  const updateFolderName = async (folderId: string) => {
    if (!editValue.trim()) {
      setEditingFolder(null);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('photo_folders')
        .update({ name: editValue.trim() })
        .eq('id', folderId);

      if (error) throw error;
      
      setFolders(folders.map(f => f.id === folderId ? { ...f, name: editValue.trim() } : f));
      setEditingFolder(null);
    } catch (error) {
      console.error('Failed to update folder:', error);
      toast({ title: "Error", description: "Failed to update folder name", variant: "destructive" });
    }
  };

  const deleteFolder = async (folderId: string) => {
    // Check if folder has photos
    const folderPhotos = attachments.filter(a => 
      a.type === 'image' && (a as any).folderId === folderId
    );
    
    if (folderPhotos.length > 0) {
      toast({ 
        title: "Cannot delete", 
        description: "Remove all photos from this folder first", 
        variant: "destructive" 
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('photo_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
      
      setFolders(folders.filter(f => f.id !== folderId));
      toast({ title: "Folder deleted" });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
    }
  };

  const uploadPhoto = async (file: File, folderId: string) => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${jobId}/photos/${folderId}/${crypto.randomUUID()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('job-attachments')
      .upload(filePath, file);

    if (error) {
      console.error('Storage upload error:', error);
      return null;
    }

    return { path: data.path, publicUrl: getPublicUrl(data.path) };
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const folderId = activeFolderRef.current;
    
    if (!files || files.length === 0 || !folderId) return;

    setIsUploading(folderId);
    const newAttachments: Attachment[] = [];

    try {
      for (const file of Array.from(files)) {
        // Only accept images
        if (!file.type.startsWith('image/')) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image`,
            variant: "destructive",
          });
          continue;
        }

        const result = await uploadPhoto(file, folderId);
        
        if (!result) {
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
          continue;
        }
        
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          name: file.name,
          type: 'image',
          url: result.publicUrl,
          path: result.path,
          uploadedAt: new Date(),
          folderId: folderId, // Store folder association
        } as Attachment & { folderId: string };
        
        newAttachments.push(attachment);
        setDisplayUrls(prev => ({ ...prev, [attachment.id]: result.publicUrl }));
      }

      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
        toast({
          title: "Photos uploaded",
          description: `${newAttachments.length} photo(s) added to folder`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Could not upload the photos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      activeFolderRef.current = null;
    }
  }, [attachments, onAttachmentsChange, toast, jobId]);

  const removePhoto = async (attachment: Attachment) => {
    try {
      if (attachment.path) {
        await supabase.storage.from('job-attachments').remove([attachment.path]);
      }
    } catch (error) {
      console.error('Error deleting from storage:', error);
    }
    
    onAttachmentsChange(attachments.filter(a => a.id !== attachment.id));
  };

  const triggerUpload = (folderId: string) => {
    activeFolderRef.current = folderId;
    fileInputRef.current?.click();
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Get photos for a folder
  const getFolderPhotos = (folderId: string) => {
    return attachments.filter(a => 
      a.type === 'image' && (a as any).folderId === folderId
    );
  };

  // Get uncategorized photos (no folder assigned)
  const getUncategorizedPhotos = () => {
    const folderIds = folders.map(f => f.id);
    return attachments.filter(a => 
      a.type === 'image' && (!(a as any).folderId || !folderIds.includes((a as any).folderId))
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const uncategorizedPhotos = getUncategorizedPhotos();

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header with create folder */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Photo Folders</h3>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewFolder(true)}
            className="h-7 text-xs"
          >
            <FolderPlus className="w-3 h-3 mr-1" />
            New Folder
          </Button>
        )}
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name..."
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFolder();
              if (e.key === 'Escape') setShowNewFolder(false);
            }}
          />
          <Button size="sm" className="h-8" onClick={createFolder}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowNewFolder(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Folders list */}
      <div className="space-y-3">
        {folders.map((folder) => {
          const photos = getFolderPhotos(folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          const isEditing = editingFolder === folder.id;
          const isUploadingToThis = isUploading === folder.id;

          return (
            <Collapsible 
              key={folder.id} 
              open={isExpanded}
              onOpenChange={() => toggleFolder(folder.id)}
            >
              <div className="border rounded-lg overflow-hidden">
                {/* Folder header */}
                <CollapsibleTrigger asChild>
                  <div className={cn(
                    "flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors",
                    isExpanded && "border-b"
                  )}>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      {isEditing ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 w-40 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') updateFolderName(folder.id);
                              if (e.key === 'Escape') setEditingFolder(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateFolderName(folder.id)}>
                            <Check className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium text-sm">{folder.name}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {photos.length}
                      </Badge>
                    </div>
                    
                    {!readOnly && !isEditing && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditValue(folder.name);
                            setEditingFolder(folder.id);
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerUpload(folder.id);
                          }}
                          disabled={isUploadingToThis}
                        >
                          {isUploadingToThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                        </Button>
                        {photos.length === 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFolder(folder.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleTrigger>

                {/* Folder content */}
                <CollapsibleContent>
                  <div className="p-3">
                    {photos.length === 0 ? (
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => !readOnly && triggerUpload(folder.id)}
                      >
                        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground mt-2">
                          {readOnly ? 'No photos in this folder' : 'Click to add photos'}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {photos.map((photo) => (
                          <div
                            key={photo.id}
                            className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
                          >
                            <img
                              src={displayUrls[photo.id] || photo.url}
                              alt={photo.name}
                              className="w-full h-full object-cover"
                            />
                            {!readOnly && (
                              <button
                                onClick={() => removePhoto(photo)}
                                className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Uncategorized photos */}
      {uncategorizedPhotos.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm text-muted-foreground">Other Photos</span>
            <Badge variant="secondary" className="text-xs">
              {uncategorizedPhotos.length}
            </Badge>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {uncategorizedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
              >
                <img
                  src={displayUrls[photo.id] || photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                />
                {!readOnly && (
                  <button
                    onClick={() => removePhoto(photo)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
