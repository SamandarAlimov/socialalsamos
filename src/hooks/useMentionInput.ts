import { useState, useCallback, useRef } from 'react';

interface MentionState {
  isActive: boolean;
  query: string;
  startIndex: number;
}

export function useMentionInput() {
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: '',
    startIndex: -1,
  });

  const detectMention = useCallback((value: string, cursorPosition: number) => {
    // Look backwards from cursor to find @ symbol
    let atIndex = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      const char = value[i];
      // Stop if we hit a space or newline before finding @
      if (char === ' ' || char === '\n') {
        break;
      }
      if (char === '@') {
        atIndex = i;
        break;
      }
    }

    if (atIndex !== -1) {
      const query = value.substring(atIndex + 1, cursorPosition);
      // Valid mention query (alphanumeric and underscore only)
      if (/^[a-zA-Z0-9_]*$/.test(query)) {
        setMentionState({
          isActive: true,
          query,
          startIndex: atIndex,
        });
        return;
      }
    }

    setMentionState({
      isActive: false,
      query: '',
      startIndex: -1,
    });
  }, []);

  const handleInputChange = useCallback((
    value: string, 
    cursorPosition: number,
    onChange: (value: string) => void
  ) => {
    onChange(value);
    detectMention(value, cursorPosition);
  }, [detectMention]);

  const insertMention = useCallback((
    currentValue: string,
    username: string,
    inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  ): string => {
    const { startIndex } = mentionState;
    if (startIndex === -1) return currentValue;

    const beforeMention = currentValue.substring(0, startIndex);
    const cursorPos = inputRef.current?.selectionStart || currentValue.length;
    const afterMention = currentValue.substring(cursorPos);
    
    const newValue = `${beforeMention}@${username} ${afterMention}`;
    
    // Close mention popup
    setMentionState({
      isActive: false,
      query: '',
      startIndex: -1,
    });

    // Set cursor position after the inserted mention
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = startIndex + username.length + 2; // +2 for @ and space
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current.focus();
      }
    }, 0);

    return newValue;
  }, [mentionState]);

  const closeMention = useCallback(() => {
    setMentionState({
      isActive: false,
      query: '',
      startIndex: -1,
    });
  }, []);

  return {
    mentionState,
    handleInputChange,
    insertMention,
    closeMention,
  };
}
