
-- Create storage bucket for mini app icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('mini-app-icons', 'mini-app-icons', true);

-- Allow authenticated users to upload icons
CREATE POLICY "Users can upload mini app icons"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mini-app-icons');

-- Allow everyone to view icons
CREATE POLICY "Anyone can view mini app icons"
ON storage.objects FOR SELECT
USING (bucket_id = 'mini-app-icons');

-- Allow users to delete their own icons
CREATE POLICY "Users can delete their own mini app icons"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mini-app-icons' AND (storage.foldername(name))[1] = auth.uid()::text);
