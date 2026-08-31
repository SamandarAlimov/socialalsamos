import { cn } from '@/lib/utils';
import {
  buildComposerTools,
  type ComposerToolsInput,
} from '@/components/create/PostComposerToolbar';

interface CreateToolRailProps {
  tools: ComposerToolsInput;
  className?: string;
  /** Media ustida vertikal, tor ekranlarda gorizontal ham bo'lishi mumkin. */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * Media ustida turuvchi doiraviy shisha asboblar rail'i.
 *
 * Sirt tokenlari xarita panelidan olingan (blur + yarim shaffof fon + yupqa
 * chegara), ikonkalar esa faqat vector: emoji yoki rasm ishlatilmaydi.
 */
export function CreateToolRail({
  tools,
  className,
  orientation = 'vertical',
}: CreateToolRailProps) {
  const items = buildComposerTools(tools);

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full border border-white/15 bg-black/45 p-1.5 shadow-2xl backdrop-blur-2xl',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      {items.map(({ id, label, icon: Icon, action, disabled, active }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          onClick={action}
          disabled={disabled}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30',
            active && 'bg-white text-black hover:bg-white hover:text-black',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </button>
      ))}
    </div>
  );
}

export default CreateToolRail;
