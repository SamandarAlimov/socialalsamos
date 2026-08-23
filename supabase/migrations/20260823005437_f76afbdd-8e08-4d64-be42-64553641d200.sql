-- Mesh (P2P) topology has no SFU/media server: each publisher uploads one
-- stream per viewer. These caps reflect what a browser can actually sustain.
CREATE OR REPLACE FUNCTION public._rtc_capacity_for_mode(p_call_mode text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_call_mode, 'direct')
    WHEN 'direct' THEN 2
    WHEN 'group' THEN 8
    WHEN 'conference' THEN 12
    WHEN 'channel_stream' THEN 30
    ELSE 8
  END;
$$;