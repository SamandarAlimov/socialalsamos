
-- Function to extract mentioned usernames and create notifications
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mentioned_username TEXT;
  mentioned_user_id UUID;
  author_name TEXT;
  content_preview TEXT;
BEGIN
  -- Get author name
  SELECT display_name INTO author_name FROM profiles WHERE id = NEW.user_id;
  
  -- Extract @mentions using regex and loop through them
  FOR mentioned_username IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  LOOP
    -- Find user by username
    SELECT id INTO mentioned_user_id FROM profiles WHERE username = mentioned_username;
    
    -- Only notify if user exists and is not the author
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
      content_preview := LEFT(NEW.content, 100);
      
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        mentioned_user_id,
        'mention',
        'New Mention',
        COALESCE(author_name, 'Someone') || ' mentioned you',
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'mentioner_id', NEW.user_id,
          'content_preview', content_preview
        )
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Function for post mentions
CREATE OR REPLACE FUNCTION public.notify_on_post_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mentioned_username TEXT;
  mentioned_user_id UUID;
  author_name TEXT;
  content_preview TEXT;
BEGIN
  -- Get author name
  SELECT display_name INTO author_name FROM profiles WHERE id = NEW.user_id;
  
  -- Extract @mentions using regex
  FOR mentioned_username IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  LOOP
    SELECT id INTO mentioned_user_id FROM profiles WHERE username = mentioned_username;
    
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
      content_preview := LEFT(NEW.content, 100);
      
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        mentioned_user_id,
        'mention',
        'New Mention',
        COALESCE(author_name, 'Someone') || ' mentioned you in a post',
        jsonb_build_object(
          'post_id', NEW.id,
          'mentioner_id', NEW.user_id,
          'content_preview', content_preview
        )
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Create triggers for mentions
DROP TRIGGER IF EXISTS on_comment_mention ON comments;
CREATE TRIGGER on_comment_mention
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_mention();

DROP TRIGGER IF EXISTS on_post_mention ON posts;
CREATE TRIGGER on_post_mention
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_post_mention();
