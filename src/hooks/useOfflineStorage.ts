import { useState, useEffect, useCallback } from 'react';
import { Job } from '@/types/job';

const DB_NAME = 'teamPortalDB';
const DB_VERSION = 2; // Bumped version for new store
const JOBS_STORE = 'jobs';
const SYNC_QUEUE_STORE = 'syncQueue';
const DRAFTS_STORE = 'drafts';
const METADATA_STORE = 'metadata';

interface SyncQueueItem {
  id: string;
  teamId: string;
  actionType: 'progress_update' | 'photo_upload' | 'status_update' | 'job_complete' | 'file_upload';
  payload: any;
  createdAt: string;
  synced: boolean;
}

interface Draft {
  id: string;
  jobId: string;
  teamId: string;
  data: any;
  savedAt: string;
}

interface SyncMetadata {
  id: string;
  teamId: string;
  lastSyncTime: string;
}

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Jobs store for offline caching
      if (!database.objectStoreNames.contains(JOBS_STORE)) {
        const jobsStore = database.createObjectStore(JOBS_STORE, { keyPath: 'id' });
        jobsStore.createIndex('teamId', 'team', { unique: false });
      }

      // Sync queue for pending updates
      if (!database.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const syncStore = database.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
        syncStore.createIndex('synced', 'synced', { unique: false });
      }

      // Drafts store for auto-save
      if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
        const draftsStore = database.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
        draftsStore.createIndex('jobId', 'jobId', { unique: false });
      }

      // Metadata store for sync tracking
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: 'id' });
      }
    };
  });
};

export const useOfflineStorage = (teamId?: string) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize DB on mount and load last sync time
  useEffect(() => {
    const init = async () => {
      await openDB();
      updatePendingSyncCount();
      if (teamId) {
        const syncTime = await getLastSyncTime(teamId);
        setLastSyncTime(syncTime);
      }
    };
    init().catch(console.error);
  }, [teamId]);

  const updatePendingSyncCount = async () => {
    try {
      const database = await openDB();
      const tx = database.transaction(SYNC_QUEUE_STORE, 'readonly');
      const store = tx.objectStore(SYNC_QUEUE_STORE);
      const index = store.index('synced');
      const request = index.count(IDBKeyRange.only(false));
      
      request.onsuccess = () => {
        setPendingSyncCount(request.result);
      };
    } catch (error) {
      console.error('Error counting pending syncs:', error);
    }
  };

  // Get last sync time for a team
  const getLastSyncTime = async (team: string): Promise<Date | null> => {
    try {
      const database = await openDB();
      const tx = database.transaction(METADATA_STORE, 'readonly');
      const store = tx.objectStore(METADATA_STORE);
      const request = store.get(`sync-${team}`);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const data = request.result as SyncMetadata | undefined;
          resolve(data?.lastSyncTime ? new Date(data.lastSyncTime) : null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  };

  // Update last sync time for a team
  const updateLastSyncTime = useCallback(async (team: string) => {
    try {
      const database = await openDB();
      const tx = database.transaction(METADATA_STORE, 'readwrite');
      const store = tx.objectStore(METADATA_STORE);
      const now = new Date();

      const metadata: SyncMetadata = {
        id: `sync-${team}`,
        teamId: team,
        lastSyncTime: now.toISOString(),
      };

      store.put(metadata);

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
          setLastSyncTime(now);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error updating last sync time:', error);
      throw error;
    }
  }, []);

  // Cache jobs for offline use
  const cacheJobs = useCallback(async (jobs: Job[], team?: string) => {
    try {
      const database = await openDB();
      const tx = database.transaction(JOBS_STORE, 'readwrite');
      const store = tx.objectStore(JOBS_STORE);

      for (const job of jobs) {
        store.put(job);
      }

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = async () => {
          // Update last sync time when caching jobs
          if (team) {
            try {
              await updateLastSyncTime(team);
            } catch (e) {
              console.error('Error updating sync time:', e);
            }
          }
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error caching jobs:', error);
      throw error;
    }
  }, [updateLastSyncTime]);

  // Get cached jobs for a team
  const getCachedJobs = useCallback(async (team: string): Promise<Job[]> => {
    try {
      const database = await openDB();
      const tx = database.transaction(JOBS_STORE, 'readonly');
      const store = tx.objectStore(JOBS_STORE);
      const index = store.index('teamId');
      const request = index.getAll(IDBKeyRange.only(team));

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve((request.result || []) as Job[]);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting cached jobs:', error);
      return [];
    }
  }, []);

  // Add item to sync queue
  const addToSyncQueue = useCallback(async (item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'synced'>) => {
    try {
      const database = await openDB();
      const tx = database.transaction(SYNC_QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(SYNC_QUEUE_STORE);

      const queueItem: SyncQueueItem = {
        ...item,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        synced: false,
      };

      store.add(queueItem);

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
          updatePendingSyncCount();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error adding to sync queue:', error);
      throw error;
    }
  }, []);

  // Get pending sync items
  const getPendingSyncItems = useCallback(async (): Promise<SyncQueueItem[]> => {
    try {
      const database = await openDB();
      const tx = database.transaction(SYNC_QUEUE_STORE, 'readonly');
      const store = tx.objectStore(SYNC_QUEUE_STORE);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting pending sync items:', error);
      return [];
    }
  }, []);

  // Mark sync item as completed
  const markSynced = useCallback(async (id: string) => {
    try {
      const database = await openDB();
      const tx = database.transaction(SYNC_QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(SYNC_QUEUE_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        const item = request.result;
        if (item) {
          item.synced = true;
          store.put(item);
        }
      };

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
          updatePendingSyncCount();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error marking synced:', error);
      throw error;
    }
  }, []);

  // Save draft
  const saveDraft = useCallback(async (jobId: string, team: string, data: any) => {
    try {
      const database = await openDB();
      const tx = database.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);

      const draft: Draft = {
        id: `${team}-${jobId}`,
        jobId,
        teamId: team,
        data,
        savedAt: new Date().toISOString(),
      };

      store.put(draft);

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error saving draft:', error);
      throw error;
    }
  }, []);

  // Get draft
  const getDraft = useCallback(async (jobId: string, team: string): Promise<Draft | null> => {
    try {
      const database = await openDB();
      const tx = database.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const request = store.get(`${team}-${jobId}`);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting draft:', error);
      return null;
    }
  }, []);

  // Clear draft
  const clearDraft = useCallback(async (jobId: string, team: string) => {
    try {
      const database = await openDB();
      const tx = database.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      store.delete(`${team}-${jobId}`);

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error clearing draft:', error);
      throw error;
    }
  }, []);

  return {
    isOnline,
    pendingSyncCount,
    lastSyncTime,
    cacheJobs,
    getCachedJobs,
    addToSyncQueue,
    getPendingSyncItems,
    markSynced,
    saveDraft,
    getDraft,
    clearDraft,
    updateLastSyncTime,
  };
};
