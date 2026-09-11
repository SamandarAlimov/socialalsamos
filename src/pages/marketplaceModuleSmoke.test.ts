// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

describe('Marketplace route modules', () => {
  it('loads the Marketplace browse module without a module-initialization crash', async () => {
    const module = await import('./MarketplacePage');
    expect(module.default).toBeTypeOf('function');
  });

  it('loads the product detail module without a module-initialization crash', async () => {
    const module = await import('./MarketplaceProductPage');
    expect(module.default).toBeTypeOf('function');
  });

  it('loads the owner product editor without a module-initialization crash', async () => {
    const module = await import('./MarketplaceProductEditPage');
    expect(module.default).toBeTypeOf('function');
  });
});
