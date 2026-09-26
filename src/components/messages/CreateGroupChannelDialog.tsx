import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type ChatType = 'group' | 'channel';

interface CreateGroupChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversationId: string) => void;
  defaultType?: ChatType;
}

/**
 * Compatibility adapter for legacy MessagesPage callers.
 * Group/channel creation is now a real page-level flow instead of a modal.
 */
export function CreateGroupChannelDialog({
  open,
  onOpenChange,
  defaultType,
}: CreateGroupChannelDialogProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    onOpenChange(false);
    navigate(`/messages/new/${defaultType || 'group'}`);
  }, [open, onOpenChange, navigate, defaultType]);

  return null;
}
