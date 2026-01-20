-- Create table to store location history points
CREATE TABLE public.location_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_location_history_user_recorded ON public.location_history(user_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access their own location history
CREATE POLICY "Users can view their own location history"
  ON public.location_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own location history"
  ON public.location_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own location history"
  ON public.location_history FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for identified frequent places (home, work, etc.)
CREATE TABLE public.frequent_places (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  place_type TEXT NOT NULL DEFAULT 'other',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  average_stay_minutes INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMP WITH TIME ZONE,
  is_auto_detected BOOLEAN DEFAULT true,
  confidence_score DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for frequent places
CREATE INDEX idx_frequent_places_user ON public.frequent_places(user_id);
CREATE INDEX idx_frequent_places_type ON public.frequent_places(user_id, place_type);

-- Enable RLS
ALTER TABLE public.frequent_places ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own frequent places"
  ON public.frequent_places FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own frequent places"
  ON public.frequent_places FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own frequent places"
  ON public.frequent_places FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own frequent places"
  ON public.frequent_places FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for daily routes summary
CREATE TABLE public.daily_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_date DATE NOT NULL,
  total_distance_km DOUBLE PRECISION DEFAULT 0,
  total_duration_minutes INTEGER DEFAULT 0,
  places_visited INTEGER DEFAULT 0,
  route_geometry JSONB,
  visits_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, route_date)
);

-- Create index for daily routes
CREATE INDEX idx_daily_routes_user_date ON public.daily_routes(user_id, route_date DESC);

-- Enable RLS
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own daily routes"
  ON public.daily_routes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily routes"
  ON public.daily_routes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily routes"
  ON public.daily_routes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily routes"
  ON public.daily_routes FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at on frequent_places
CREATE TRIGGER update_frequent_places_updated_at
  BEFORE UPDATE ON public.frequent_places
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updating updated_at on daily_routes
CREATE TRIGGER update_daily_routes_updated_at
  BEFORE UPDATE ON public.daily_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.frequent_places;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_routes;