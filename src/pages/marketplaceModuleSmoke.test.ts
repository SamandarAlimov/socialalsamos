// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { checkoutAddressFromLocationLabel } from '@/lib/marketplaceDeliveryAddress';

describe('Marketplace route modules', () => {
  it('loads the Marketplace browse module without a module-initialization crash', async () => {
    const module = await import('./MarketplacePage');
    expect(module.default).toBeTypeOf('function');
  });

  it('loads the product detail module without a module-initialization crash', async () => {
    const module = await import('./MarketplaceProductPage');
    expect(module.default).toBeTypeOf('function');
  });

  it('loads the isolated product editor without a module-initialization crash', async () => {
    const module = await import('./MarketplaceProductEditPage');
    expect(module.default).toBeTypeOf('function');
  });
});

describe('Marketplace checkout location autofill', () => {
  it('maps a reverse-geocoded Uzbekistan label into street, city and region', () => {
    expect(
      checkoutAddressFromLocationLabel('Urtabuz Street, Karasay, Jizzakh Province, Uzbekistan'),
    ).toEqual({
      street: 'Urtabuz Street',
      city: 'Karasay',
      region: 'Jizzakh Province',
    });
  });

  it('does not put raw coordinates into delivery address fields', () => {
    expect(checkoutAddressFromLocationLabel('40.08278, 67.72182')).toEqual({
      street: '',
      city: '',
      region: '',
    });
  });
});
