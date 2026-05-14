-- Phase 8 schema updates
-- Run this to update existing tables for Groups & Emergency Channels

-- 1. Add type and psk to chat_rooms for Mesh Channels
ALTER TABLE public.chat_rooms 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'internet';

ALTER TABLE public.chat_rooms 
ADD COLUMN IF NOT EXISTS psk TEXT;

-- 2. Add is_emergency_contact to friendships
ALTER TABLE public.friendships 
ADD COLUMN IF NOT EXISTS is_emergency_contact BOOLEAN DEFAULT false;

-- Notify realtime clients about changes to chat_rooms (already enabled in schema-chat.sql, but ensuring here)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
