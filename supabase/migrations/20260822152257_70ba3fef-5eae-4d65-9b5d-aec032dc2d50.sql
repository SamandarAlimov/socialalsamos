DROP POLICY IF EXISTS "Post media readable by signed-in users" ON storage.objects;
CREATE POLICY "Post media readable by signed-in users" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('chat-media','message-attachments')
  AND (name LIKE '%/create/post/%' OR name LIKE '%/create/story/%' OR name LIKE '%/create/reel/%')
);