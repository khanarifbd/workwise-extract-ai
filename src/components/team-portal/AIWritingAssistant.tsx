import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Wand2, Loader2, Check, X, Sparkles, Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES } from '@/hooks/useTranslation';

interface AIWritingAssistantProps {
  currentText: string;
  onAccept: (enhancedText: string) => void;
  userLanguage: string;
  jobContext?: string;
  placeholder?: string;
}

export const AIWritingAssistant = ({
  currentText,
  onAccept,
  userLanguage,
  jobContext,
  placeholder = "Write your notes here in any language...",
}: AIWritingAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [enhancedText, setEnhancedText] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const languageInfo = SUPPORTED_LANGUAGES.find(l => l.code === userLanguage);

  const handleOpen = () => {
    setInputText(currentText);
    setEnhancedText('');
    setError(null);
    setIsOpen(true);
  };

  const handleEnhance = async () => {
    if (!inputText.trim()) {
      setError('Please write something first');
      return;
    }

    setIsEnhancing(true);
    setError(null);
    setEnhancedText('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('enhance-notes', {
        body: {
          text: inputText.trim(),
          userLanguage,
          context: jobContext,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to enhance notes');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.enhancedText) {
        setEnhancedText(data.enhancedText);
      } else {
        throw new Error('No enhanced text received');
      }
    } catch (err) {
      console.error('Enhancement error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to enhance notes';
      setError(errorMessage);
      toast({
        title: 'Enhancement Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleAccept = () => {
    if (enhancedText) {
      onAccept(enhancedText);
      setIsOpen(false);
      toast({
        title: 'Notes Updated',
        description: 'Your enhanced notes have been applied.',
      });
    }
  };

  const handleUseOriginal = () => {
    if (inputText.trim()) {
      onAccept(inputText.trim());
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* AI Assist Button - compact for mobile */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="h-7 px-2 text-xs gap-1 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-200 dark:border-violet-800 hover:from-violet-500/20 hover:to-purple-500/20"
      >
        <Sparkles className="h-3 w-3 text-violet-600 dark:text-violet-400" />
        <span className="hidden sm:inline">AI Assist</span>
        <span className="sm:hidden">AI</span>
      </Button>

      {/* AI Writing Assistant Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Wand2 className="h-4 w-4 text-white" />
              </div>
              AI Writing Assistant
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Language indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Languages className="h-4 w-4" />
              <span>
                Write in {languageInfo?.name || 'any language'} {languageInfo?.flag} — AI will create a clear English version
              </span>
            </div>

            {/* Input textarea */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Your Notes
                <span className="text-muted-foreground font-normal ml-1">(any language, any style)</span>
              </label>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={placeholder}
                rows={4}
                className="text-sm"
                disabled={isEnhancing}
              />
            </div>

            {/* Enhance button */}
            <Button
              onClick={handleEnhance}
              disabled={isEnhancing || !inputText.trim()}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {isEnhancing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enhancing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Enhance with AI
                </>
              )}
            </Button>

            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            {/* Enhanced result */}
            {enhancedText && (
              <div className="space-y-2 animate-fade-in">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  Enhanced Version
                </label>
                <div className={cn(
                  "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3",
                  "text-sm whitespace-pre-wrap"
                )}>
                  {enhancedText}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
            {enhancedText ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleUseOriginal}
                  className="flex-1 sm:flex-none"
                >
                  Use Original
                </Button>
                <Button
                  onClick={handleAccept}
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Use Enhanced
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
