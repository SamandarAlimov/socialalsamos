import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import {
  clearActiveLocalProject,
  setActiveLocalProject,
} from '@/lib/ai/projectsStore';
import AIPageV2 from './AIPageV2';

export default function AIPage() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      clearActiveLocalProject();
      return;
    }

    const projectId = new URLSearchParams(location.search).get('project');
    if (projectId) setActiveLocalProject(user.id, projectId);
    else clearActiveLocalProject();
  }, [location.search, user]);

  return <AIPageV2 />;
}
