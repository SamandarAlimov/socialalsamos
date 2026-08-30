import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  $setBlocksType,
} from '@lexical/selection';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  Palette,
  Quote,
  Type,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TEXT_COLORS,
  type InlineToken,
  type RichBlock,
  type TextColorId,
} from '@/lib/richText';
import {
  RICH_TEXT_DOCUMENT_KIND,
  RICH_TEXT_DOCUMENT_VERSION,
  type AlsamosRichTextDocument,
} from '@/lib/richTextDocument';
import { HashtagSuggestions } from '@/components/HashtagSuggestions';

export interface RichTextComposerValue {
  plainText: string;
  formattedContent: AlsamosRichTextDocument;
}

interface RichTextComposerProps {
  value?: AlsamosRichTextDocument | null;
  onChange: (value: RichTextComposerValue) => void;
  placeholder?: string;
  className?: string;
}

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet';

const theme = {
  paragraph: 'mb-1 min-h-[1.5rem]',
  heading: {
    h1: 'mb-1 text-xl font-bold leading-tight',
    h2: 'mb-1 text-lg font-bold leading-tight',
    h3: 'mb-1 text-base font-semibold leading-tight',
  },
  quote: 'my-1 border-l-2 border-primary/60 pl-3 text-muted-foreground',
  list: {
    ul: 'my-1 list-disc pl-6',
    listitem: 'my-0.5',
  },
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline underline-offset-2',
    strikethrough: 'line-through',
    underlineStrikethrough: 'underline line-through underline-offset-2',
    code: 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]',
  },
};

function colorIdFromStyle(style: string): TextColorId | undefined {
  const normalized = style.toLowerCase().replace(/\s+/g, '');
  return TEXT_COLORS.find((color) => normalized.includes(`color:${color.cssValue.toLowerCase()}`))
    ?.id;
}

function tokensFromNode(node: LexicalNode): InlineToken[] {
  if ($isTextNode(node)) {
    const text = node.getTextContent();
    if (!text) return [];
    return [
      {
        text,
        bold: node.hasFormat('bold') || undefined,
        italic: node.hasFormat('italic') || undefined,
        strike: node.hasFormat('strikethrough') || undefined,
        underline: node.hasFormat('underline') || undefined,
        code: node.hasFormat('code') || undefined,
        color: colorIdFromStyle(node.getStyle()),
      },
    ];
  }

  if ($isLineBreakNode(node)) return [{ text: '\n' }];

  const element = node as Partial<ElementNode>;
  if (typeof element.getChildren !== 'function') return [];

  return element.getChildren().flatMap((child) => tokensFromNode(child));
}

