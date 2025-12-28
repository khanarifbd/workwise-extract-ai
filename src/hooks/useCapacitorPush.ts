import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PushState {
  isSupported: boolean;
  isRegistered: boolean;
  token: string | null;
  isLoading: boolean;
}

export const useCapacitorPush = (teamId: string | null) => {
  const [state, setState] = useState<PushState>({
    isSupported: false,
    isRegistered: false,
    token: null,
    isLoading: false,
  });

  // Check if running on native platform
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    setState(prev => ({ ...prev, isSupported: isNative }));
    
    if (isNative && teamId) {
      checkPermissions();
      addListeners();
    }

    return () => {
      if (isNative) {
        removeListeners();
      }
    };
  }, [isNative, teamId]);

  const checkPermissions = async () => {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      setState(prev => ({ 
        ...prev, 
        isRegistered: permStatus.receive === 'granted' 
      }));
    } catch (error) {
      console.error('Error checking push permissions:', error);
    }
  };

  const addListeners = async () => {
    // On registration success
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      setState(prev => ({ ...prev, token: token.value, isRegistered: true }));
      
      // Save token to database
      if (teamId) {
        await saveTokenToDatabase(token.value, teamId);
      }
    });

    // On registration error
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
      toast.error('Push notification registration failed');
    });

    // On push notification received
    await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received:', notification);
      toast.info(notification.title || 'New Notification', {
        description: notification.body,
      });
    });

    // On push notification action performed
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('Push notification action performed:', action);
      // Handle notification tap - navigate to relevant job page
      const data = action.notification.data;
      if (data?.jobId) {
        // Store job ID to open after navigation
        sessionStorage.setItem('pendingJobId', data.jobId);
        // Navigate to team portal with job parameter
        window.location.href = `/team?job=${data.jobId}&action=submit`;
      }
    });
  };

  const removeListeners = async () => {
    await PushNotifications.removeAllListeners();
  };

  const saveTokenToDatabase = async (token: string, teamId: string) => {
    try {
      const platform = Capacitor.getPlatform();
      
      // Check if token already exists for this team using raw SQL via RPC or direct query
      const { data: existing, error: selectError } = await supabase
        .from('team_fcm_tokens' as any)
        .select('id')
        .eq('team_id', teamId)
        .eq('fcm_token', token)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing token:', selectError);
      }

      if (existing) {
        // Update existing record
        await supabase
          .from('team_fcm_tokens' as any)
          .update({ updated_at: new Date().toISOString() })
          .eq('id', (existing as any).id);
      } else {
        // Insert new record
        await supabase
          .from('team_fcm_tokens' as any)
          .insert({
            team_id: teamId,
            fcm_token: token,
            platform: platform,
          } as any);
      }
      
      console.log('FCM token saved to database');
    } catch (error) {
      console.error('Error saving FCM token:', error);
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
      const permStatus = await PushNotifications.requestPermissions();

      if (permStatus.receive === 'granted') {
        // Register with FCM/APNs
        await PushNotifications.register();
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
  }, [isNative]);

  const unregister = useCallback(async () => {
    if (!isNative || !state.token || !teamId) return false;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Remove token from database
      await supabase
        .from('team_fcm_tokens' as any)
        .delete()
        .eq('team_id', teamId)
        .eq('fcm_token', state.token);

      setState(prev => ({ 
        ...prev, 
        isRegistered: false, 
        token: null 
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
  }, [isNative, state.token, teamId]);

  return {
    isSupported: state.isSupported,
    isRegistered: state.isRegistered,
    isLoading: state.isLoading,
    register,
    unregister,
  };
};
