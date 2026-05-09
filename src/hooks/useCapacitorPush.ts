import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { toast } from 'sonner';

interface PushState {
  isSupported: boolean;
  isRegistered: boolean;
  isLoading: boolean;
}

export const useCapacitorPush = (teamId: string | null) => {
  const [state, setState] = useState<PushState>({
    isSupported: false,
    isRegistered: false,
    isLoading: false,
  });

  // Check if running on native platform
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    setState(prev => ({ ...prev, isSupported: isNative }));
    
    if (isNative) {
      checkPermissions();
      addListeners();
    }

    return () => {
      if (isNative) {
        removeListeners();
      }
    };
  }, [isNative]);

  // Subscribe to team topic when teamId changes
  useEffect(() => {
    if (isNative && teamId && state.isRegistered) {
      subscribeToTeamTopic(teamId);
    }
  }, [isNative, teamId, state.isRegistered]);

  const checkPermissions = async () => {
    try {
      const result = await FirebaseMessaging.checkPermissions();
      setState(prev => ({ 
        ...prev, 
        isRegistered: result.receive === 'granted' 
      }));
    } catch (error) {
      console.error('Error checking push permissions:', error);
    }
  };

  const addListeners = async () => {
    // On token received (FCM token, not APNs)
    await FirebaseMessaging.addListener('tokenReceived', (_event) => {
      console.log('FCM token received successfully');
    });

    // On notification received in foreground
    await FirebaseMessaging.addListener('notificationReceived', (event) => {
      console.log('Notification received:', event.notification);
      toast.info(event.notification.title || 'New Notification', {
        description: event.notification.body,
      });
    });

    // On notification action performed (tap)
    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      console.log('Notification action performed:', event);
      const data = event.notification.data as Record<string, string> | undefined;
      if (data?.jobId) {
        sessionStorage.setItem('pendingJobId', data.jobId);
        window.location.href = `/team?job=${data.jobId}&action=submit`;
      }
    });
  };

  const removeListeners = async () => {
    await FirebaseMessaging.removeAllListeners();
  };

  const subscribeToTeamTopic = async (teamId: string) => {
    try {
      // Create a safe topic name (FCM topics can only contain alphanumeric, underscore, hyphen)
      const topicName = `team_${teamId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      
      await FirebaseMessaging.subscribeToTopic({ topic: topicName });
      console.log(`Subscribed to topic: ${topicName}`);
    } catch (error) {
      console.error('Error subscribing to topic:', error);
    }
  };

  const unsubscribeFromTeamTopic = async (teamId: string) => {
    try {
      const topicName = `team_${teamId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      
      await FirebaseMessaging.unsubscribeFromTopic({ topic: topicName });
      console.log(`Unsubscribed from topic: ${topicName}`);
    } catch (error) {
      console.error('Error unsubscribing from topic:', error);
    }
  };

  const register = useCallback(async () => {
    if (!isNative) {
      toast.error('Push notifications only work on mobile app');
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Request permission
      const permResult = await FirebaseMessaging.requestPermissions();

      if (permResult.receive === 'granted') {
        // Get FCM token (this triggers APNs->FCM token conversion on iOS)
        const tokenResult = await FirebaseMessaging.getToken();
        console.log('FCM token obtained');

        setState(prev => ({ ...prev, isRegistered: true }));

        // Subscribe to team topic if teamId is available
        if (teamId) {
          await subscribeToTeamTopic(teamId);
        }

        toast.success('Push notifications enabled');
        return true;
      } else {
        toast.error('Push notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('Error registering push notifications:', error);
      toast.error('Push notification registration error');
      return false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isNative, teamId]);

  const unregister = useCallback(async () => {
    if (!isNative || !teamId) return false;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Unsubscribe from team topic
      await unsubscribeFromTeamTopic(teamId);

      setState(prev => ({ 
        ...prev, 
        isRegistered: false,
      }));
      
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unregistering push notifications:', error);
      toast.error('Failed to disable push notifications');
      return false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isNative, teamId]);

  return {
    isSupported: state.isSupported,
    isRegistered: state.isRegistered,
    isLoading: state.isLoading,
    register,
    unregister,
  };
};