function blockFromElement(node: LexicalNode): RichBlock[] {
  if ($isListNode(node)) {
    return node
      .getChildren()
      .filter($isListItemNode)
      .map((item) => ({ type: 'bullet' as const, tokens: tokensFromNode(item) }));
  }

  const tokens = tokensFromNode(node);

  if ($isHeadingNode(node)) {
    const tag = node.getTag();
    return [{ type: tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3', tokens }];
  }
  if ($isQuoteNode(node)) return [{ type: 'quote', tokens }];

  return [{ type: 'paragraph', tokens }];
}

function textNodeFromToken(token: InlineToken) {
  const node = $createTextNode(token.text);

  if (token.bold) node.toggleFormat('bold');
  if (token.italic) node.toggleFormat('italic');
  if (token.strike) node.toggleFormat('strikethrough');
  if (token.underline) node.toggleFormat('underline');
  if (token.code) node.toggleFormat('code');

  if (token.color) {
    const color = TEXT_COLORS.find((item) => item.id === token.color);
    if (color) node.setStyle(`color: ${color.cssValue}`);
  }

  return node;
}

function appendTokens(parent: ElementNode, tokens: InlineToken[]) {
  for (const token of tokens) {
    parent.append(textNodeFromToken(token));
  }
}

function initializeFromDocument(document: AlsamosRichTextDocument | null | undefined) {
  const root = $getRoot();
  root.clear();

  if (!document || document.blocks.length === 0) {
    root.append($createParagraphNode());
    return;
  }

  for (const block of document.blocks) {
    if (block.type === 'bullet') {
      const list = $createListNode('bullet');
      const item = $createListItemNode();
      appendTokens(item, block.tokens);
      list.append(item);
      root.append(list);
      continue;
    }

    if (block.type === 'quote') {
      const quote = $createQuoteNode();
      appendTokens(quote, block.tokens);
      root.append(quote);
      continue;
    }

    if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      const heading = $createHeadingNode(block.type);
      appendTokens(heading, block.tokens);
      root.append(heading);
      continue;
    }

    const paragraph = $createParagraphNode();
    appendTokens(paragraph, block.tokens);
    root.append(paragraph);
  }
}

function serializeEditorState(editorState: EditorState): RichTextComposerValue {
  const blocks: RichBlock[] = [];

  editorState.read(() => {
    for (const child of $getRoot().getChildren()) {
      blocks.push(...blockFromElement(child));
    }
  });

  const document: AlsamosRichTextDocument = {
    kind: RICH_TEXT_DOCUMENT_KIND,
    version: RICH_TEXT_DOCUMENT_VERSION,
    blocks,
    lexical: editorState.toJSON(),
  };

  const plainText = blocks
    .map((block) => block.tokens.map((token) => token.text).join(''))
    .join('\n');

  return { plainText, formattedContent: document };
}

function EditorBridge({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95',
        active && 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </button>
  );
}

function RichToolbar() {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState<Partial<Record<TextFormatType, boolean>>>({});
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [color, setColor] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setFormats({
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
    });

    setColor($getSelectionStyleValueForProperty(selection, 'color', ''));

    const anchor = selection.anchor.getNode();
    const top = anchor.getTopLevelElementOrThrow();
    if ($isHeadingNode(top)) {
      const tag = top.getTag();
      setBlockType(tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3');
    } else if ($isQuoteNode(top)) {
      setBlockType('quote');
    } else if ($isListNode(top)) {
      setBlockType('bullet');
    } else {
      setBlockType('paragraph');
    }
  }, []);

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    });
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterUpdate();
      unregisterSelection();
    };
  }, [editor, updateToolbar]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const setBlock = (next: BlockType) => {
    if (next === 'bullet') {
      editor.dispatchCommand(
        blockType === 'bullet' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
        undefined,
      );
      return;
    }

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const target = blockType === next ? 'paragraph' : next;
      if (target === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode());
      } else if (target === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode());
      } else {
        $setBlocksType(
          selection,
          () => $createHeadingNode(target as 'h1' | 'h2' | 'h3'),
        );
      }
    });
  };

  const setTextColor = (id: TextColorId) => {
    const item = TEXT_COLORS.find((entry) => entry.id === id);
    if (!item) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { color: item.cssValue });
      }
    });
  };

  const inline: Array<[TextFormatType, string, typeof Bold]> = [
    ['bold', 'Qalin', Bold],
    ['italic', 'Qiya', Italic],
    ['strikethrough', 'Chizilgan', Strikethrough],
    ['underline', 'Tagi chizilgan', Underline],
    ['code', 'Kod', Code],
  ];

  const blocks: Array<[BlockType, string, typeof Heading1]> = [
    ['h1', 'Sarlavha 1', Heading1],
    ['h2', 'Sarlavha 2', Heading2],
    ['h3', 'Sarlavha 3', Heading3],
    ['quote', 'Sitata', Quote],
    ['bullet', 'Ro‘yxat', List],
  ];

  return (
    <div className="border-b border-border/50 pb-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Formatlash"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition',
            open
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Type className="h-4 w-4" />
          <span>Aa</span>
        </button>

        {(formats.bold ||
          formats.italic ||
          formats.underline ||
          formats.strikethrough ||
          formats.code ||
          blockType !== 'paragraph' ||
          color) && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            Format faol
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-border/60 bg-background p-2 shadow-sm">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {inline.map(([format, label, Icon]) => (
              <ToolbarButton
                key={format}
                active={Boolean(formats[format])}
                label={label}
                onClick={() => formatText(format)}
              >
                <Icon className="h-4 w-4" />
              </ToolbarButton>
            ))}

            <span className="mx-1 h-5 w-px shrink-0 bg-border" />

            {blocks.map(([format, label, Icon]) => (
              <ToolbarButton
                key={format}
                active={blockType === format}
                label={label}
                onClick={() => setBlock(format)}
              >
                <Icon className="h-4 w-4" />
              </ToolbarButton>
            ))}

            <span className="mx-1 h-5 w-px shrink-0 bg-border" />

            <button
              type="button"
              title="Rang"
              aria-label="Rang"
              aria-expanded={showColors}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowColors((current) => !current)}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground',
                showColors && 'bg-primary/10 text-primary',
              )}
            >
              <Palette className="h-4 w-4" />
            </button>
          </div>

          {showColors && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto border-t border-border/50 pt-2">
              {TEXT_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setTextColor(item.id)}
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-full border-2 transition-transform hover:scale-110',
                    color.toLowerCase() === item.cssValue.toLowerCase()
                      ? 'border-foreground ring-2 ring-primary/25'
                      : 'border-background ring-1 ring-border',
                  )}
                  style={{ backgroundColor: item.cssValue }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RichTextComposer({
  value,
  onChange,
  placeholder = 'Nima yangilik?',
  className,
}: RichTextComposerProps) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const initialValueRef = useRef<AlsamosRichTextDocument | null | undefined>(value);
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);

  const initialConfig = useMemo(() => {
    const initialValue = initialValueRef.current;

    return {
      namespace: 'AlsamosPostComposer',
      theme,
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
      editorState:
        initialValue?.lexical && typeof initialValue.lexical === 'object'
          ? JSON.stringify(initialValue.lexical)
          : initialValue
            ? () => initializeFromDocument(initialValue)
            : undefined,
      onError(error: Error) {
        throw error;
      },
    };
  }, []);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const serialized = serializeEditorState(editorState);
      onChange(serialized);

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setHashtagQuery(null);
          return;
        }

        const anchor = selection.anchor.getNode();
        if (!$isTextNode(anchor)) {
          setHashtagQuery(null);
          return;
        }

        const before = anchor.getTextContent().slice(0, selection.anchor.offset);
        const match = before.match(/#([\p{L}\p{N}_]*)$/u);
        setHashtagQuery(match ? match[1] : null);
      });
    },
    [onChange],
  );

  const insertHashtag = useCallback((tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

      const anchor = selection.anchor.getNode();
      if (!$isTextNode(anchor)) {
        selection.insertText('#' + tag + ' ');
        return;
      }

      const offset = selection.anchor.offset;
      const before = anchor.getTextContent().slice(0, offset);
      const match = before.match(/#([\p{L}\p{N}_]*)$/u);

      if (!match) {
        selection.insertText('#' + tag + ' ');
        return;
      }

      anchor.spliceText(offset - match[0].length, match[0].length, '#' + tag + ' ', true);
    });

    setHashtagQuery(null);
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn('relative p-0', className)}>
        <RichToolbar />
        <div className="relative mt-2 min-h-[130px]">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-[130px] w-full whitespace-pre-wrap break-words bg-transparent text-sm leading-relaxed outline-none"
                aria-label={placeholder}
                spellCheck
              />
            }
            placeholder={
              <div className="pointer-events-none absolute left-0 top-0 text-sm text-muted-foreground">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          <EditorBridge onReady={(editor) => (editorRef.current = editor)} />
        </div>

        {hashtagQuery !== null && (
          <HashtagSuggestions
            query={hashtagQuery}
            onSelect={insertHashtag}
            className="mt-2"
          />
        )}
      </div>
    </LexicalComposer>
  );
}
