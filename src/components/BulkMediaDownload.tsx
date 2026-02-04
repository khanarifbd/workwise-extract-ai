import { useState, useCallback } from 'react';
import { Download, Loader2, CheckSquare, Square, XSquare, Image as ImageIcon, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Attachment } from '@/types/job';
import { supabase } from '@/integrations/supabase/client';
import JSZip from 'jszip';

interface BulkMediaDownloadProps {
  folderName: string;
  photos: Attachment[];
  displayUrls: Record<string, string>;
  onClose: () => void;
}

export const BulkMediaDownload = ({
  folderName,
  photos,
  displayUrls,
  onClose,
}: BulkMediaDownloadProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(photos.map(p => p.id)));
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStats, setDownloadStats] = useState({ completed: 0, total: 0 });
  const { toast } = useToast();

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(photos.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const downloadSingleFile = async (photo: Attachment): Promise<{ name: string; blob: Blob } | null> => {
    try {
      const url = displayUrls[photo.id] || photo.url;
      
      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const blob = await response.blob();
      
      // Generate a clean filename
      const extension = photo.name?.split('.').pop() || 'jpg';
      const baseName = photo.name?.replace(/\.[^/.]+$/, '') || photo.id;
      const cleanName = `${baseName}.${extension}`;
      
      return { name: cleanName, blob };
    } catch (error) {
      console.error('Failed to download file:', photo.name, error);
      return null;
    }
  };

  const handleBulkDownload = useCallback(async () => {
    const selectedPhotos = photos.filter(p => selectedIds.has(p.id));
    
    if (selectedPhotos.length === 0) {
      toast({
        title: "No photos selected",
        description: "Please select at least one photo to download",
        variant: "destructive",
      });
      return;
    }

    // For single file, download directly
    if (selectedPhotos.length === 1) {
      const photo = selectedPhotos[0];
      const url = displayUrls[photo.id] || photo.url;
      
      try {
        setIsDownloading(true);
        setDownloadProgress(50);
        
        const response = await fetch(url);
        const blob = await response.blob();
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = photo.name || 'photo.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        setDownloadProgress(100);
        toast({
          title: "Download complete",
          description: `Downloaded ${photo.name}`,
        });
        
        setTimeout(onClose, 500);
      } catch (error) {
        toast({
          title: "Download failed",
          description: "Could not download the file",
          variant: "destructive",
        });
      } finally {
        setIsDownloading(false);
        setDownloadProgress(0);
      }
      return;
    }

    // For multiple files, create a ZIP
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStats({ completed: 0, total: selectedPhotos.length });

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let completedCount = 0;

      // Download files in batches
      const batchSize = 5;
      for (let i = 0; i < selectedPhotos.length; i += batchSize) {
        const batch = selectedPhotos.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(photo => downloadSingleFile(photo))
        );

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            // Ensure unique filenames
            let fileName = result.value.name;
            let counter = 1;
            while (usedNames.has(fileName)) {
              const parts = result.value.name.split('.');
              const ext = parts.pop();
              fileName = `${parts.join('.')}_${counter}.${ext}`;
              counter++;
            }
            usedNames.add(fileName);
            
            zip.file(fileName, result.value.blob);
          }
          completedCount++;
        });

        // Update progress
        const progress = Math.round((completedCount / selectedPhotos.length) * 80);
        setDownloadProgress(progress);
        setDownloadStats({ completed: completedCount, total: selectedPhotos.length });
      }

      // Generate ZIP
      setDownloadProgress(85);
      toast({
        title: "Creating ZIP file",
        description: "Packaging your photos...",
      });

      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      }, (metadata) => {
        const progress = 85 + Math.round(metadata.percent * 0.15);
        setDownloadProgress(progress);
      });

      // Trigger download
      const sanitizedFolderName = folderName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestamp = new Date().toISOString().split('T')[0];
      const zipFileName = `${sanitizedFolderName}_${timestamp}.zip`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setDownloadProgress(100);
      toast({
        title: "Download complete",
        description: `Downloaded ${completedCount} photos as ${zipFileName}`,
      });

      setTimeout(onClose, 1000);
    } catch (error) {
      console.error('Bulk download error:', error);
      toast({
        title: "Download failed",
        description: "Could not create the download package",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStats({ completed: 0, total: 0 });
    }
  }, [photos, selectedIds, displayUrls, folderName, toast, onClose]);

  const isImage = (photo: Attachment) => photo.type === 'image';
  const isVideo = (photo: Attachment) => photo.type === 'video';

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download from "{folderName}"
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select photos to download • {selectedIds.size} of {photos.length} selected
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isDownloading}>
            <XSquare className="w-5 h-5" />
          </Button>
        </div>

        {/* Selection controls */}
        <div className="px-5 py-3 border-b border-border bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={selectAll}
              disabled={isDownloading}
              className="h-8 text-xs"
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Select All
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={deselectAll}
              disabled={isDownloading}
              className="h-8 text-xs"
            >
              <Square className="w-3 h-3 mr-1" />
              Deselect All
            </Button>
          </div>
          <Badge variant={selectedIds.size > 0 ? "default" : "secondary"}>
            {selectedIds.size} selected
          </Badge>
        </div>

        {/* Download progress */}
        {isDownloading && (
          <div className="px-5 py-3 bg-primary/10 border-b border-primary/20">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-primary flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {downloadProgress < 85 
                  ? `Downloading ${downloadStats.completed} of ${downloadStats.total}...`
                  : 'Creating ZIP file...'}
              </span>
              <span className="text-primary font-medium">{downloadProgress}%</span>
            </div>
            <Progress value={downloadProgress} className="h-2" />
          </div>
        )}

        {/* Photo grid */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-200px)]">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {photos.map((photo) => {
              const isSelected = selectedIds.has(photo.id);
              const displayUrl = displayUrls[photo.id] || photo.url;
              
              return (
                <div
                  key={photo.id}
                  onClick={() => !isDownloading && toggleSelection(photo.id)}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer
                    transition-all duration-200
                    ${isSelected 
                      ? 'border-primary ring-2 ring-primary/30 scale-[0.98]' 
                      : 'border-transparent hover:border-muted-foreground/30'}
                    ${isDownloading ? 'opacity-50 pointer-events-none' : ''}
                  `}
                >
                  {isImage(photo) && (
                    <img
                      src={displayUrl}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {isVideo(photo) && (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Video className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Selection indicator */}
                  <div className={`
                    absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center
                    transition-all duration-200
                    ${isSelected ? 'bg-primary' : 'bg-background/80 border border-muted-foreground/30'}
                  `}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>

                  {/* Type indicator */}
                  <div className="absolute bottom-1 right-1">
                    {isImage(photo) && <ImageIcon className="w-3 h-3 text-white drop-shadow-lg" />}
                    {isVideo(photo) && <Video className="w-3 h-3 text-white drop-shadow-lg" />}
                  </div>
                </div>
              );
            })}
          </div>

          {photos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No photos in this folder</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isDownloading}>
            Cancel
          </Button>
          <Button 
            onClick={handleBulkDownload} 
            disabled={isDownloading || selectedIds.size === 0}
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download {selectedIds.size > 1 ? `${selectedIds.size} as ZIP` : selectedIds.size === 1 ? '1 Photo' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
