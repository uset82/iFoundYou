-- Add is_gateway flag to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_gateway BOOLEAN DEFAULT false;

-- Create the mesh_relay_queue table
CREATE TABLE IF NOT EXISTS public.mesh_relay_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    channel TEXT DEFAULT 'broadcast',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    picked_up_at TIMESTAMP WITH TIME ZONE,
    picked_up_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Enable RLS on the relay queue
ALTER TABLE public.mesh_relay_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can insert into the queue
CREATE POLICY "Authenticated users can enqueue relay messages" 
ON public.mesh_relay_queue FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Policy: Gateway users can select from the queue
CREATE POLICY "Gateway users can view the relay queue" 
ON public.mesh_relay_queue FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.is_gateway = true
  )
);

-- Policy: Gateway users can update the queue (to mark as processing/completed)
CREATE POLICY "Gateway users can update the relay queue" 
ON public.mesh_relay_queue FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.is_gateway = true
  )
);

-- Enable Realtime for the relay queue so gateways can listen for new messages instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesh_relay_queue;
