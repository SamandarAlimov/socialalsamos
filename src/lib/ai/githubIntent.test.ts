import { describe, expect, it } from 'vitest';

import {
  extractExplicitRepositoryName,
  isRepositoryCreationRequest,
  isSuspiciousGeneratedRepositoryName,
} from '../../../supabase/functions/_shared/aiIntent';

describe('AI GitHub repository intent fidelity', () => {
  it('preserves the exact Uzbek repository name before "deb nomlangan"', () => {
    const text = 'githubda yangi testalsamosai deb nomlangan repo yarat';
    expect(isRepositoryCreationRequest(text)).toBe(true);
    expect(extractExplicitRepositoryName(text)).toBe('testalsamosai');
  });

  it('does not mistake grammar words for repository names', () => {
    expect(isSuspiciousGeneratedRepositoryName('nomlangan')).toBe(true);
    expect(isSuspiciousGeneratedRepositoryName('repo')).toBe(true);
    expect(extractExplicitRepositoryName('testalsamosai nomli repo yaratib ber')).toBe('testalsamosai');
  });

  it('does not execute repository creation for a follow-up question about a past action', () => {
    const text = 'nima uchun hozir "nomlangan" nomli repo yaratdingku';
    expect(isRepositoryCreationRequest(text)).toBe(false);
  });

  it('handles common English create-repository forms', () => {
    expect(isRepositoryCreationRequest('Please create a new repository named testalsamosai')).toBe(true);
    expect(extractExplicitRepositoryName('Please create a new repository named testalsamosai')).toBe('testalsamosai');
    expect(isRepositoryCreationRequest('Why did you create repository testalsamosai?')).toBe(false);
  });

  it('allows an explicitly quoted reserved word when that is really the requested name', () => {
    expect(extractExplicitRepositoryName('"nomlangan" nomli repo yarat')).toBe('nomlangan');
  });
});
