import { useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Hook to play notification sound and vibrate device when new jobs arrive.
 * Works on both web and native (Capacitor) platforms.
 */
export const useNewJobNotification = () => {
  const lastNotificationRef = useRef<number>(0);
  const THROTTLE_MS = 2000; // Prevent rapid-fire notifications

  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context for notification sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create two quick ascending tones
      const playTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const now = audioContext.currentTime;
      
      // Pleasant "ding-ding" sound for new job
      playTone(880, now, 0.15);        // A5
      playTone(1109, now + 0.12, 0.2); // C#6 (higher, ascending)
      
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, []);

  const triggerVibration = useCallback(() => {
    try {
      // Use Vibration API (works on web and can be used with Capacitor)
      if ('vibrate' in navigator) {
        // Pattern: vibrate 100ms, pause 50ms, vibrate 100ms
        navigator.vibrate([100, 50, 100]);
      }
    } catch (error) {
      console.warn('Could not trigger vibration:', error);
    }
  }, []);

  const notifyNewJob = useCallback(() => {
    const now = Date.now();
    
    // Throttle notifications
    if (now - lastNotificationRef.current < THROTTLE_MS) {
      return;
    }
    lastNotificationRef.current = now;

    // Play sound
    playNotificationSound();
    
    // Vibrate (especially useful on mobile)
    triggerVibration();
  }, [playNotificationSound, triggerVibration]);

  return {
    notifyNewJob,
    playNotificationSound,
    triggerVibration,
  };
};
