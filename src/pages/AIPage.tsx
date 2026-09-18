import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import {
  clearActiveLocalProject,
  setActiveLocalProject,
} from '@/lib/ai/projectsStore';
import { buildAIWorkspaceHref, parseAIWorkspaceLocation } from '@/lib/ai/workspaceUrl';
import AIPageV2 from './AIPageV2';

export default function AIPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const route = parseAIWorkspaceLocation(location.pathname, location.search);

    if (!user) {
      clearActiveLocalProject();
    } else if (route.projectId) {
      setActiveLocalProject(user.id, route.projectId);
    } else {
      clearActiveLocalProject();
    }

    // Keep old shared query-string links working, but immediately replace them
    // with the canonical, professional path URL.
    const legacyParams = new URLSearchParams(location.search);
    if (
      location.pathname === '/ai' &&
      (legacyParams.has('project') || legacyParams.has('chat'))
    ) {
      const canonical = buildAIWorkspaceHref('/ai', location.search, route);
      const current = `${location.pathname}${location.search}`;
      if (canonical !== current) navigate(canonical, { replace: true });
    }
  }, [location.pathname, location.search, navigate, user]);

  return <AIPageV2 />;
}
