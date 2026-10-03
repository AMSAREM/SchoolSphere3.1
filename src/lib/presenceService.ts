import { supabase } from './supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUserPayload {
  userId: string | number;
  authUserId?: string;
  username: string;
  fullName?: string;
  email?: string;
  role?: string;
  schoolId?: string | null;
  schoolName?: string;
  loginTimestamp?: number;
  lastActiveTimestamp?: number;
  authStatus?: string;
  isOnline?: boolean;
  [key: string]: any;
}

export type PresenceListener = (users: PresenceUserPayload[], rawState: Record<string, any[]>) => void;

class PresenceService {
  private channel: RealtimeChannel | null = null;
  private listeners: Set<PresenceListener> = new Set();
  private pendingTrackPayload: PresenceUserPayload | null = null;
  private isSubscribed: boolean = false;
  private channelTopic = 'schoolsphere:live_presence';

  /**
   * Extract and normalize presence users from raw presenceState
   */
  public extractPresenceUsers(rawState?: Record<string, any[]>): PresenceUserPayload[] {
    const state = rawState || (this.channel ? this.channel.presenceState() : {}) || {};
    const extracted: PresenceUserPayload[] = [];

    Object.values(state).forEach((presences: any) => {
      if (Array.isArray(presences)) {
        presences.forEach((p: any) => {
          if (p && (p.username || p.email || p.userId)) {
            extracted.push({
              ...p,
              isOnline: true,
              lastActiveTimestamp: Number(p.lastActiveTimestamp || Date.now()),
              loginTimestamp: Number(p.loginTimestamp || Date.now()),
              authStatus: p.authStatus || 'Authenticated'
            });
          }
        });
      }
    });

    return extracted;
  }

  private notifyListeners(): void {
    if (!this.channel) return;
    try {
      const rawState = this.channel.presenceState() || {};
      const users = this.extractPresenceUsers(rawState);
      this.listeners.forEach((listener) => {
        try {
          listener(users, rawState);
        } catch (err) {
          console.warn('[PresenceService] Listener error:', err);
        }
      });
    } catch {}
  }

  /**
   * Initialize or return the shared presence channel.
   * Ensures callbacks are ALWAYS registered before subscribe() is invoked.
   */
  public getOrCreateChannel(presenceKey?: string): RealtimeChannel {
    if (this.channel) {
      return this.channel;
    }

    // Check if client already has a channel with this topic
    const existingChannels = typeof supabase.getChannels === 'function' ? supabase.getChannels() : [];
    const existingChannel = existingChannels.find((c: any) =>
      c.topic === `realtime:${this.channelTopic}` || c.subTopic === this.channelTopic
    );

    if (existingChannel) {
      // If it is already registered, remove it safely so we can bind callbacks before subscribing
      try {
        supabase.removeChannel(existingChannel);
      } catch {}
    }

    const channelConfig: any = {};
    if (presenceKey) {
      channelConfig.config = { presence: { key: presenceKey } };
    }

    const ch = supabase.channel(this.channelTopic, channelConfig);

    // CRITICAL: Attach presence callbacks BEFORE subscribe()
    ch.on('presence', { event: 'sync' }, () => {
      this.notifyListeners();
    })
    .on('presence', { event: 'join' }, () => {
      this.notifyListeners();
    })
    .on('presence', { event: 'leave' }, () => {
      this.notifyListeners();
    });

    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        this.isSubscribed = true;
        this.notifyListeners();

        // If there was a pending track payload queued, track it now
        if (this.pendingTrackPayload) {
          const payload = this.pendingTrackPayload;
          this.pendingTrackPayload = null;
          try {
            await ch.track(payload);
          } catch (trackErr) {
            console.warn('[PresenceService] Failed to track presence:', trackErr);
          }
        }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.isSubscribed = false;
      }
    });

    this.channel = ch;
    return ch;
  }

  /**
   * Subscribe a component to presence updates.
   * Returns an unsubscribe cleanup function.
   * Calls the listener immediately with any already known presence state.
   */
  public subscribeToPresence(listener: PresenceListener): () => void {
    this.listeners.add(listener);

    // Ensure the channel is initialized
    this.getOrCreateChannel();

    // Immediately deliver current state if available
    if (this.channel && this.isSubscribed) {
      try {
        const rawState = this.channel.presenceState() || {};
        const users = this.extractPresenceUsers(rawState);
        listener(users, rawState);
      } catch {}
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Track current authenticated user presence in the shared channel.
   */
  public async trackPresence(userPayload: PresenceUserPayload, presenceKey?: string): Promise<void> {
    const ch = this.getOrCreateChannel(presenceKey);

    if (this.isSubscribed) {
      try {
        await ch.track(userPayload);
      } catch (err) {
        console.warn('[PresenceService] Error tracking presence:', err);
      }
    } else {
      // Queue it until SUBSCRIBED
      this.pendingTrackPayload = userPayload;
    }
  }

  /**
   * Untrack current user presence (e.g. on logout).
   */
  public async untrackPresence(): Promise<void> {
    this.pendingTrackPayload = null;
    if (this.channel && this.isSubscribed) {
      try {
        await this.channel.untrack();
      } catch {}
    }
  }

  /**
   * Get current online users count & array
   */
  public getCurrentUsers(): PresenceUserPayload[] {
    return this.extractPresenceUsers();
  }

  public getChannel(): RealtimeChannel | null {
    return this.channel;
  }
}

export const presenceService = new PresenceService();
