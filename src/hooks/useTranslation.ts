import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'lt', name: 'Lietuvių', flag: '🇱🇹' },
  { code: 'lv', name: 'Latviešu', flag: '🇱🇻' },
  { code: 'bg', name: 'Български', flag: '🇧🇬' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
];

// Cache translations to avoid repeated API calls
const translationCache = new Map<string, string>();

function getCacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.substring(0, 100)}`;
}

export const useTranslation = (userLanguage: string = 'en') => {
  const [isTranslating, setIsTranslating] = useState(false);

  // Translate text from English to user's language (for viewing job descriptions)
  const translateToUserLanguage = useCallback(async (text: string): Promise<string> => {
    if (!text || userLanguage === 'en') return text;

    const cacheKey = getCacheKey(text, userLanguage);
    const cached = translationCache.get(cacheKey);
    if (cached) return cached;

    setIsTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: {
          text,
          targetLanguage: userLanguage,
          sourceLanguage: 'en',
        },
      });

      if (error || !data?.translatedText) {
        console.error('Translation error:', error);
        return text;
      }

      translationCache.set(cacheKey, data.translatedText);
      return data.translatedText;
    } catch (err) {
      console.error('Translation failed:', err);
      return text;
    } finally {
      setIsTranslating(false);
    }
  }, [userLanguage]);

  // Translate text from user's language to English (for admin to read)
  const translateToEnglish = useCallback(async (text: string): Promise<string> => {
    if (!text || userLanguage === 'en') return text;

    setIsTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: {
          text,
          targetLanguage: 'en',
          sourceLanguage: userLanguage,
        },
      });

      if (error || !data?.translatedText) {
        console.error('Translation error:', error);
        return text;
      }

      return data.translatedText;
    } catch (err) {
      console.error('Translation failed:', err);
      return text;
    } finally {
      setIsTranslating(false);
    }
  }, [userLanguage]);

  return {
    translateToUserLanguage,
    translateToEnglish,
    isTranslating,
    userLanguage,
  };
};
