import { supabase } from '../supabase';
import { getTransportManager } from '../chat/TransportManager';
import { decodeEmergencyMessage } from '../chat/emergency';
import type { RealtimeChannel } from '@supabase/supabase-js';

class BridgeManager {
  private active = false;
  private channel: RealtimeChannel | null = null;
  private unsubMesh: (() => void) | null = null;
  private userId: string | null = null;

  public async start(userId: string) {
    if (this.active) return;
    this.active = true;
    this.userId = userId;

    console.log('[Bridge] Starting Gateway Mode');

    // 1. Subscribe to Mesh transport to forward Mesh -> Internet
    const tm = getTransportManager();
    // Assuming the active transport is mesh-based if we are a gateway
    const transports = tm.getTransports();
    const meshTransports = transports.filter((t) => t.info.kind !== 'internet');

    for (const meshTransport of meshTransports) {
      if (await meshTransport.isAvailable()) {
        this.unsubMesh = meshTransport.onMessage(async (msg) => {
        console.log('[Bridge] Received message from Mesh:', msg);
        
        // Try to decode as emergency message
        const em = decodeEmergencyMessage(msg.body);
        if (em) {
          console.log('[Bridge] Forwarding Mesh Emergency to Internet Community Alerts');
          
          // Generate a deterministic or random location if we don't have one?
          // The sender might have included lat/lon in the emergency message
          const lat = em.lat ?? 0;
          const lon = em.lon ?? 0;

          if (lat === 0 && lon === 0) {
            console.warn('[Bridge] No location in emergency message, skipping internet forward for now.');
            return;
          }

          // Write to community alerts
          await supabase.from('community_alerts').insert({
            user_id: this.userId, // We act as the relayer
            category: em.category,
            message: `[Relayed from Mesh Node ${msg.senderId}] ${em.text}`,
            lat,
            lon,
            radius_m: 5000,
          });
        } else {
          console.log('[Bridge] Forwarding Normal Mesh Message to Internet');
          // For normal text messages without a known recipient UUID, we store them as community alerts with category 'other'
          // Alternatively, if we had a node_id -> user_id mapping, we could insert into 'messages' directly.
          await supabase.from('community_alerts').insert({
            user_id: this.userId, // We act as the relayer
            category: 'other',
            message: `[Relayed from Mesh Node ${msg.senderId}] ${msg.body}`,
            lat: 0,
            lon: 0,
            radius_m: 5000, // broadcast widely
          });
        }
      });
      }
    }

    // 2. Subscribe to Supabase to forward Internet -> Mesh
    this.channel = supabase
      .channel('mesh_relay_queue')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mesh_relay_queue',
          filter: `status=eq.pending`,
        },
        async (payload) => {
          const row = payload.new as any;
          console.log('[Bridge] Picked up message from Internet relay queue:', row.id);

          // Mark as processing
          await supabase
            .from('mesh_relay_queue')
            .update({ status: 'processing', picked_up_by: this.userId, picked_up_at: new Date().toISOString() })
            .eq('id', row.id);

          try {
            // Find active mesh transport
            const currentTm = getTransportManager();
            const transports = currentTm.getTransports();
            let currentMesh = null;
            for (const t of transports) {
              if (t.info.kind !== 'internet' && await t.isAvailable()) {
                currentMesh = t;
                break;
              }
            }
            
            if (!currentMesh) {
              throw new Error('No active mesh connection to relay over');
            }

            // Send via mesh
            await currentMesh.send({
              senderId: this.userId || 'bridge',
              recipientId: null, // broadcast
              body: row.content,
            });

            // Mark as completed
            await supabase
              .from('mesh_relay_queue')
              .update({ status: 'completed' })
              .eq('id', row.id);
            
            console.log('[Bridge] Successfully relayed message to Mesh');
          } catch (err) {
            console.error('[Bridge] Failed to relay message:', err);
            // Revert to pending so another gateway might pick it up
            await supabase
              .from('mesh_relay_queue')
              .update({ status: 'pending', picked_up_by: null, picked_up_at: null })
              .eq('id', row.id);
          }
        }
      )
      .subscribe();
  }

  public stop() {
    if (!this.active) return;
    this.active = false;
    this.userId = null;
    
    console.log('[Bridge] Stopping Gateway Mode');

    if (this.unsubMesh) {
      this.unsubMesh();
      this.unsubMesh = null;
    }

    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

export const bridgeManager = new BridgeManager();
