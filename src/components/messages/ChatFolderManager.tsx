import { useState } from 'react';
import {
  Archive,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Folder,
  Mail,
  Megaphone,
  Plus,
  Star,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  ChatFolder,
  ChatFolderIcon,
  FOLDER_ICON_OPTIONS,
  FOLDER_PRESETS,
  MAX_FOLDER_NAME,
} from '@/lib/chatFolders';

const ICONS: Record<ChatFolderIcon, typeof Folder> = {
  all: Folder,
  unread: Mail,
  personal: User,
  groups: Users,
  channels: Megaphone,
  favorites: Star,
  work: Briefcase,
  archive: Archive,
  custom: Folder,
};

interface ChatFolderManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: ChatFolder[];
  canAddFolder: boolean;
  onAddPreset: (presetKey: string) => void;
  onAddEmpty: () => void;
  onUpdate: (id: string, patch: Partial<ChatFolder>) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
}

/**
 * Papkalarni yaratish, tahrirlash va tartiblash oynasi.
 * Telegramdagi "Papkalar" sozlamalariga o'xshash tuzilma.
 */
export function ChatFolderManager({
  open,
  onOpenChange,
  folders,
  canAddFolder,
  onAddPreset,
  onAddEmpty,
  onUpdate,
  onRemove,
  onReorder,
}: ChatFolderManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 text-left">
          <SheetTitle>Chat papkalari</SheetTitle>
          <SheetDescription>
            Chatlarni turlariga qarab guruhlab, ro'yxatni toza saqlang.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {/* Tayyor shablonlar */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Tavsiya etilgan papkalar
            </p>
            <div className="flex flex-wrap gap-2">
              {FOLDER_PRESETS.map((preset) => {
                const Icon = ICONS[preset.icon] || Folder;
                return (
                  <Button
                    key={preset.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!canAddFolder}
                    onClick={() => onAddPreset(preset.key)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {preset.name}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!canAddFolder}
                onClick={onAddEmpty}
              >
                <Plus className="h-3.5 w-3.5" />
                Bo'sh papka
              </Button>
            </div>
            {!canAddFolder && (
              <p className="mt-2 text-xs text-muted-foreground">
                Papkalar soni chegarasiga yetdi.
              </p>
            )}
          </div>

          {/* Mavjud papkalar */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Mening papkalarim
            </p>

            {folders.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Hali papka yo'q. Yuqoridagi shablonlardan birini tanlang.
              </p>
            )}

            {folders.map((folder, index) => {
              const Icon = ICONS[folder.icon] || Folder;
              const isExpanded = expandedId === folder.id;
              return (
                <div key={folder.id} className="rounded-2xl border border-border bg-card">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                      onClick={() => setExpandedId(isExpanded ? null : folder.id)}
                    >
                      {folder.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === 0}
                      onClick={() => onReorder(folder.id, -1)}
                      aria-label="Yuqoriga"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === folders.length - 1}
                      onClick={() => onReorder(folder.id, 1)}
                      aria-label="Pastga"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onRemove(folder.id)}
                      aria-label="Papkani o'chirish"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`folder-name-${folder.id}`} className="text-xs">
                          Papka nomi
                        </Label>
                        <Input
                          id={`folder-name-${folder.id}`}
                          value={folder.name}
                          maxLength={MAX_FOLDER_NAME}
                          onChange={(event) =>
                            onUpdate(folder.id, { name: event.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Belgi</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {FOLDER_ICON_OPTIONS.map((iconKey) => {
                            const OptionIcon = ICONS[iconKey] || Folder;
                            return (
                              <button
                                key={iconKey}
                                type="button"
                                onClick={() => onUpdate(folder.id, { icon: iconKey })}
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full border tg-transition',
                                  folder.icon === iconKey
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                                )}
                                aria-label={iconKey}
                              >
                                <OptionIcon className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <FolderSwitch
                        id={`private-${folder.id}`}
                        label="Shaxsiy suhbatlar"
                        checked={folder.filters.includePrivate}
                        onChange={(value) =>
                          onUpdate(folder.id, { filters: { ...folder.filters, includePrivate: value } })
                        }
                      />
                      <FolderSwitch
                        id={`groups-${folder.id}`}
                        label="Guruhlar"
                        checked={folder.filters.includeGroups}
                        onChange={(value) =>
                          onUpdate(folder.id, { filters: { ...folder.filters, includeGroups: value } })
                        }
                      />
                      <FolderSwitch
                        id={`channels-${folder.id}`}
                        label="Kanallar"
                        checked={folder.filters.includeChannels}
                        onChange={(value) =>
                          onUpdate(folder.id, {
                            filters: { ...folder.filters, includeChannels: value },
                          })
                        }
                      />
                      <FolderSwitch
                        id={`unread-${folder.id}`}
                        label="Faqat o'qilmaganlar"
                        checked={folder.filters.onlyUnread}
                        onChange={(value) =>
                          onUpdate(folder.id, { filters: { ...folder.filters, onlyUnread: value } })
                        }
                      />
                      <FolderSwitch
                        id={`muted-${folder.id}`}
                        label="Ovozi o'chirilganlarni yashirish"
                        checked={folder.filters.excludeMuted}
                        onChange={(value) =>
                          onUpdate(folder.id, { filters: { ...folder.filters, excludeMuted: value } })
                        }
                      />

                      {(folder.filters.includedIds.length > 0 ||
                        folder.filters.excludedIds.length > 0) && (
                        <p className="text-xs text-muted-foreground">
                          Qo'lda qo'shilgan: {folder.filters.includedIds.length} \u00b7 chiqarilgan:{' '}
                          {folder.filters.excludedIds.length}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FolderSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
