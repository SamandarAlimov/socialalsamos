-- Alsamos AI first-party search runs in Edge Functions with a service-role client.
-- RLS bypass alone does not grant table privileges, so the role still needs
-- explicit read access to platform tables used by search and saved-place tools.
grant select on table
  public.posts,
  public.sellers,
  public.products,
  public.product_images,
  public.places,
  public.map_pois,
  public.saved_places,
  public.user_settings
to service_role;
